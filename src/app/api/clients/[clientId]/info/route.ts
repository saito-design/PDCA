import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getClientDataInfo, refreshCache } from '@/lib/excel-reader'
import { ApiResponse } from '@/lib/types'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    const info = getClientDataInfo(clientId)

    return NextResponse.json({
      success: true,
      data: info,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get client info error:', error)
    return NextResponse.json(
      { success: false, error: '情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// データ更新
export async function POST(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    const result = refreshCache(clientId)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        updatedAt: result.updatedAt,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Refresh cache error:', error)
    return NextResponse.json(
      { success: false, error: 'データの更新に失敗しました' },
      { status: 500 }
    )
  }
}
