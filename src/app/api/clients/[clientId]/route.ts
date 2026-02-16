import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Client } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
  deleteFile,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'

// Google Driveからクライアント一覧を読み込む
async function loadClients(): Promise<Client[]> {
  if (!isDriveConfigured()) {
    return []
  }
  try {
    const pdcaFolderId = getPdcaFolderId()
    const result = await loadJsonFromFolder<Client[]>(CLIENTS_FILENAME, pdcaFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('クライアント読み込みエラー:', error)
    return []
  }
}

// Google Driveにクライアント一覧を保存
async function saveClients(clients: Client[]): Promise<void> {
  const pdcaFolderId = getPdcaFolderId()
  await saveJsonToFolder(clients, CLIENTS_FILENAME, pdcaFolderId)
}

type RouteParams = {
  params: Promise<{ clientId: string }>
}

// 企業の関連データ数を取得
interface ClientStats {
  entityCount: number
  issueCount: number
  cycleCount: number
  chartCount: number
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<{ client: Client; stats: ClientStats }>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
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

    // クライアントを検索
    const clients = await loadClients()
    const client = clients.find(c => c.id === clientId)

    if (!client) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    // TODO: 関連データ数を集計（将来実装）
    const stats: ClientStats = {
      entityCount: 0,
      issueCount: 0,
      cycleCount: 0,
      chartCount: 0,
    }

    return NextResponse.json({
      success: true,
      data: { client, stats },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get client error:', error)
    return NextResponse.json(
      { success: false, error: '企業情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// 企業削除
export async function DELETE(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
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

    // クライアント一覧を取得
    const clients = await loadClients()
    const clientIndex = clients.findIndex(c => c.id === clientId)

    if (clientIndex === -1) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const client = clients[clientIndex]

    // Google Driveからフォルダを削除（存在する場合）
    if (client.drive_folder_id) {
      try {
        await deleteFile(client.drive_folder_id)
      } catch (error) {
        console.warn('企業フォルダの削除に失敗:', error)
        // フォルダが既に削除されている場合は無視
      }
    }

    // クライアント一覧から削除
    clients.splice(clientIndex, 1)
    await saveClients(clients)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Delete client error:', error)
    return NextResponse.json(
      { success: false, error: '企業の削除に失敗しました' },
      { status: 500 }
    )
  }
}
