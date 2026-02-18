import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Task } from '@/lib/types'
import {
  isDriveConfigured,
  loadJsonFromFolder,
  saveJsonToFolder,
} from '@/lib/drive'
import {
  getClientFolderId,
  getEntityFolderId,
  loadEntities,
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
  params: Promise<{ clientId: string; entityId: string }>
}

// タスク一覧取得（部署別）
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Task[]>>> {
  try {
    await requireAuth()
    const { clientId, entityId } = await context.params

    if (!clientId || !entityId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    if (!isDriveConfigured()) {
      return NextResponse.json({ success: true, data: [] })
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

    // 日付の降順でソート
    tasks.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ success: true, data: tasks })
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

// タスク追加（部署別）
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Task>>> {
  try {
    await requireAuth()
    const { clientId, entityId } = await context.params
    const body = await request.json()

    if (!clientId || !entityId || !body.title) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
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

    // 部署名を取得
    const entities = await loadEntities(clientFolderId)
    const entity = entities.find(e => e.id === entityId)
    const entityName = entity?.name || ''

    const now = new Date().toISOString()
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      client_id: clientId,
      entity_name: entityName,
      title: body.title,
      status: body.status || 'open',
      date: body.date || now.split('T')[0],
      created_at: now,
      updated_at: now,
    }

    const tasks = await loadTasks(entityFolderId)
    tasks.push(newTask)
    await saveTasks(tasks, entityFolderId)

    return NextResponse.json({ success: true, data: newTask })
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
