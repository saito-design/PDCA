import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, PdcaIssue, PdcaCycle, Task } from '@/lib/types'
import { isDriveConfigured, loadJsonFromFolder, saveJsonToFolder } from '@/lib/drive'
import { getClientFolderId, loadEntities } from '@/lib/entity-helpers'

const PDCA_ISSUES_FILENAME = 'pdca-issues.json'
const PDCA_CYCLES_FILENAME = 'pdca-cycles.json'
const TASKS_FILENAME = 'tasks.json'
const MASTER_DATA_FILENAME = 'master-data.json'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

interface MasterData {
  version: string
  updated_at: string
  issues: (PdcaIssue & { entity_name?: string; date?: string })[]
  cycles: PdcaCycle[]
}

interface RebuildResult {
  issuesCount: number
  cyclesCount: number
  message: string
}

export async function POST(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<RebuildResult>>> {
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
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    // エンティティ一覧を取得（entity_name解決用）
    const entities = await loadEntities(clientFolderId)
    const entityMap = new Map(entities.map(e => [e.id, e.name]))

    // 既存の3ファイルを読み込む
    let pdcaIssues: PdcaIssue[] = []
    let pdcaCycles: PdcaCycle[] = []
    let tasks: Task[] = []

    try {
      const issuesResult = await loadJsonFromFolder<PdcaIssue[]>(PDCA_ISSUES_FILENAME, clientFolderId)
      pdcaIssues = issuesResult?.data || []
    } catch (e) {
      console.warn('pdca-issues.json読み込みスキップ:', e)
    }

    try {
      const cyclesResult = await loadJsonFromFolder<PdcaCycle[]>(PDCA_CYCLES_FILENAME, clientFolderId)
      pdcaCycles = cyclesResult?.data || []
    } catch (e) {
      console.warn('pdca-cycles.json読み込みスキップ:', e)
    }

    try {
      const tasksResult = await loadJsonFromFolder<Task[]>(TASKS_FILENAME, clientFolderId)
      tasks = tasksResult?.data || []
    } catch (e) {
      console.warn('tasks.json読み込みスキップ:', e)
    }

    // tasksからentity_nameとdateを取得するマップを作成
    const taskMap = new Map(tasks.map(t => [t.id, { entity_name: t.entity_name, date: t.date }]))

    // issuesにentity_nameとdateを追加
    const enrichedIssues = pdcaIssues.map(issue => {
      const taskInfo = taskMap.get(issue.id)
      return {
        ...issue,
        entity_name: taskInfo?.entity_name || entityMap.get(issue.entity_id) || '',
        date: taskInfo?.date || issue.created_at.split('T')[0],
      }
    })

    // master-data.jsonを生成
    const masterData: MasterData = {
      version: '1.0',
      updated_at: new Date().toISOString(),
      issues: enrichedIssues,
      cycles: pdcaCycles,
    }

    // Google Driveに保存
    await saveJsonToFolder(masterData, MASTER_DATA_FILENAME, clientFolderId)

    return NextResponse.json({
      success: true,
      data: {
        issuesCount: enrichedIssues.length,
        cyclesCount: pdcaCycles.length,
        message: `master-data.json を生成しました（issues: ${enrichedIssues.length}件, cycles: ${pdcaCycles.length}件）`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Rebuild master-data error:', error)
    return NextResponse.json(
      { success: false, error: 'master-dataの再構築に失敗しました' },
      { status: 500 }
    )
  }
}
