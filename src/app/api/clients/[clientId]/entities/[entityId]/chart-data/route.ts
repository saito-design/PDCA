import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { loadJsonFromFolder, findFolderByName, getPdcaFolderId, isDriveConfigured, getDriveClient } from '@/lib/drive'

interface Client {
  id: string
  name: string
  drive_folder_id?: string
}

interface KpiData {
  entity_id: string
  entity_name: string
  data_type: string
  columns: string[]
  data: Record<string, unknown>[]
}

// 縦持ちマスターデータ形式
interface MasterDataRecord {
  年月: string
  部門: string
  大項目: string
  中項目: string
  単位: string
  区分: string
  値: number | null
}

interface MasterDataFile {
  company_name: string
  format: string
  columns: string[]
  data: MasterDataRecord[]
  departments?: string[]
}

// *_master_data.json を検索
async function findMasterDataFile(folderId: string): Promise<string | null> {
  if (!isDriveConfigured()) return null
  try {
    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and name contains '_master_data.json'`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const files = res.data.files || []
    if (files.length > 0) {
      return files[0].name || null
    }
    return null
  } catch {
    return null
  }
}

// 縦持ちデータを横持ち（グラフ用）に変換
function pivotMasterData(data: MasterDataRecord[]): Record<string, unknown>[] {
  // フィルタなし - 全データを使用

  // 年月でグループ化
  const byMonth = new Map<string, Record<string, unknown>>()

  for (const row of data) {
    if (!byMonth.has(row.年月)) {
      byMonth.set(row.年月, { yearMonth: row.年月 })
    }
    const monthData = byMonth.get(row.年月)!

    // キー名を生成: 区分を含める（実績以外の場合）
    if (row.値 !== null) {
      const key = row.区分 && row.区分 !== '実績'
        ? `${row.中項目}（${row.区分}）`
        : row.中項目
      monthData[key] = row.値
    }
  }

  // 年月でソートして返す
  return Array.from(byMonth.values()).sort((a, b) =>
    String(a.yearMonth).localeCompare(String(b.yearMonth))
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; entityId: string }> }
) {
  try {
    const { clientId, entityId } = await params
    await requireClientAccess(clientId)

    // クライアント情報を取得
    const pdcaFolderId = getPdcaFolderId()
    const clientsResult = await loadJsonFromFolder<Client[]>('clients.json', pdcaFolderId)

    if (!clientsResult) {
      return NextResponse.json({ success: false, error: 'クライアント一覧が見つかりません' }, { status: 500 })
    }

    const client = clientsResult.data.find(c => c.id === clientId)
    if (!client) {
      return NextResponse.json({ success: false, error: 'クライアントが見つかりません' }, { status: 404 })
    }

    // クライアントフォルダを取得
    let clientFolderId: string | null | undefined = client.drive_folder_id
    if (!clientFolderId) {
      clientFolderId = await findFolderByName(client.name, pdcaFolderId)
      if (!clientFolderId) {
        return NextResponse.json({ success: false, error: 'クライアントフォルダが見つかりません' }, { status: 404 })
      }
    }

    // 1. まず *_master_data.json を探す（新形式）
    const masterFileName = await findMasterDataFile(clientFolderId as string)
    if (masterFileName) {
      const masterResult = await loadJsonFromFolder<MasterDataFile>(masterFileName, clientFolderId as string)
      if (masterResult && masterResult.data.data.length > 0) {
        // 縦持ち → 横持ち変換（フィルタなし - 全データ）
        const chartData = pivotMasterData(masterResult.data.data)

        // 利用可能なカラムを抽出
        const columns = chartData.length > 0
          ? Object.keys(chartData[0]).filter(k => k !== 'yearMonth')
          : []

        return NextResponse.json({
          success: true,
          data: chartData,
          columns: ['yearMonth', ...columns],
          source: 'master_data'
        })
      }
    }

    // 2. フォールバック: 旧形式のファイルを探す
    const kpiFileName = `${entityId}_kpi_data.json`
    let kpiResult = await loadJsonFromFolder<KpiData>(kpiFileName, clientFolderId as string)

    // 見つからない場合はshukuhaku_chart_data.jsonを試す
    if (!kpiResult) {
      kpiResult = await loadJsonFromFolder<KpiData>('shukuhaku_chart_data.json', clientFolderId as string)
    }

    if (!kpiResult) {
      return NextResponse.json({
        success: true,
        data: []
      })
    }

    // グラフ用にyearMonth形式に変換
    const chartData = kpiResult.data.data.map(row => {
      // 「月」カラムを「yearMonth」形式に変換（例: "4月" → "2026-04"）
      const month = row['月'] as string
      let yearMonth = month

      if (month && typeof month === 'string') {
        const monthNum = parseInt(month.replace('月', ''))
        if (!isNaN(monthNum)) {
          // 4月〜12月は2025年度、1月〜3月は2026年
          const year = monthNum >= 4 ? 2025 : 2026
          yearMonth = `${year}-${String(monthNum).padStart(2, '0')}`
        }
      }

      return {
        ...row,
        yearMonth
      }
    })

    return NextResponse.json({
      success: true,
      data: chartData,
      columns: kpiResult.data.columns,
      entityName: kpiResult.data.entity_name,
      source: 'legacy'
    })

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { success: false, error: 'アクセス権限がありません' },
        { status: 403 }
      )
    }
    console.error('Chart Data API error:', error)
    return NextResponse.json(
      { success: false, error: 'データ取得に失敗しました' },
      { status: 500 }
    )
  }
}
