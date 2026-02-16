import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaIssue, PdcaStatus, Client } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const ISSUES_FILENAME = 'pdca-issues.json'

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

// Google Driveからイシューを読み込む
async function loadIssues(clientFolderId: string): Promise<PdcaIssue[]> {
  try {
    const result = await loadJsonFromFolder<PdcaIssue[]>(ISSUES_FILENAME, clientFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('イシュー読み込みエラー:', error)
    return []
  }
}

// Google Driveにイシューを保存
async function saveIssues(issues: PdcaIssue[], clientFolderId: string): Promise<void> {
  await saveJsonToFolder(issues, ISSUES_FILENAME, clientFolderId)
}

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string }>
}

// イシュー一覧取得
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

    const allIssues = await loadIssues(clientFolderId)
    const filtered = allIssues.filter(
      (i) => i.client_id === clientId && i.entity_id === entityId
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
    console.error('Get issues error:', error)
    return NextResponse.json(
      { success: false, error: 'イシュー一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// イシュー作成
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
    const newIssue: PdcaIssue = {
      id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      client_id: clientId,
      entity_id: entityId,
      title,
      status: 'open',
      created_at: now,
      updated_at: now,
    }

    const allIssues = await loadIssues(clientFolderId)
    allIssues.push(newIssue)
    await saveIssues(allIssues, clientFolderId)

    return NextResponse.json({
      success: true,
      data: newIssue,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Create issue error:', error)
    return NextResponse.json(
      { success: false, error: 'イシューの作成に失敗しました' },
      { status: 500 }
    )
  }
}

// イシュー更新（ステータス変更など）
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
        { success: false, error: 'イシューIDが必要です' },
        { status: 400 }
      )
    }

    if (status && !['open', 'doing', 'done', 'paused'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'ステータスが無効です' },
        { status: 400 }
      )
    }

    const allIssues = await loadIssues(clientFolderId)
    const idx = allIssues.findIndex(
      (i) => i.id === id && i.client_id === clientId && i.entity_id === entityId
    )

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'イシューが見つかりません' },
        { status: 404 }
      )
    }

    // 更新
    if (title !== undefined) allIssues[idx].title = title
    if (status !== undefined) allIssues[idx].status = status as PdcaStatus
    allIssues[idx].updated_at = new Date().toISOString()

    await saveIssues(allIssues, clientFolderId)

    return NextResponse.json({
      success: true,
      data: allIssues[idx],
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Update issue error:', error)
    return NextResponse.json(
      { success: false, error: 'イシューの更新に失敗しました' },
      { status: 500 }
    )
  }
}
