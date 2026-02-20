import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Task, PdcaIssue } from '@/lib/types'
import { isDriveConfigured } from '@/lib/drive'
import {
  getClientFolderId,
  loadEntities,
  loadMasterData,
  saveMasterData,
} from '@/lib/entity-helpers'

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

    // master-data.jsonからissuesを取得し、Task形式に変換
    const masterData = await loadMasterData(clientFolderId)
    const entities = await loadEntities(clientFolderId)
    const entity = entities.find(e => e.id === entityId)

    const allIssues = masterData?.issues || []
    // entity_idでフィルタリング
    const filtered = allIssues.filter(i => i.entity_id === entityId)

    // Task形式に変換
    const tasks: Task[] = filtered.map(issue => ({
      id: issue.id,
      client_id: issue.client_id,
      entity_name: issue.entity_name || entity?.name || '',
      title: issue.title,
      status: issue.status,
      date: issue.date || issue.created_at.split('T')[0],
      created_at: issue.created_at,
      updated_at: issue.updated_at,
    }))

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

    // 部署名を取得
    const entities = await loadEntities(clientFolderId)
    const entity = entities.find(e => e.id === entityId)
    const entityName = entity?.name || ''

    const now = new Date().toISOString()

    // master-data.jsonに追加するissue（entity_nameとdateを持つ）
    const newIssue: PdcaIssue & { entity_name?: string; date?: string } = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      client_id: clientId,
      entity_id: entityId,
      entity_name: entityName,
      title: body.title,
      status: body.status || 'open',
      date: body.date || now.split('T')[0],
      created_at: now,
      updated_at: now,
    }

    const masterData = await loadMasterData(clientFolderId) || {
      version: '1.0',
      updated_at: '',
      issues: [],
      cycles: [],
    }
    masterData.issues.push(newIssue)
    await saveMasterData(masterData, clientFolderId)

    // Task形式で返す
    const newTask: Task = {
      id: newIssue.id,
      client_id: newIssue.client_id,
      entity_name: entityName,
      title: newIssue.title,
      status: newIssue.status,
      date: newIssue.date || now.split('T')[0],
      created_at: newIssue.created_at,
      updated_at: newIssue.updated_at,
    }

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
