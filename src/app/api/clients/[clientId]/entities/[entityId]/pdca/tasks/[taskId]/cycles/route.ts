import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaCycle, PdcaStatus, Client, Entity } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
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

// 部署フォルダにサイクルを保存
async function saveCycles(cycles: PdcaCycle[], entityFolderId: string): Promise<void> {
  await saveJsonToFolder(cycles, CYCLES_FILENAME, entityFolderId)
}

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string; taskId: string }>
}

// サイクル一覧取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle[]>>> {
  try {
    await requireAuth()
    const { clientId, entityId, taskId } = await context.params

    if (!clientId || !entityId || !taskId) {
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

    const allCycles = await loadCycles(entityFolderId)
    const filtered = allCycles.filter((c) => c.issue_id === taskId)

    // サイクル日付の降順でソート
    filtered.sort((a, b) => new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime())

    return NextResponse.json({
      success: true,
      data: filtered,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get cycles error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクル一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// サイクル作成
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle>>> {
  try {
    await requireAuth()
    const { clientId, entityId, taskId } = await context.params
    const body = await request.json()

    if (!clientId || !entityId || !taskId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
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

    const { cycle_date, situation, issue, action, target, status } = body

    // バリデーション
    if (!cycle_date) {
      return NextResponse.json(
        { success: false, error: 'サイクル日付が必要です' },
        { status: 400 }
      )
    }

    if (status && !['open', 'doing', 'done', 'paused'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'ステータスが無効です' },
        { status: 400 }
      )
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

    const newCycle: PdcaCycle = {
      id: `cycle-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      client_id: clientId,
      entity_id: entityId,
      issue_id: taskId,
      cycle_date,
      situation: situation || '',
      issue: issue || '',
      action: action || '',
      target: target || '',
      status: (status as PdcaStatus) || 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const allCycles = await loadCycles(entityFolderId)
    allCycles.push(newCycle)
    await saveCycles(allCycles, entityFolderId)

    return NextResponse.json({
      success: true,
      data: newCycle,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Create cycle error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクルの作成に失敗しました' },
      { status: 500 }
    )
  }
}

// サイクル更新
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle>>> {
  try {
    await requireAuth()
    const { clientId, entityId, taskId } = await context.params
    const body = await request.json()

    if (!clientId || !entityId || !taskId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
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

    const { id, situation, issue, action, target, status } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'サイクルIDが必要です' },
        { status: 400 }
      )
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

    const allCycles = await loadCycles(entityFolderId)
    const idx = allCycles.findIndex((c) => c.id === id && c.issue_id === taskId)

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'サイクルが見つかりません' },
        { status: 404 }
      )
    }

    // 更新
    if (situation !== undefined) allCycles[idx].situation = situation
    if (issue !== undefined) allCycles[idx].issue = issue
    if (action !== undefined) allCycles[idx].action = action
    if (target !== undefined) allCycles[idx].target = target
    if (status !== undefined) allCycles[idx].status = status
    allCycles[idx].updated_at = new Date().toISOString()

    await saveCycles(allCycles, entityFolderId)

    return NextResponse.json({
      success: true,
      data: allCycles[idx],
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Update cycle error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクルの更新に失敗しました' },
      { status: 500 }
    )
  }
}
