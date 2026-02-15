import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { refreshCache, getCacheUpdatedAt } from '@/lib/excel-reader'

type RouteContext = {
  params: Promise<{ clientId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth()
    const { clientId } = await context.params

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
    console.error('Data refresh error:', error)
    const message = error instanceof Error ? error.message : 'データ更新に失敗しました'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth()
    const { clientId } = await context.params

    // クライアントIDのマッピング
    const excelClientId = clientId === 'demo-client-1' ? 'junestory' : clientId

    const updatedAt = getCacheUpdatedAt(excelClientId)

    return NextResponse.json({
      success: true,
      updatedAt,
    })
  } catch (error) {
    console.error('Get cache info error:', error)
    return NextResponse.json(
      { success: false, error: 'キャッシュ情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}
