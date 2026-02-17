import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Task, Client } from '@/lib/types'
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
  params: Promise<{ clientId: string }>
}

// タスク一覧取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Task[]>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId) {
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

    const tasks = await loadTasks(clientFolderId)
    const filtered = tasks.filter((t) => t.client_id === clientId)

    // 日付の降順でソート
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ success: true, data: filtered })
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

// タスク追加
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<Task>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params
    const body = await request.json()

    if (!clientId || !body.title || !body.entity_name) {
      return NextResponse.json(
        { success: false, error: 'タイトルと部署名は必須です' },
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

    const now = new Date().toISOString()
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      client_id: clientId,
      entity_name: body.entity_name,
      title: body.title,
      status: body.status || 'open',
      date: body.date || now.split('T')[0],
      created_at: now,
      updated_at: now,
    }

    const tasks = await loadTasks(clientFolderId)
    tasks.push(newTask)
    await saveTasks(tasks, clientFolderId)

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
