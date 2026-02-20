import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaIssue } from '@/lib/types'
import { isDriveConfigured } from '@/lib/drive'
import {
  getClientFolderId,
  loadMasterData,
} from '@/lib/entity-helpers'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

// 全PDCAイシュー取得（企業全体）
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

    if (!isDriveConfigured()) {
      return NextResponse.json({ success: true, data: [] })
    }

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const masterData = await loadMasterData(clientFolderId)
    const issues = masterData?.issues || []

    // 更新日の降順でソート
    issues.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return NextResponse.json({ success: true, data: issues })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get all pdca issues error:', error)
    return NextResponse.json(
      { success: false, error: '全PDCAイシュー一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}
