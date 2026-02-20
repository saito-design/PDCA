import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaIssue, PdcaStatus } from '@/lib/types'
import { isDriveConfigured } from '@/lib/drive'
import {
  getClientFolderId,
  loadMasterData,
  saveMasterData,
} from '@/lib/entity-helpers'

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string }>
}

// タスク一覧取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaIssue[]>>> {
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

    const masterData = await loadMasterData(clientFolderId)
    const allTasks = masterData?.issues || []
    const filtered = allTasks.filter(
      (t) => t.client_id === clientId && t.entity_id === entityId
    )

    // 作成日時の降順でソート
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

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
    console.error('Get tasks error:', error)
    return NextResponse.json(
      { success: false, error: 'タスク一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// タスク作成
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaIssue>>> {
  try {
    await requireAuth()
    const { clientId, entityId } = await context.params
    const body = await request.json()

    if (!clientId || !entityId) {
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

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const { title } = body

    if (!title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json(
        { success: false, error: 'タイトルが無効です' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const newTask: PdcaIssue = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      client_id: clientId,
      entity_id: entityId,
      title,
      status: 'open',
      created_at: now,
      updated_at: now,
    }

    const masterData = await loadMasterData(clientFolderId) || {
      version: '1.0',
      updated_at: '',
      issues: [],
      cycles: [],
    }
    masterData.issues.push(newTask)
    await saveMasterData(masterData, clientFolderId)

    return NextResponse.json({
      success: true,
      data: newTask,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Create task error:', error)
    return NextResponse.json(
      { success: false, error: 'タスクの作成に失敗しました' },
      { status: 500 }
    )
  }
}

// タスク更新（ステータス変更など）
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaIssue>>> {
  try {
    await requireAuth()
    const { clientId, entityId } = await context.params
    const body = await request.json()

    if (!clientId || !entityId) {
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

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const { id, title, status } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'タスクIDが必要です' },
        { status: 400 }
      )
    }

    if (status && !['open', 'doing', 'done', 'paused'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'ステータスが無効です' },
        { status: 400 }
      )
    }

    const masterData = await loadMasterData(clientFolderId)
    if (!masterData) {
      return NextResponse.json(
        { success: false, error: 'マスターデータがありません' },
        { status: 404 }
      )
    }

    const idx = masterData.issues.findIndex(
      (t) => t.id === id && t.client_id === clientId && t.entity_id === entityId
    )

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      )
    }

    // 更新
    if (title !== undefined) masterData.issues[idx].title = title
    if (status !== undefined) masterData.issues[idx].status = status as PdcaStatus
    masterData.issues[idx].updated_at = new Date().toISOString()

    await saveMasterData(masterData, clientFolderId)

    return NextResponse.json({
      success: true,
      data: masterData.issues[idx],
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Update task error:', error)
    return NextResponse.json(
      { success: false, error: 'タスクの更新に失敗しました' },
      { status: 500 }
    )
  }
}
