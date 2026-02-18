import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaCycle, Client, Entity } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const ENTITIES_FILENAME = 'entities.json'
const CYCLES_FILENAME = 'cycles.json'

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

// 企業のdrive_folder_idを取得
async function getClientFolderId(clientId: string): Promise<string | null> {
  const clients = await loadClients()
  const client = clients.find(c => c.id === clientId)
  return client?.drive_folder_id || null
}

// エンティティ一覧を読み込む
async function loadEntities(clientFolderId: string): Promise<Entity[]> {
  try {
    const result = await loadJsonFromFolder<Entity[]>(ENTITIES_FILENAME, clientFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('エンティティ読み込みエラー:', error)
    return []
  }
}

// 部署のdrive_folder_idを取得
async function getEntityFolderId(clientFolderId: string, entityId: string): Promise<string | null> {
  const entities = await loadEntities(clientFolderId)
  const entity = entities.find(e => e.id === entityId)
  return entity?.drive_folder_id || null
}

// 部署フォルダからサイクルを読み込む
async function loadCycles(entityFolderId: string): Promise<PdcaCycle[]> {
  try {
    const result = await loadJsonFromFolder<PdcaCycle[]>(CYCLES_FILENAME, entityFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('サイクル読み込みエラー:', error)
    return []
  }
}

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string }>
}

// 部署ごとのサイクル一覧取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle[]>>> {
  try {
    await requireAuth()
    const { clientId, entityId } = await context.params

    if (!clientId || !entityId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
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

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const entityFolderId = await getEntityFolderId(clientFolderId, entityId)
    if (!entityFolderId) {
      return NextResponse.json(
        { success: false, error: '部署が見つかりません' },
        { status: 404 }
      )
    }

    // 部署フォルダから直接読み込む（フィルタ不要）
    const cycles = await loadCycles(entityFolderId)

    // サイクル日付の降順でソート
    cycles.sort((a, b) => new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime())

    return NextResponse.json({
      success: true,
      data: cycles,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get cycles by entity error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクル一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}
