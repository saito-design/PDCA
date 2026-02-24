import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { ApiResponse, Chart, ChartType, AggKey } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// ローカル保存用のパス
const LOCAL_CHARTS_PATH = path.join(process.cwd(), '.cache', 'charts.json')

// ローカルチャートを読み込む
function loadLocalCharts(): Record<string, Chart[]> {
  try {
    if (fs.existsSync(LOCAL_CHARTS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CHARTS_PATH, 'utf-8'))
    }
  } catch {
    console.warn('ローカルチャート読み込みエラー')
  }
  return {}
}

// ローカルチャートを保存
function saveLocalCharts(charts: Record<string, Chart[]>): void {
  try {
    const dir = path.dirname(LOCAL_CHARTS_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(LOCAL_CHARTS_PATH, JSON.stringify(charts, null, 2))
  } catch (e) {
    console.error('ローカルチャート保存エラー:', e)
  }
}

type RouteParams = {
  params: Promise<{ clientId: string }>
}

// グラフ一覧取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Chart[]>>> {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)

    if (!clientId || typeof clientId !== 'string' || clientId.length > 100) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
        { status: 400 }
      )
    }

    const allCharts = loadLocalCharts()
    const clientCharts = allCharts[clientId] || []

    // sort_orderでソート
    clientCharts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    return NextResponse.json({
      success: true,
      data: clientCharts,
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json(
          { success: false, error: '認証が必要です' },
          { status: 401 }
        )
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json(
          { success: false, error: 'アクセス権限がありません' },
          { status: 403 }
        )
      }
    }
    console.error('Get charts error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフ一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// グラフ作成
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Chart>>> {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)
    const body = await request.json()

    // バリデーション
    if (!clientId || typeof clientId !== 'string' || clientId.length > 100) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
        { status: 400 }
      )
    }

    const { title, type, x_key, series_keys, series_config, agg_key, store_override, filters, show_on_dashboard, sort_order } = body

    if (!title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json(
        { success: false, error: 'タイトルが無効です' },
        { status: 400 }
      )
    }

    if (!['line', 'bar'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'グラフタイプが無効です' },
        { status: 400 }
      )
    }

    if (!['raw', 'yoy_diff', 'yoy_pct'].includes(agg_key)) {
      return NextResponse.json(
        { success: false, error: '集計タイプが無効です' },
        { status: 400 }
      )
    }

    if (!Array.isArray(series_keys) || series_keys.length === 0) {
      return NextResponse.json(
        { success: false, error: '系列キーが必要です' },
        { status: 400 }
      )
    }

    const newChart: Chart = {
      id: `chart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      client_id: clientId,
      title,
      type: type as ChartType,
      x_key: x_key || 'yearMonth',
      series_keys,
      series_config: series_config || undefined,
      agg_key: agg_key as AggKey,
      store_override: store_override || null,
      filters: filters || {},
      show_on_dashboard: show_on_dashboard || false,
      sort_order: sort_order || 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // ローカル保存
    const allCharts = loadLocalCharts()
    if (!allCharts[clientId]) {
      allCharts[clientId] = []
    }
    allCharts[clientId].push(newChart)
    saveLocalCharts(allCharts)

    return NextResponse.json({
      success: true,
      data: newChart,
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json(
          { success: false, error: '認証が必要です' },
          { status: 401 }
        )
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json(
          { success: false, error: 'アクセス権限がありません' },
          { status: 403 }
        )
      }
    }
    console.error('Create chart error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフの作成に失敗しました' },
      { status: 500 }
    )
  }
}
