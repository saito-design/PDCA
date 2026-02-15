import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { ApiResponse, Chart, ChartType, AggKey } from '@/lib/types'

// デモ用データ（グローバルで共有）
export const demoCharts: Record<string, Chart[]> = {
  'junestory': [],
  'demo-client-1': [],
  'demo-client-2': [],
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
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId || typeof clientId !== 'string' || clientId.length > 100) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
        { status: 400 }
      )
    }

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('charts')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order')

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as Chart[],
      })
    } catch {
      console.warn('Supabase接続エラー: デモデータを使用')
      return NextResponse.json({
        success: true,
        data: demoCharts[clientId] || [],
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
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
    await requireAuth()
    const { clientId } = await context.params
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

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('charts')
        .insert({
          client_id: clientId,
          title,
          type: type as ChartType,
          x_key: x_key || 'yearMonth',
          series_keys,
          series_config: series_config || null,
          agg_key: agg_key as AggKey,
          store_override: store_override || null,
          filters: filters || {},
          show_on_dashboard: show_on_dashboard || false,
          sort_order: sort_order || 10,
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as Chart,
      })
    } catch {
      // デモモード: メモリ上で処理
      const newChart: Chart = {
        id: `demo-chart-${Date.now()}`,
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

      if (!demoCharts[clientId]) {
        demoCharts[clientId] = []
      }
      demoCharts[clientId].push(newChart)

      return NextResponse.json({
        success: true,
        data: newChart,
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Create chart error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフの作成に失敗しました' },
      { status: 500 }
    )
  }
}
