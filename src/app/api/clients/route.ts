import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Client } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// ローカル保存用のパス
const LOCAL_CLIENTS_PATH = path.join(process.cwd(), '.cache', 'clients.json')

// ローカルクライアントを読み込む
function loadLocalClients(): Client[] {
  try {
    if (fs.existsSync(LOCAL_CLIENTS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CLIENTS_PATH, 'utf-8'))
    }
  } catch {
    console.warn('ローカルクライアント読み込みエラー')
  }
  return []
}

// ローカルクライアントを保存
function saveLocalClients(clients: Client[]): void {
  try {
    const dir = path.dirname(LOCAL_CLIENTS_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(LOCAL_CLIENTS_PATH, JSON.stringify(clients, null, 2))
  } catch (e) {
    console.error('ローカルクライアント保存エラー:', e)
  }
}

// マスター企業データ
const masterClients: Client[] = [
  {
    id: 'junestory',
    name: '株式会社ジュネストリー',
    drive_folder_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'tottori-kyosai',
    name: '鳥取県市町村職員共済組合',
    drive_folder_id: null,
    created_at: '2026-02-16T00:00:00.000Z',
  },
]

// 全クライアントを取得（マスター + ローカル追加分）
function getAllClients(): Client[] {
  const localClients = loadLocalClients()
  const merged = [...masterClients]
  for (const lc of localClients) {
    if (!merged.find(c => c.id === lc.id)) {
      merged.push(lc)
    }
  }
  return merged
}

export async function GET(): Promise<NextResponse<ApiResponse<Client[]>>> {
  try {
    await requireAuth()

    return NextResponse.json({
      success: true,
      data: getAllClients(),
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

// 企業IDを自動生成
function generateClientId(name: string): string {
  // 名前からスラッグを生成（シンプルなID）
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

    const newClient: Client = {
      id: generateClientId(name),
      name: name.trim(),
      drive_folder_id: null,
      created_at: new Date().toISOString(),
    }

    // ローカル保存
    const localClients = loadLocalClients()
    localClients.push(newClient)
    saveLocalClients(localClients)

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
    console.error('Add client error:', error)
    return NextResponse.json(
      { success: false, error: '企業の追加に失敗しました' },
      { status: 500 }
    )
  }
}
