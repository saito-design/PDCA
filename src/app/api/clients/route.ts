import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
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

// デモ用データ（Supabase未接続時）
const defaultClients: Client[] = [
  {
    id: 'junestory',
    name: '株式会社ジュネストリー',
    drive_folder_id: null,
    created_at: new Date().toISOString(),
  },
]

// デモクライアントを取得（ローカル保存と統合）
function getDemoClients(): Client[] {
  const localClients = loadLocalClients()
  // デフォルトクライアントとローカルクライアントをマージ（IDで重複排除）
  const merged = [...defaultClients]
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

    // Supabaseから取得を試みる
    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name')

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as Client[],
      })
    } catch {
      // Supabase未接続時はデモデータ
      console.warn('Supabase接続エラー: デモデータを使用')
      return NextResponse.json({
        success: true,
        data: getDemoClients(),
      })
    }
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

// 企業追加
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<Client>>> {
  try {
    await requireAuth()

    const body = await request.json()
    const { id, name } = body

    // バリデーション
    if (!id || typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json(
        { success: false, error: 'IDは英小文字・数字・ハイフンのみ使用できます' },
        { status: 400 }
      )
    }
    if (!name || typeof name !== 'string' || name.length > 100) {
      return NextResponse.json(
        { success: false, error: '企業名が無効です' },
        { status: 400 }
      )
    }

    // 重複チェック
    const existing = getDemoClients()
    if (existing.find(c => c.id === id)) {
      return NextResponse.json(
        { success: false, error: 'このIDは既に使用されています' },
        { status: 400 }
      )
    }

    const newClient: Client = {
      id,
      name,
      drive_folder_id: null,
      created_at: new Date().toISOString(),
    }

    // Supabaseに保存を試みる
    try {
      const supabase = getSupabaseServer()
      const { error } = await supabase.from('clients').insert(newClient)
      if (error) throw error
    } catch {
      // Supabase未接続時はローカル保存
      const localClients = loadLocalClients()
      localClients.push(newClient)
      saveLocalClients(localClients)
    }

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
