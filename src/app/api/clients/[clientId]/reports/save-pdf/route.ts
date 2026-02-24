import { NextRequest, NextResponse } from 'next/server'
import { requireClientAccess } from '@/lib/auth'
import { ApiResponse, Task, PdcaCycle, Entity } from '@/lib/types'
import { isDriveConfigured, saveFile } from '@/lib/drive'
import {
  getClientFolderId,
  loadClients,
  loadEntities,
  loadMasterData,
} from '@/lib/entity-helpers'

type RouteParams = {
  params: Promise<{ clientId: string }>
}

interface SavePdfResult {
  fileName: string
  folderId: string
  message: string
}

// ステータスラベル
const STATUS_LABELS: Record<string, string> = {
  open: '未着手',
  doing: '進行中',
  done: '完了',
  paused: '保留',
}

// レポートをテキスト形式で生成
function generateReportText(
  clientName: string,
  entities: Entity[],
  tasks: Task[],
  cycles: PdcaCycle[]
): string {
  const lines: string[] = []
  const now = new Date()

  lines.push(`${clientName} 様`)
  lines.push(``)
  lines.push(`${now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}`)
  lines.push(``)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`    ミーティングメモ`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(``)

  // 完了以外のタスク
  const activeTasks = tasks.filter(t => t.status !== 'done')

  // 部署ごとにセクション作成
  for (const entity of entities) {
    const entityTasks = activeTasks.filter(t => t.entity_name === entity.name)
    const entityCycles = cycles.filter(c => c.entity_id === entity.id)

    // 最新のサイクルを取得
    let latestCycle: PdcaCycle | null = null
    if (entityCycles.length > 0) {
      const sorted = [...entityCycles].sort((a, b) => {
        const dateDiff = new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()
        if (dateDiff !== 0) return dateDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      latestCycle = sorted[0]
    }

    // タスクもサイクルもない部署はスキップ
    if (entityTasks.length === 0 && !latestCycle) continue

    lines.push(``)
    lines.push(`■ ${entity.name}`)
    lines.push(`─────────────────────────────`)

    // ミーティング内容
    if (latestCycle && (latestCycle.situation || latestCycle.issue || latestCycle.action || latestCycle.target)) {
      lines.push(``)
      lines.push(`【ミーティング内容】(${latestCycle.cycle_date})`)
      if (latestCycle.situation) {
        lines.push(`  現状: ${latestCycle.situation}`)
      }
      if (latestCycle.issue) {
        lines.push(`  課題: ${latestCycle.issue}`)
      }
      if (latestCycle.action) {
        lines.push(`  アクション: ${latestCycle.action}`)
      }
      if (latestCycle.target) {
        lines.push(`  目標: ${latestCycle.target}`)
      }
    }

    // 進行中タスク
    if (entityTasks.length > 0) {
      lines.push(``)
      lines.push(`【進行中タスク】(${entityTasks.length}件)`)
      for (const task of entityTasks) {
        const statusLabel = STATUS_LABELS[task.status] || task.status
        lines.push(`  ・${task.title} [${statusLabel}]`)
      }
    }

    lines.push(``)
  }

  return lines.join('\n')
}

export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<SavePdfResult>>> {
  try {
    const { clientId } = await context.params
    await requireClientAccess(clientId)

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

    // 企業情報を取得
    const clients = await loadClients()
    const client = clients.find(c => c.id === clientId)
    if (!client) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    const clientFolderId = await getClientFolderId(clientId)
    if (!clientFolderId) {
      return NextResponse.json(
        { success: false, error: '企業フォルダが見つかりません' },
        { status: 404 }
      )
    }

    // データ取得
    const entities = await loadEntities(clientFolderId)
    const masterData = await loadMasterData(clientFolderId)
    const issues = masterData?.issues || []
    const cycles = masterData?.cycles || []

    // issuesをTask形式に変換
    const tasks: Task[] = issues.map(issue => ({
      id: issue.id,
      client_id: issue.client_id,
      entity_name: issue.entity_name || '',
      title: issue.title,
      status: issue.status,
      date: issue.date || issue.created_at.split('T')[0],
      created_at: issue.created_at,
      updated_at: issue.updated_at,
    }))

    // レポート生成
    const reportText = generateReportText(client.name, entities, tasks, cycles)

    // ファイル名生成（ミーティングメモ_{企業名}様_{年月}）
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const fileName = `ミーティングメモ_${client.name}様_${year}${month}.txt`

    // 企業フォルダ直下に保存
    await saveFile(reportText, fileName, 'text/plain', clientFolderId)

    return NextResponse.json({
      success: true,
      data: {
        fileName,
        folderId: clientFolderId,
        message: `「${client.name}」フォルダに保存しました。`,
      },
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
    console.error('Save PDF error:', error)
    return NextResponse.json(
      { success: false, error: 'PDF保存に失敗しました' },
      { status: 500 }
    )
  }
}
