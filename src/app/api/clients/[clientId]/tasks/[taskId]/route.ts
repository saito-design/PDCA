import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Task, Client, PdcaStatus } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const TASKS_FILENAME = 'tasks.json'

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

// Google Driveからタスクを読み込む
async function loadTasks(clientFolderId: string): Promise<Task[]> {
  try {
    const result = await loadJsonFromFolder<Task[]>(TASKS_FILENAME, clientFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('タスク読み込みエラー:', error)
    return []
  }
}

// Google Driveにタスクを保存
async function saveTasks(tasks: Task[], clientFolderId: string): Promise<void> {
  await saveJsonToFolder(tasks, TASKS_FILENAME, clientFolderId)
}

type RouteParams = {
  params: Promise<{ clientId: string; taskId: string }>
}

// タスク更新（PATCH）
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Task>>> {
  try {
    await requireAuth()
    const { clientId, taskId } = await context.params
    const body = await request.json()

    if (!clientId || !taskId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

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

    const tasks = await loadTasks(clientFolderId)
    const idx = tasks.findIndex((t) => t.id === taskId && t.client_id === clientId)

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      )
    }

    // ステータスのバリデーション
    if (body.status && !['open', 'doing', 'done', 'paused'].includes(body.status)) {
      return NextResponse.json(
        { success: false, error: 'ステータスが無効です' },
        { status: 400 }
      )
    }

    // 更新
    if (body.title !== undefined) tasks[idx].title = body.title
    if (body.status !== undefined) tasks[idx].status = body.status as PdcaStatus
    if (body.entity_name !== undefined) tasks[idx].entity_name = body.entity_name
    tasks[idx].updated_at = new Date().toISOString()

    await saveTasks(tasks, clientFolderId)

    return NextResponse.json({ success: true, data: tasks[idx] })
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

// タスク削除（DELETE）
export async function DELETE(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<null>>> {
  try {
    await requireAuth()
    const { clientId, taskId } = await context.params

    if (!clientId || !taskId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

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

    const tasks = await loadTasks(clientFolderId)
    const idx = tasks.findIndex((t) => t.id === taskId && t.client_id === clientId)

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      )
    }

    tasks.splice(idx, 1)
    await saveTasks(tasks, clientFolderId)

    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Delete task error:', error)
    return NextResponse.json(
      { success: false, error: 'タスクの削除に失敗しました' },
      { status: 500 }
    )
  }
}
