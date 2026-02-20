import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { saveFile, ensureFolder, isDriveConfigured } from '@/lib/drive'
import { ApiResponse, PdcaIssue, PdcaCycle, Entity, Client } from '@/lib/types'
import {
  loadClients,
  loadEntities,
  loadAllIssues,
  loadAllCycles,
  getClientFolderId,
} from '@/lib/entity-helpers'

type RouteParams = {
  params: Promise<{ clientId: string; entityId: string }>
}

interface ReportData {
  client: Client
  entity: Entity
  issues: (PdcaIssue & { cycles: PdcaCycle[] })[]
  generatedAt: string
}

// レポートをマークダウン形式で生成
function generateMarkdownReport(data: ReportData): string {
  const lines: string[] = []

  lines.push(`# PDCAレポート`)
  lines.push(``)
  lines.push(`**企業**: ${data.client.name}`)
  lines.push(`**部署/店舗**: ${data.entity.name}`)
  lines.push(`**生成日時**: ${new Date(data.generatedAt).toLocaleString('ja-JP')}`)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)

  for (const issue of data.issues) {
    lines.push(`## ${issue.title}`)
    lines.push(``)
    lines.push(`作成日: ${new Date(issue.created_at).toLocaleDateString('ja-JP')}`)
    lines.push(``)

    if (issue.cycles.length === 0) {
      lines.push(`_サイクル履歴なし_`)
      lines.push(``)
    } else {
      for (const cycle of issue.cycles) {
        lines.push(`### ${cycle.cycle_date} (${getStatusLabel(cycle.status)})`)
        lines.push(``)
        if (cycle.situation) {
          lines.push(`**現状 (S)**`)
          lines.push(cycle.situation)
          lines.push(``)
        }
        if (cycle.issue) {
          lines.push(`**課題 (I)**`)
          lines.push(cycle.issue)
          lines.push(``)
        }
        if (cycle.action) {
          lines.push(`**アクション (A)**`)
          lines.push(cycle.action)
          lines.push(``)
        }
        if (cycle.target) {
          lines.push(`**目標 (T)**`)
          lines.push(cycle.target)
          lines.push(``)
        }
        lines.push(`---`)
        lines.push(``)
      }
    }
  }

  return lines.join('\n')
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '未着手',
    doing: '進行中',
    done: '完了',
    paused: '保留',
  }
  return labels[status] || status
}

export async function POST(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<{ fileId: string; webViewLink: string }>>> {
  try {
    await requireAuth()
    const { clientId, entityId } = await context.params

    if (!clientId || !entityId) {
      return NextResponse.json(
        { success: false, error: '無効なパラメータです' },
        { status: 400 }
      )
    }

    // Drive未設定の場合
    if (!isDriveConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Driveが設定されていません' },
        { status: 500 }
      )
    }

    // Driveからクライアント情報を取得
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

    // Driveからエンティティ情報を取得
    const entities = await loadEntities(clientFolderId)
    const entity = entities.find(e => e.id === entityId)

    if (!entity) {
      return NextResponse.json(
        { success: false, error: '部署が見つかりません' },
        { status: 404 }
      )
    }

    // Driveからイシューとサイクルを取得
    const allIssues = await loadAllIssues(clientFolderId)
    const allCycles = await loadAllCycles(clientFolderId)

    // デバッグログ
    console.log('Export Debug:', {
      entityId,
      entityName: entity.name,
      totalIssues: allIssues.length,
      totalCycles: allCycles.length,
      issueEntityIds: allIssues.map(i => ({ id: i.id, entity_id: i.entity_id, title: i.title })).slice(0, 5),
    })

    // 部署でフィルタリング（entity_idがない場合はclient_idのみでフィルタ）
    const filteredIssues = allIssues.filter(
      i => i.entity_id === entityId || (!i.entity_id && i.client_id === clientId)
    )

    const issuesWithCycles = filteredIssues.map(issue => ({
      ...issue,
      cycles: allCycles
        .filter(c => c.issue_id === issue.id)
        .sort((a, b) => new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()),
    }))

    // レポート生成
    const reportData: ReportData = {
      client,
      entity,
      issues: issuesWithCycles,
      generatedAt: new Date().toISOString(),
    }

    const markdown = generateMarkdownReport(reportData)

    // Google Driveに保存
    const driveFolderId = client.drive_folder_id || process.env.DEFAULT_DRIVE_FOLDER_ID

    if (!driveFolderId) {
      // Google Drive未設定の場合はダウンロード用にレスポンス
      return NextResponse.json({
        success: true,
        data: {
          fileId: 'local',
          webViewLink: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
        },
      })
    }

    try {
      // レポートフォルダを確保
      const reportsFolderId = await ensureFolder('PDCAレポート', driveFolderId)

      // ファイル名生成
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `PDCA_${entity.name}_${timestamp}.md`

      // 保存
      const result = await saveFile(markdown, filename, 'text/markdown', reportsFolderId)

      return NextResponse.json({
        success: true,
        data: {
          fileId: result.id!,
          webViewLink: result.webViewLink!,
        },
      })
    } catch (driveError) {
      console.error('Drive save error:', driveError)
      // Drive保存失敗時もダウンロード用にレスポンス
      return NextResponse.json({
        success: true,
        data: {
          fileId: 'local',
          webViewLink: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
        },
      })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Export error:', error)
    return NextResponse.json(
      { success: false, error: 'レポートの出力に失敗しました' },
      { status: 500 }
    )
  }
}
