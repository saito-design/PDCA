import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { ApiResponse, Chart } from '@/lib/types'

type RouteParams = {
  params: Promise<{ clientId: string; chartId: string }>
}

// グラフ更新
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Chart>>> {
  try {
    await requireAuth()
    const { clientId, chartId } = await context.params
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

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('charts')
        .update(updates)
        .eq('id', chartId)
        .eq('client_id', clientId)
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as Chart,
      })
    } catch {
      // デモモード: 成功扱い
      return NextResponse.json({
        success: true,
        data: { id: chartId, ...updates } as unknown as Chart,
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
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
    await requireAuth()
    const { clientId, chartId } = await context.params

    if (!clientId || !chartId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    try {
      const supabase = getSupabaseServer()
      const { error } = await supabase
        .from('charts')
        .delete()
        .eq('id', chartId)
        .eq('client_id', clientId)

      if (error) throw error

      return NextResponse.json({ success: true })
    } catch {
      // デモモード: 成功扱い
      return NextResponse.json({ success: true })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Delete chart error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフの削除に失敗しました' },
      { status: 500 }
    )
  }
}
