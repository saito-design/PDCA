import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { loadJsonFromFolder, findFolderByName, getPdcaFolderId } from '@/lib/drive'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; entityId: string }> }
) {
  try {
    await requireAuth()
    const { clientId, entityId } = await params

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

    // 部署用KPIデータを探す
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
      entityName: kpiResult.data.entity_name
    })

  } catch (error) {
    console.error('Chart Data API error:', error)
    const message = error instanceof Error ? error.message : 'データ取得に失敗しました'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
