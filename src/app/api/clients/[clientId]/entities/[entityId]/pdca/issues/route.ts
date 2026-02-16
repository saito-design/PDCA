import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaIssue } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// ローカル保存用のパス
const LOCAL_ISSUES_PATH = path.join(process.cwd(), '.cache', 'pdca-issues.json')

// ローカルイシューを読み込む
function loadLocalIssues(): PdcaIssue[] {
  try {
    if (fs.existsSync(LOCAL_ISSUES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_ISSUES_PATH, 'utf-8'))
    }
  } catch {
    console.warn('ローカルイシュー読み込みエラー')
  }
  return []
}

// ローカルイシューを保存
function saveLocalIssues(issues: PdcaIssue[]): void {
  try {
    const dir = path.dirname(LOCAL_ISSUES_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(LOCAL_ISSUES_PATH, JSON.stringify(issues, null, 2))
  } catch (e) {
    console.error('ローカルイシュー保存エラー:', e)
  }
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

    const allIssues = loadLocalIssues()
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

    const { title } = body

    if (!title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json(
        { success: false, error: 'タイトルが無効です' },
        { status: 400 }
      )
    }

    const newIssue: PdcaIssue = {
      id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      client_id: clientId,
      entity_id: entityId,
      title,
      created_at: new Date().toISOString(),
    }

    const allIssues = loadLocalIssues()
    allIssues.push(newIssue)
    saveLocalIssues(allIssues)

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
