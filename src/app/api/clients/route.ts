import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Client } from '@/lib/types'
import {
  isDriveConfigured,
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
  ensureFolder,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'

// Google Driveからクライアントを読み込む
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

// Google Driveにクライアントを保存
async function saveClients(clients: Client[]): Promise<void> {
  const pdcaFolderId = getPdcaFolderId()
  await saveJsonToFolder(clients, CLIENTS_FILENAME, pdcaFolderId)
}

export async function GET(): Promise<NextResponse<ApiResponse<Client[]>>> {
  try {
    await requireAuth()

    const clients = await loadClients()
    return NextResponse.json({
      success: true,
      data: clients,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get clients error:', error)
    return NextResponse.json(
      { success: false, error: '企業一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// 企業の並び替え
export async function PATCH(request: NextRequest): Promise<NextResponse<ApiResponse<Client[]>>> {
  try {
    await requireAuth()

    const body = await request.json()
    const { orderedIds } = body

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json(
        { success: false, error: '並び順が無効です' },
        { status: 400 }
      )
    }

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    const clients = await loadClients()

    // 指定された順序で並び替え
    const orderedClients = orderedIds
      .map(id => clients.find(c => c.id === id))
      .filter((c): c is Client => c !== undefined)

    // 指定されていないクライアントは末尾に追加
    const remainingClients = clients.filter(c => !orderedIds.includes(c.id))
    const newClients = [...orderedClients, ...remainingClients]

    await saveClients(newClients)

    return NextResponse.json({
      success: true,
      data: newClients,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Reorder clients error:', error)
    return NextResponse.json(
      { success: false, error: '並び替えに失敗しました' },
      { status: 500 }
    )
  }
}

// 企業IDを自動生成
function generateClientId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 6)
  return `client-${timestamp}-${random}`
}

// 企業追加
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<Client>>> {
  try {
    await requireAuth()

    const body = await request.json()
    const { name } = body

    // バリデーション
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return NextResponse.json(
        { success: false, error: '企業名を入力してください（100文字以内）' },
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

    const clientId = generateClientId()

    // 企業用フォルダを作成
    const pdcaFolderId = getPdcaFolderId()
    const clientFolderId = await ensureFolder(name.trim(), pdcaFolderId)

    const newClient: Client = {
      id: clientId,
      name: name.trim(),
      drive_folder_id: clientFolderId,
      created_at: new Date().toISOString(),
    }

    // Drive保存
    const clients = await loadClients()
    clients.push(newClient)
    await saveClients(clients)

    return NextResponse.json({
      success: true,
      data: newClient,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    // サーバーログには詳細を記録（内部情報はログのみ）
    console.error('Add client error:', error)
    return NextResponse.json(
      { success: false, error: '企業の追加に失敗しました' },
      { status: 500 }
    )
  }
}
