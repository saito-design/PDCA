import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaCycle, PdcaStatus } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// ローカル保存用のパス
const LOCAL_CYCLES_PATH = path.join(process.cwd(), '.cache', 'pdca-cycles.json')

// ローカルサイクルを読み込む
function loadLocalCycles(): PdcaCycle[] {
  try {
    if (fs.existsSync(LOCAL_CYCLES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CYCLES_PATH, 'utf-8'))
    }
  } catch {
    console.warn('ローカルサイクル読み込みエラー')
  }
  return []
}

// ローカルサイクルを保存
function saveLocalCycles(cycles: PdcaCycle[]): void {
  try {
    const dir = path.dirname(LOCAL_CYCLES_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(LOCAL_CYCLES_PATH, JSON.stringify(cycles, null, 2))
  } catch (e) {
    console.error('ローカルサイクル保存エラー:', e)
  }
}

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

    const allCycles = loadLocalCycles()
    const filtered = allCycles.filter(
      (c) => c.client_id === clientId && c.issue_id === issueId
    )

    // サイクル日付の降順でソート
    filtered.sort((a, b) => new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime())

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
    console.error('Get cycles error:', error)
    return NextResponse.json(
      { success: false, error: 'サイクル一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// サイクル作成
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

    const newCycle: PdcaCycle = {
      id: `cycle-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

    const allCycles = loadLocalCycles()
    allCycles.push(newCycle)
    saveLocalCycles(allCycles)

    return NextResponse.json({
      success: true,
      data: newCycle,
    })
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

    const allCycles = loadLocalCycles()
    const idx = allCycles.findIndex((c) => c.id === id && c.client_id === clientId && c.issue_id === issueId)

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'サイクルが見つかりません' },
        { status: 404 }
      )
    }

    // 更新
    if (situation !== undefined) allCycles[idx].situation = situation
    if (issue !== undefined) allCycles[idx].issue = issue
    if (action !== undefined) allCycles[idx].action = action
    if (target !== undefined) allCycles[idx].target = target
    if (status !== undefined) allCycles[idx].status = status
    allCycles[idx].updated_at = new Date().toISOString()

    saveLocalCycles(allCycles)

    return NextResponse.json({
      success: true,
      data: allCycles[idx],
    })
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
