import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
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
  params: Promise<{ clientId: string }>
}

interface ReorderItem {
  id: string
  sort_order: number
}

// グラフ並び替え
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    await requireAuth()
    const { clientId } = await context.params
    const body = await request.json()

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
        { status: 400 }
      )
    }

    const { items } = body as { items: ReorderItem[] }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '並び替えデータが必要です' },
        { status: 400 }
      )
    }

    // バリデーション
    for (const item of items) {
      if (!item.id || typeof item.sort_order !== 'number') {
        return NextResponse.json(
          { success: false, error: '無効な並び替えデータです' },
          { status: 400 }
        )
      }
    }

    // ローカルチャートを更新
    const allCharts = loadLocalCharts()
    const clientCharts = allCharts[clientId] || []

    for (const item of items) {
      const chart = clientCharts.find(c => c.id === item.id)
      if (chart) {
        chart.sort_order = item.sort_order
        chart.updated_at = new Date().toISOString()
      }
    }

    allCharts[clientId] = clientCharts
    saveLocalCharts(allCharts)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Reorder charts error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフの並び替えに失敗しました' },
      { status: 500 }
    )
  }
}
