import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getStoreList } from '@/lib/excel-reader'
import { ApiResponse, Entity } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// ローカル保存用のパス
const LOCAL_ENTITIES_PATH = path.join(process.cwd(), '.cache', 'entities.json')

// ローカルエンティティを読み込む
function loadLocalEntities(): Record<string, Entity[]> {
  try {
    if (fs.existsSync(LOCAL_ENTITIES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_ENTITIES_PATH, 'utf-8'))
    }
  } catch {
    console.warn('ローカルエンティティ読み込みエラー')
  }
  return {}
}

// ローカルエンティティを保存
function saveLocalEntities(entities: Record<string, Entity[]>): void {
  try {
    const dir = path.dirname(LOCAL_ENTITIES_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(LOCAL_ENTITIES_PATH, JSON.stringify(entities, null, 2))
  } catch (e) {
    console.error('ローカルエンティティ保存エラー:', e)
  }
}

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

    // ジュネストリーの場合はエクセルから店舗一覧を取得
    if (clientId === 'junestory') {
      const junestoryEntities = getJunestoryEntities()
      const localEntities = loadLocalEntities()
      const localForClient = localEntities[clientId] || []
      return NextResponse.json({
        success: true,
        data: [...junestoryEntities, ...localForClient],
      })
    }

    // その他のクライアントはローカルデータのみ
    const localEntities = loadLocalEntities()
    const localForClient = localEntities[clientId] || []

    return NextResponse.json({
      success: true,
      data: localForClient,
    })
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

// 部署/店舗追加
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Entity>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params
    const body = await request.json()
    const { name } = body

    // バリデーション
    if (!name || typeof name !== 'string' || name.length > 100) {
      return NextResponse.json(
        { success: false, error: '部署/店舗名が無効です' },
        { status: 400 }
      )
    }

    // 新しいエンティティを作成
    const newEntity: Entity = {
      id: `${clientId}-${Date.now()}`,
      client_id: clientId,
      name,
      sort_order: 100,
      created_at: new Date().toISOString(),
    }

    // ローカル保存
    const localEntities = loadLocalEntities()
    if (!localEntities[clientId]) {
      localEntities[clientId] = []
    }
    localEntities[clientId].push(newEntity)
    saveLocalEntities(localEntities)

    return NextResponse.json({
      success: true,
      data: newEntity,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Add entity error:', error)
    return NextResponse.json(
      { success: false, error: '部署/店舗の追加に失敗しました' },
      { status: 500 }
    )
  }
}
