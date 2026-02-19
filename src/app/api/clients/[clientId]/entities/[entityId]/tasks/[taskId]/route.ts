import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Task, PdcaStatus } from '@/lib/types'
import {
  isDriveConfigured,
  loadJsonFromFolder,
  saveJsonToFolder,
} from '@/lib/drive'
import {
  getClientFolderId,
  getEntityFolderId,
  updateTaskInAggregate,
  removeTaskFromAggregate,
} from '@/lib/entity-helpers'

const TASKS_FILENAME = 'tasks.json'

// 部署フォルダからタスクを読み込む
async function loadTasks(entityFolderId: string): Promise<Task[]> {
  try {
    const result = await loadJsonFromFolder<Task[]>(TASKS_FILENAME, entityFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('タスク読み込みエラー:', error)
    return []
  }
}

// 部署フォルダにタスクを保存
async function saveTasks(tasks: Task[], entityFolderId: string): Promise<void> {
  await saveJsonToFolder(tasks, TASKS_FILENAME, entityFolderId)
}

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string; taskId: string }>
}

// タスク更新（PATCH）
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Task>>> {
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

    const entityFolderId = await getEntityFolderId(clientFolderId, entityId)
    if (!entityFolderId) {
      return NextResponse.json(
        { success: false, error: '部署が見つかりません' },
        { status: 404 }
      )
    }

    const tasks = await loadTasks(entityFolderId)
    const idx = tasks.findIndex((t) => t.id === taskId)

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
    tasks[idx].updated_at = new Date().toISOString()

    await saveTasks(tasks, entityFolderId)

    // まとめJSONも更新
    await updateTaskInAggregate(tasks[idx], clientFolderId)

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
    const { clientId, entityId, taskId } = await context.params

    if (!clientId || !entityId || !taskId) {
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

    const entityFolderId = await getEntityFolderId(clientFolderId, entityId)
    if (!entityFolderId) {
      return NextResponse.json(
        { success: false, error: '部署が見つかりません' },
        { status: 404 }
      )
    }

    const tasks = await loadTasks(entityFolderId)
    const idx = tasks.findIndex((t) => t.id === taskId)

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      )
    }

    const deletedTaskId = tasks[idx].id
    tasks.splice(idx, 1)
    await saveTasks(tasks, entityFolderId)

    // まとめJSONからも削除
    await removeTaskFromAggregate(deletedTaskId, clientFolderId)

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
