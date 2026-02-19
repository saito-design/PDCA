import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Task, PdcaCycle } from '@/lib/types'
import { isDriveConfigured, loadJsonFromFolder } from '@/lib/drive'
import {
  getClientFolderId,
  loadEntities,
  getEntityFolderId,
  saveAllTasks,
  saveAllCycles,
} from '@/lib/entity-helpers'

const TASKS_FILENAME = 'tasks.json'
const CYCLES_FILENAME = 'cycles.json'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

interface RebuildResult {
  tasksCount: number
  cyclesCount: number
  entitiesProcessed: number
}

// まとめJSONリビルド
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

    // 全部署を取得
    const entities = await loadEntities(clientFolderId)

    const allTasks: Task[] = []
    const allCycles: PdcaCycle[] = []
    let entitiesProcessed = 0

    // 各部署のデータを収集
    for (const entity of entities) {
      try {
        const entityFolderId = await getEntityFolderId(clientFolderId, entity.id)
        if (!entityFolderId) {
          console.warn(`部署フォルダが見つかりません: ${entity.name}`)
          continue
        }

        // タスク読み込み
        const tasksResult = await loadJsonFromFolder<Task[]>(TASKS_FILENAME, entityFolderId)
        if (tasksResult?.data) {
          allTasks.push(...tasksResult.data)
        }

        // サイクル読み込み
        const cyclesResult = await loadJsonFromFolder<PdcaCycle[]>(CYCLES_FILENAME, entityFolderId)
        if (cyclesResult?.data) {
          allCycles.push(...cyclesResult.data)
        }

        entitiesProcessed++
      } catch (error) {
        console.warn(`部署データ読み込みエラー (${entity.name}):`, error)
      }
    }

    // まとめJSONを保存
    await saveAllTasks(allTasks, clientFolderId)
    await saveAllCycles(allCycles, clientFolderId)

    return NextResponse.json({
      success: true,
      data: {
        tasksCount: allTasks.length,
        cyclesCount: allCycles.length,
        entitiesProcessed,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Rebuild aggregate error:', error)
    return NextResponse.json(
      { success: false, error: 'まとめJSONの再構築に失敗しました' },
      { status: 500 }
    )
  }
}
