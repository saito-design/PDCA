import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { ApiResponse, PdcaIssue } from '@/lib/types'

// デモ用データ
const demoIssues: PdcaIssue[] = [
  { id: 'issue-1', client_id: 'demo-client-1', entity_id: 'demo-entity-1', title: '朝食単価アップ施策', created_at: '2025-01-15T00:00:00Z' },
  { id: 'issue-2', client_id: 'demo-client-1', entity_id: 'demo-entity-1', title: '客室稼働率改善', created_at: '2025-01-20T00:00:00Z' },
  { id: 'issue-3', client_id: 'demo-client-1', entity_id: 'demo-entity-2', title: 'スタッフ教育プログラム', created_at: '2025-02-01T00:00:00Z' },
]

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

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('pdca_issues')
        .select('*')
        .eq('client_id', clientId)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as PdcaIssue[],
      })
    } catch {
      // デモモード
      const filtered = demoIssues.filter(
        (i) => i.client_id === clientId && i.entity_id === entityId
      )
      // デモ用：entityIdがdemo-で始まる場合は全てのデモイシューを返す
      if (entityId.startsWith('demo-')) {
        return NextResponse.json({
          success: true,
          data: demoIssues.filter((i) => i.entity_id === entityId),
        })
      }
      return NextResponse.json({
        success: true,
        data: filtered,
      })
    }
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

    const { title } = body

    if (!title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json(
        { success: false, error: 'タイトルが無効です' },
        { status: 400 }
      )
    }

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('pdca_issues')
        .insert({
          client_id: clientId,
          entity_id: entityId,
          title,
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as PdcaIssue,
      })
    } catch {
      // デモモード
      const newIssue: PdcaIssue = {
        id: `issue-${Date.now()}`,
        client_id: clientId,
        entity_id: entityId,
        title,
        created_at: new Date().toISOString(),
      }
      demoIssues.push(newIssue)

      return NextResponse.json({
        success: true,
        data: newIssue,
      })
    }
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
