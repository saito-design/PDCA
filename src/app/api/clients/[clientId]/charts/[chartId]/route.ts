import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { ApiResponse, Chart } from '@/lib/types'
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
  params: Promise<{ clientId: string; chartId: string }>
}

// グラフ更新
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Chart>>> {
  try {
    const { clientId, chartId } = await context.params
    await requireClientAccess(clientId)
    const body = await request.json()

    if (!clientId || !chartId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    // 更新可能なフィールド
    const allowedFields = [
      'title', 'type', 'x_key', 'series_keys', 'series_config', 'agg_key',
      'store_override', 'filters', 'show_on_dashboard', 'sort_order'
    ]
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: '更新するフィールドがありません' },
        { status: 400 }
      )
    }

    // バリデーション
    if (updates.title && (typeof updates.title !== 'string' || (updates.title as string).length > 200)) {
      return NextResponse.json(
        { success: false, error: 'タイトルが無効です' },
        { status: 400 }
      )
    }

    if (updates.type && !['line', 'bar'].includes(updates.type as string)) {
      return NextResponse.json(
        { success: false, error: 'グラフタイプが無効です' },
        { status: 400 }
      )
    }

    if (updates.agg_key && !['raw', 'yoy_diff', 'yoy_pct'].includes(updates.agg_key as string)) {
      return NextResponse.json(
        { success: false, error: '集計タイプが無効です' },
        { status: 400 }
      )
    }

    updates.updated_at = new Date().toISOString()

    // ローカルチャートを更新
    const allCharts = loadLocalCharts()
    const clientCharts = allCharts[clientId] || []
    const chartIndex = clientCharts.findIndex(c => c.id === chartId)

    if (chartIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'グラフが見つかりません' },
        { status: 404 }
      )
    }

    const updatedChart = { ...clientCharts[chartIndex], ...updates } as Chart
    clientCharts[chartIndex] = updatedChart
    allCharts[clientId] = clientCharts
    saveLocalCharts(allCharts)

    return NextResponse.json({
      success: true,
      data: updatedChart,
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
    console.error('Update chart error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフの更新に失敗しました' },
      { status: 500 }
    )
  }
}

// グラフ削除
export async function DELETE(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    const { clientId, chartId } = await context.params
    await requireClientAccess(clientId)

    if (!clientId || !chartId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    // ローカルチャートから削除
    const allCharts = loadLocalCharts()
    const clientCharts = allCharts[clientId] || []
    const filteredCharts = clientCharts.filter(c => c.id !== chartId)
    allCharts[clientId] = filteredCharts
    saveLocalCharts(allCharts)

    return NextResponse.json({ success: true })
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
    console.error('Delete chart error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフの削除に失敗しました' },
      { status: 500 }
    )
  }
}
