import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { getStoreList } from '@/lib/excel-reader'
import { ApiResponse, Entity } from '@/lib/types'

// ジュネストリーの店舗一覧をエクセルから取得
function getJunestoryEntities(): Entity[] {
  const entities: Entity[] = [
    {
      id: 'junestory-all',
      client_id: 'junestory',
      name: '全店',
      sort_order: 0,
      created_at: new Date().toISOString(),
    },
  ]

  try {
    const stores = getStoreList('junestory')
    stores.forEach((storeName, index) => {
      entities.push({
        id: `junestory-${index + 1}`,
        client_id: 'junestory',
        name: storeName,
        sort_order: (index + 1) * 10,
        created_at: new Date().toISOString(),
      })
    })
  } catch (error) {
    console.warn('店舗一覧取得エラー:', error)
  }

  return entities
}

// デモ用データ（Supabase未接続時）
const demoEntities: Record<string, Entity[]> = {
  'demo-client-1': [
    {
      id: 'demo-entity-1',
      client_id: 'demo-client-1',
      name: '本店',
      sort_order: 10,
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-entity-2',
      client_id: 'demo-client-1',
      name: '高田馬場店',
      sort_order: 20,
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-entity-3',
      client_id: 'demo-client-1',
      name: '渋谷店',
      sort_order: 30,
      created_at: new Date().toISOString(),
    },
  ],
  'demo-client-2': [
    {
      id: 'demo-entity-4',
      client_id: 'demo-client-2',
      name: '営業部',
      sort_order: 10,
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-entity-5',
      client_id: 'demo-client-2',
      name: '開発部',
      sort_order: 20,
      created_at: new Date().toISOString(),
    },
  ],
}

type RouteParams = {
  params: Promise<{ clientId: string }>
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Entity[]>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    // 入力値バリデーション
    if (!clientId || typeof clientId !== 'string' || clientId.length > 100) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
        { status: 400 }
      )
    }

    // Supabaseから取得を試みる
    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order')

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as Entity[],
      })
    } catch {
      // Supabase未接続時はデモデータ
      console.warn('Supabase接続エラー: デモデータを使用')

      // ジュネストリーの場合はエクセルから店舗一覧を取得
      if (clientId === 'junestory') {
        return NextResponse.json({
          success: true,
          data: getJunestoryEntities(),
        })
      }

      return NextResponse.json({
        success: true,
        data: demoEntities[clientId] || [],
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get entities error:', error)
    return NextResponse.json(
      { success: false, error: '部署/店舗一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}
