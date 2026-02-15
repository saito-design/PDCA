import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { ApiResponse, PdcaCycle, PdcaStatus } from '@/lib/types'

// デモ用データ
const demoCycles: PdcaCycle[] = [
  {
    id: 'cycle-1',
    client_id: 'demo-client-1',
    issue_id: 'issue-1',
    cycle_date: '2025-02-01',
    situation: '朝食利用率は60%、平均単価は1,200円',
    issue: '単価が競合比で低い。メニューの魅力不足',
    action: 'プレミアムメニュー3品追加、ディスプレイ改善',
    target: '2月末までに単価1,500円達成',
    status: 'doing',
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
  },
  {
    id: 'cycle-2',
    client_id: 'demo-client-1',
    issue_id: 'issue-1',
    cycle_date: '2025-01-15',
    situation: '朝食利用率は55%、平均単価は1,100円',
    issue: '利用率が低い。認知不足',
    action: 'チェックイン時の案内強化',
    target: '1月末までに利用率60%達成',
    status: 'done',
    created_at: '2025-01-15T00:00:00Z',
    updated_at: '2025-01-31T00:00:00Z',
  },
]

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string; issueId: string }>
}

// サイクル一覧取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle[]>>> {
  try {
    await requireAuth()
    const { clientId, issueId } = await context.params

    if (!clientId || !issueId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('pdca_cycles')
        .select('*')
        .eq('client_id', clientId)
        .eq('issue_id', issueId)
        .order('cycle_date', { ascending: false })

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as PdcaCycle[],
      })
    } catch {
      // デモモード
      return NextResponse.json({
        success: true,
        data: demoCycles.filter((c) => c.issue_id === issueId),
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get cycles error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクル一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// サイクル作成/更新
export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle>>> {
  try {
    await requireAuth()
    const { clientId, issueId } = await context.params
    const body = await request.json()

    if (!clientId || !issueId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    const { cycle_date, situation, issue, action, target, status } = body

    // バリデーション
    if (!cycle_date) {
      return NextResponse.json(
        { success: false, error: 'サイクル日付が必要です' },
        { status: 400 }
      )
    }

    if (status && !['open', 'doing', 'done', 'paused'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'ステータスが無効です' },
        { status: 400 }
      )
    }

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('pdca_cycles')
        .insert({
          client_id: clientId,
          issue_id: issueId,
          cycle_date,
          situation: situation || '',
          issue: issue || '',
          action: action || '',
          target: target || '',
          status: (status as PdcaStatus) || 'open',
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as PdcaCycle,
      })
    } catch {
      // デモモード
      const newCycle: PdcaCycle = {
        id: `cycle-${Date.now()}`,
        client_id: clientId,
        issue_id: issueId,
        cycle_date,
        situation: situation || '',
        issue: issue || '',
        action: action || '',
        target: target || '',
        status: (status as PdcaStatus) || 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      demoCycles.push(newCycle)

      return NextResponse.json({
        success: true,
        data: newCycle,
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Create cycle error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクルの作成に失敗しました' },
      { status: 500 }
    )
  }
}

// サイクル更新
export async function PATCH(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle>>> {
  try {
    await requireAuth()
    const { clientId, issueId } = await context.params
    const body = await request.json()

    if (!clientId || !issueId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    const { id, situation, issue, action, target, status } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'サイクルIDが必要です' },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (situation !== undefined) updates.situation = situation
    if (issue !== undefined) updates.issue = issue
    if (action !== undefined) updates.action = action
    if (target !== undefined) updates.target = target
    if (status !== undefined) updates.status = status

    try {
      const supabase = getSupabaseServer()
      const { data, error } = await supabase
        .from('pdca_cycles')
        .update(updates)
        .eq('id', id)
        .eq('client_id', clientId)
        .eq('issue_id', issueId)
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        data: data as PdcaCycle,
      })
    } catch {
      // デモモード
      const idx = demoCycles.findIndex((c) => c.id === id)
      if (idx >= 0) {
        demoCycles[idx] = { ...demoCycles[idx], ...updates } as PdcaCycle
        return NextResponse.json({
          success: true,
          data: demoCycles[idx],
        })
      }
      return NextResponse.json(
        { success: false, error: 'サイクルが見つかりません' },
        { status: 404 }
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Update cycle error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクルの更新に失敗しました' },
      { status: 500 }
    )
  }
}
