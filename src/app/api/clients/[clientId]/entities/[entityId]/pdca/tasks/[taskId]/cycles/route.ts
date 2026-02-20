import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaCycle, PdcaStatus } from '@/lib/types'
import { isDriveConfigured } from '@/lib/drive'
import {
  getClientFolderId,
  loadMasterData,
  saveMasterData,
  extractAndAddTasksFromCycle,
} from '@/lib/entity-helpers'

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string; taskId: string }>
}

// サイクル一覧取得
export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<PdcaCycle[]>>> {
  try {
    await requireAuth()
    const { clientId, entityId, taskId } = await context.params

    if (!clientId || !entityId || !taskId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    // Google Driveが未設定の場合
    if (!isDriveConfigured()) {
      return NextResponse.json({
        success: true,
        data: [],
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
    const allCycles = masterData?.cycles || []
    const filtered = allCycles.filter((c) => c.issue_id === taskId)

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
    const { clientId, entityId, taskId } = await context.params
    const body = await request.json()

    if (!clientId || !entityId || !taskId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    // Google Driveが未設定の場合はエラー
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
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

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const newCycle: PdcaCycle = {
      id: `cycle-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      client_id: clientId,
      entity_id: entityId,
      issue_id: taskId,
      cycle_date,
      situation: situation || '',
      issue: issue || '',
      action: action || '',
      target: target || '',
      status: (status as PdcaStatus) || 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const masterData = await loadMasterData(clientFolderId) || {
      version: '1.0',
      updated_at: '',
      issues: [],
      cycles: [],
    }
    masterData.cycles.push(newCycle)

    // アクション内の【】タスクを自動抽出してissuesに追加
    extractAndAddTasksFromCycle(masterData, newCycle)

    await saveMasterData(masterData, clientFolderId)

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
    const { clientId, entityId, taskId } = await context.params
    const body = await request.json()

    if (!clientId || !entityId || !taskId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    // Google Driveが未設定の場合はエラー
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    const { id, situation, issue, action, target, status } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'サイクルIDが必要です' },
        { status: 400 }
      )
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
      return NextResponse.json(
        { success: false, error: 'マスターデータがありません' },
        { status: 404 }
      )
    }

    const idx = masterData.cycles.findIndex((c) => c.id === id && c.issue_id === taskId)

    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'サイクルが見つかりません' },
        { status: 404 }
      )
    }

    // 更新
    if (situation !== undefined) masterData.cycles[idx].situation = situation
    if (issue !== undefined) masterData.cycles[idx].issue = issue
    if (action !== undefined) masterData.cycles[idx].action = action
    if (target !== undefined) masterData.cycles[idx].target = target
    if (status !== undefined) masterData.cycles[idx].status = status
    masterData.cycles[idx].updated_at = new Date().toISOString()

    // アクションが更新された場合、新規タスクを抽出
    if (action !== undefined) {
      extractAndAddTasksFromCycle(masterData, masterData.cycles[idx])
    }

    await saveMasterData(masterData, clientFolderId)

    return NextResponse.json({
      success: true,
      data: masterData.cycles[idx],
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
