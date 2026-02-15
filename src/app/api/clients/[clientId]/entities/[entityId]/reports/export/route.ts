import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSupabaseServer } from '@/lib/supabase'
import { saveFile, ensureFolder } from '@/lib/drive'
import { ApiResponse, PdcaIssue, PdcaCycle, Entity, Client } from '@/lib/types'

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

    // データ取得
    let client: Client | null = null
    let entity: Entity | null = null
    let issues: (PdcaIssue & { cycles: PdcaCycle[] })[] = []

    try {
      const supabase = getSupabaseServer()

      // クライアント情報
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()
      client = clientData as Client

      // エンティティ情報
      const { data: entityData } = await supabase
        .from('entities')
        .select('*')
        .eq('id', entityId)
        .single()
      entity = entityData as Entity

      // イシュー一覧
      const { data: issuesData } = await supabase
        .from('pdca_issues')
        .select('*')
        .eq('client_id', clientId)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })

      // 各イシューのサイクル取得
      for (const issue of (issuesData || []) as PdcaIssue[]) {
        const { data: cyclesData } = await supabase
          .from('pdca_cycles')
          .select('*')
          .eq('issue_id', issue.id)
          .order('cycle_date', { ascending: false })

        issues.push({
          ...issue,
          cycles: (cyclesData || []) as PdcaCycle[],
        })
      }
    } catch {
      // デモモード
      client = { id: clientId, name: 'デモ企業', drive_folder_id: null, created_at: new Date().toISOString() }
      entity = { id: entityId, client_id: clientId, name: 'デモ店舗', sort_order: 10, created_at: new Date().toISOString() }
      issues = [
        {
          id: 'demo-issue-1',
          client_id: clientId,
          entity_id: entityId,
          title: 'サンプルイシュー',
          created_at: new Date().toISOString(),
          cycles: [
            {
              id: 'demo-cycle-1',
              client_id: clientId,
              issue_id: 'demo-issue-1',
              cycle_date: new Date().toISOString().split('T')[0],
              situation: 'サンプル現状',
              issue: 'サンプル課題',
              action: 'サンプルアクション',
              target: 'サンプル目標',
              status: 'doing',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        },
      ]
    }

    if (!client || !entity) {
      return NextResponse.json(
        { success: false, error: 'データが見つかりません' },
        { status: 404 }
      )
    }

    // レポート生成
    const reportData: ReportData = {
      client,
      entity,
      issues,
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
