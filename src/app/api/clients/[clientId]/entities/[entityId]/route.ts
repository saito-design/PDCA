import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { ApiResponse, Entity, Client } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const ENTITIES_FILENAME = 'entities.json'

// Google Driveからクライアント一覧を読み込む
async function loadClients(): Promise<Client[]> {
  try {
    const pdcaFolderId = getPdcaFolderId()
    const result = await loadJsonFromFolder<Client[]>(CLIENTS_FILENAME, pdcaFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('クライアント読み込みエラー:', error)
    return []
  }
}

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

// 企業のdrive_folder_idを取得
async function getClientFolderId(clientId: string): Promise<string | null> {
  const clients = await loadClients()
  const client = clients.find(c => c.id === clientId)
  return client?.drive_folder_id || null
}

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string }>
}

// 部署名変更
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Entity>>> {
  try {
    const { clientId, entityId } = await context.params
    await requireClientAccess(clientId)
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

    // 企業のフォルダIDを取得
    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    // エンティティを読み込んで更新
    const entities = await loadEntities(clientFolderId)
    const entityIndex = entities.findIndex(e => e.id === entityId)

    if (entityIndex === -1) {
      return NextResponse.json(
        { success: false, error: '部署/店舗が見つかりません' },
        { status: 404 }
      )
    }

    entities[entityIndex].name = name
    await saveEntities(entities, clientFolderId)

    return NextResponse.json({
      success: true,
      data: entities[entityIndex],
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
    console.error('Update entity error:', error)
    return NextResponse.json(
      { success: false, error: '部署/店舗の更新に失敗しました' },
      { status: 500 }
    )
  }
}

// 部署削除
export async function DELETE(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<{ deleted: boolean }>>> {
  try {
    const { clientId, entityId } = await context.params
    await requireClientAccess(clientId)

    // Google Driveが未設定の場合はエラー
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    // 企業のフォルダIDを取得
    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    // エンティティを読み込んで削除
    const entities = await loadEntities(clientFolderId)
    const entityIndex = entities.findIndex(e => e.id === entityId)

    if (entityIndex === -1) {
      return NextResponse.json(
        { success: false, error: '部署/店舗が見つかりません' },
        { status: 404 }
      )
    }

    entities.splice(entityIndex, 1)
    await saveEntities(entities, clientFolderId)

    return NextResponse.json({
      success: true,
      data: { deleted: true },
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
    console.error('Delete entity error:', error)
    return NextResponse.json(
      { success: false, error: '部署/店舗の削除に失敗しました' },
      { status: 500 }
    )
  }
}
