import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse } from '@/lib/types'
import { isDriveConfigured } from '@/lib/drive'
import {
  getClientFolderId,
  loadMasterData,
  MasterData,
} from '@/lib/entity-helpers'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

// マスターデータ取得（企業全体のissues + cycles）
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<MasterData>>> {
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
      return NextResponse.json({
        success: true,
        data: { version: '1.0', updated_at: '', issues: [], cycles: [] },
      })
    }

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const masterData = await loadMasterData(clientFolderId)

    if (!masterData) {
      // master-data.jsonがない場合は空データを返す
      return NextResponse.json({
        success: true,
        data: { version: '1.0', updated_at: '', issues: [], cycles: [] },
      })
    }

    return NextResponse.json({ success: true, data: masterData })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get master data error:', error)
    return NextResponse.json(
      { success: false, error: 'マスターデータの取得に失敗しました' },
      { status: 500 }
    )
  }
}
