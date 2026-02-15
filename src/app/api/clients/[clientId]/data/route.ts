import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getMonthlySummary, getStoreList, getLatestKpis, getAvailableFields, getMonthlyData } from '@/lib/excel-reader'

type RouteContext = {
  params: Promise<{ clientId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAuth()
    const { clientId } = await context.params
    const { searchParams } = new URL(request.url)
    const store = searchParams.get('store') || undefined
    const type = searchParams.get('type') || 'summary'

    // クライアントIDのマッピング
    // junestory: 実データ、demo-client-1: ジュネストリーのデモ表示
    const excelClientId = clientId === 'demo-client-1' ? 'junestory' : clientId

    switch (type) {
      case 'summary': {
        const data = getMonthlySummary(excelClientId, store)
        return NextResponse.json({ success: true, data })
      }
      case 'stores': {
        const data = getStoreList(excelClientId)
        return NextResponse.json({ success: true, data })
      }
      case 'kpi': {
        const data = getLatestKpis(excelClientId, store)
        return NextResponse.json({ success: true, data })
      }
      case 'fields': {
        const data = getAvailableFields()
        return NextResponse.json({ success: true, data })
      }
      case 'monthly': {
        const data = getMonthlyData(excelClientId, store)
        return NextResponse.json({ success: true, data })
      }
      default:
        return NextResponse.json(
          { success: false, error: '不正なtypeパラメータ' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Data API error:', error)
    const message = error instanceof Error ? error.message : 'データ取得に失敗しました'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
