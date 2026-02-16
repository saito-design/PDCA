import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Entity } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  ensureFolder,
  loadJsonFromFolder,
  saveJsonToFolder,
} from '@/lib/drive'

const ENTITIES_FILENAME = 'entities.json'

// Google Driveからエンティティを読み込む
async function loadEntities(clientFolderId: string): Promise<Entity[]> {
  try {
    const result = await loadJsonFromFolder<Entity[]>(ENTITIES_FILENAME, clientFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('エンティティ読み込みエラー:', error)
    return []
  }
}

// Google Driveにエンティティを保存
async function saveEntities(entities: Entity[], clientFolderId: string): Promise<void> {
  await saveJsonToFolder(entities, ENTITIES_FILENAME, clientFolderId)
}

// 企業フォルダを取得または作成
async function getClientFolder(clientId: string): Promise<string> {
  const pdcaFolderId = getPdcaFolderId()
  return await ensureFolder(clientId, pdcaFolderId)
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

    // Google Driveが未設定の場合
    if (!isDriveConfigured()) {
      return NextResponse.json({
        success: true,
        data: [],
      })
    }

    // 企業フォルダを取得
    const clientFolderId = await getClientFolder(clientId)

    // Driveからエンティティを取得
    const entities = await loadEntities(clientFolderId)
    return NextResponse.json({
      success: true,
      data: entities,
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

    // Google Driveが未設定の場合はエラー
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    // 企業フォルダを取得または作成
    const clientFolderId = await getClientFolder(clientId)

    // 新しいエンティティを作成
    const newEntity: Entity = {
      id: `${clientId}-${Date.now()}`,
      client_id: clientId,
      name,
      sort_order: 100,
      created_at: new Date().toISOString(),
    }

    // 既存エンティティを読み込んで追加
    const entities = await loadEntities(clientFolderId)
    entities.push(newEntity)
    await saveEntities(entities, clientFolderId)

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
    const errorMessage = error instanceof Error ? error.message : '不明なエラー'
    return NextResponse.json(
      { success: false, error: `部署/店舗の追加に失敗しました: ${errorMessage}` },
      { status: 500 }
    )
  }
}
