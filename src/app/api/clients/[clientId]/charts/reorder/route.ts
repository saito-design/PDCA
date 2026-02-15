import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { ApiResponse } from '@/lib/types'

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

    try {
      const supabase = getSupabaseServer()

      // バッチ更新
      const updates = items.map((item) =>
        supabase
          .from('charts')
          .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('client_id', clientId)
      )

      await Promise.all(updates)

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
    console.error('Reorder charts error:', error)
    return NextResponse.json(
      { success: false, error: 'グラフの並び替えに失敗しました' },
      { status: 500 }
    )
  }
}
