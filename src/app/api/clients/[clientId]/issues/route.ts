import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaIssue, Client } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
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

type RouteParams = {
  params: Promise<{ clientId: string }>
}

// 企業全体のイシュー一覧取得（全部署横断）
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaIssue[]>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId) {
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

    // 企業の全イシューを取得
    const allIssues = await loadIssues(clientFolderId)
    const filtered = allIssues.filter((i) => i.client_id === clientId)

    // 更新日時の降順でソート
    filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

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
    console.error('Get all issues error:', error)
    return NextResponse.json(
      { success: false, error: 'イシュー一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}
