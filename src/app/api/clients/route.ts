import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { ApiResponse, Client } from '@/lib/types'

// デモ用データ（Supabase未接続時）
const demoClients: Client[] = [
  {
    id: 'junestory',
    name: '株式会社ジュネストリー',
    drive_folder_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-client-1',
    name: 'デモ企業A',
    drive_folder_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-client-2',
    name: 'デモ企業B',
    drive_folder_id: null,
    created_at: new Date().toISOString(),
  },
]

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
        data: demoClients,
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
