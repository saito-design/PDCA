import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { refreshCache, getCacheUpdatedAt } from '@/lib/excel-reader'

type RouteContext = {
  params: Promise<{ clientId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)

    // クライアントIDのマッピング
    const excelClientId = clientId === 'demo-client-1' ? 'junestory' : clientId

    const result = refreshCache(excelClientId)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'データを更新しました',
        updatedAt: result.updatedAt,
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { success: false, error: 'アクセス権限がありません' },
        { status: 403 }
      )
    }
    console.error('Data refresh error:', error)
    return NextResponse.json(
      { success: false, error: 'データ更新に失敗しました' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)

    // クライアントIDのマッピング
    const excelClientId = clientId === 'demo-client-1' ? 'junestory' : clientId

    const updatedAt = getCacheUpdatedAt(excelClientId)

    return NextResponse.json({
      success: true,
      updatedAt,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json(
        { success: false, error: 'アクセス権限がありません' },
        { status: 403 }
      )
    }
    console.error('Get cache info error:', error)
    return NextResponse.json(
      { success: false, error: 'キャッシュ情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}
