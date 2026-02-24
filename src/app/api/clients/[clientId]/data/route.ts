import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { getClientFolderId } from '@/lib/entity-helpers'
import {
  getMonthlySummary as getDriveMonthlySummary,
  getLatestKpis as getDriveKpis,
  getMonthlyData as getDriveMonthlyData,
  getDepartments,
  getAvailableMetrics,
} from '@/lib/drive-data-reader'

type RouteContext = {
  params: Promise<{ clientId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)
    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department') || undefined
    const type = searchParams.get('type') || 'summary'

    // Drive JSONベースのデータ取得
    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json({ success: true, data: [] })
    }

    switch (type) {
      case 'summary': {
        const data = await getDriveMonthlySummary(clientId, department)
        return NextResponse.json({ success: true, data })
      }
      case 'departments': {
        const data = await getDepartments(clientId)
        return NextResponse.json({ success: true, data })
      }
      case 'kpi': {
        const data = await getDriveKpis(clientId, department)
        return NextResponse.json({ success: true, data })
      }
      case 'fields':
      case 'metrics': {
        const data = await getAvailableMetrics(clientId, department)
        return NextResponse.json({ success: true, data })
      }
      case 'monthly': {
        const metricsParam = searchParams.get('metrics')
        const metrics = metricsParam ? metricsParam.split(',') : undefined
        const data = await getDriveMonthlyData(clientId, department, metrics)
        return NextResponse.json({ success: true, data })
      }
      default:
        return NextResponse.json(
          { success: false, error: '不正なtypeパラメータ' },
          { status: 400 }
        )
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json(
          { success: false, error: '認証が必要です' },
          { status: 401 }
        )
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json(
          { success: false, error: 'アクセス権限がありません' },
          { status: 403 }
        )
      }
    }
    console.error('Data API error:', error)
    return NextResponse.json(
      { success: false, error: 'データ取得に失敗しました' },
      { status: 500 }
    )
  }
}
