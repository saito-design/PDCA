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

interface ColumnInfo {
  name: string
  label: string  // 表示名
  type: 'number' | 'string' | 'date' | 'unknown'
  unit: string   // 単位
  sampleValues: unknown[]
  category?: string  // 大項目
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

// カラム名から単位を推定
function inferUnit(colName: string): string {
  if (colName.includes('率') || colName === 'OCC' || colName.includes('OCC')) return '%'
  if (colName.includes('ADR') || colName.includes('RevPAR') || colName.includes('売上') || colName.includes('室料')) return '円'
  if (colName.includes('客数') || colName.includes('定員') || colName.includes('DOR')) return '人'
  if (colName.includes('部屋数') || colName.includes('客室数')) return '室'
  return ''
}

// カラムのデータ型を推定
function inferColumnType(values: unknown[]): 'number' | 'string' | 'date' | 'unknown' {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  if (nonNullValues.length === 0) return 'unknown'

  const numericCount = nonNullValues.filter(v => typeof v === 'number').length
  if (numericCount > nonNullValues.length * 0.5) return 'number'

  return 'string'
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
        // 全データを使用（フィルタなし）
        const allData = masterResult.data.data

        // ユニークな中項目（カラム）を抽出
        // キー名は「中項目_区分」の形式で区別
        const uniqueColumns = new Map<string, { unit: string; category: string; values: (number | null)[] }>()
        const uniqueCategories = new Set<string>()

        for (const row of allData) {
          // 区分（実績/計画/累計など）を含めたキー名を生成
          const columnKey = row.区分 && row.区分 !== '実績'
            ? `${row.中項目}（${row.区分}）`
            : row.中項目

          if (!uniqueColumns.has(columnKey)) {
            uniqueColumns.set(columnKey, { unit: row.単位, category: row.大項目, values: [] })
          }
          uniqueColumns.get(columnKey)!.values.push(row.値)
          uniqueCategories.add(row.大項目)
        }

        const columnInfos: ColumnInfo[] = Array.from(uniqueColumns.entries()).map(([name, info]) => ({
          name,
          label: name,
          type: 'number' as const,
          unit: info.unit,
          category: info.category,
          sampleValues: info.values.filter(v => v !== null).slice(0, 5)
        }))

        // 大項目をソートして返す
        const categories = Array.from(uniqueCategories).sort()

        return NextResponse.json({
          success: true,
          data: {
            columns: columnInfos,
            categories,
            totalRecords: allData.length,
            totalColumns: columnInfos.length,
            source: 'master_data'
          }
        })
      }
    }

    // 2. フォールバック: 旧形式のファイルを探す
    const kpiFileName = `${entityId}_kpi_data.json`
    let kpiResult = await loadJsonFromFolder<KpiData>(kpiFileName, clientFolderId as string)

    // 見つからない場合はshukuhaku_chart_data.jsonを試す（部署IDがshukuhakuの場合など）
    if (!kpiResult) {
      kpiResult = await loadJsonFromFolder<KpiData>('shukuhaku_chart_data.json', clientFolderId as string)
    }

    if (!kpiResult) {
      return NextResponse.json({
        success: true,
        data: {
          columns: [],
          totalRecords: 0,
          message: 'データがありません。変換ツールでExcelを変換してください。'
        }
      })
    }

    const { columns, data } = kpiResult.data

    // システムカラム（月順など）を除外
    const excludeColumns = ['月順']

    // 各カラムの情報を生成
    const columnInfos: ColumnInfo[] = columns
      .filter(colName => !excludeColumns.includes(colName))
      .map(colName => {
        const sampleValues = data
          .slice(0, 10)
          .map(row => row[colName])
          .filter(v => v !== null && v !== undefined)

        return {
          name: colName,
          label: colName,  // そのまま表示名として使用
          type: inferColumnType(data.map(row => row[colName])),
          unit: inferUnit(colName),
          sampleValues
        }
      })

    return NextResponse.json({
      success: true,
      data: {
        columns: columnInfos,
        totalRecords: data.length,
        totalColumns: columnInfos.length,
        entityName: kpiResult.data.entity_name || entityId,
        source: 'legacy'
      }
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
    console.error('Entity Columns API error:', error)
    return NextResponse.json(
      { success: false, error: 'カラム取得に失敗しました' },
      { status: 500 }
    )
  }
}
