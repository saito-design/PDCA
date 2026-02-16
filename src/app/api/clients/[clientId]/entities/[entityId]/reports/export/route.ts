import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { saveFile, ensureFolder } from '@/lib/drive'
import { ApiResponse, PdcaIssue, PdcaCycle, Entity, Client } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// ローカル保存用のパス
const LOCAL_CLIENTS_PATH = path.join(process.cwd(), '.cache', 'clients.json')
const LOCAL_ENTITIES_PATH = path.join(process.cwd(), '.cache', 'entities.json')
const LOCAL_ISSUES_PATH = path.join(process.cwd(), '.cache', 'pdca-issues.json')
const LOCAL_CYCLES_PATH = path.join(process.cwd(), '.cache', 'pdca-cycles.json')

// マスター企業データ
const masterClients: Client[] = [
  {
    id: 'junestory',
    name: '株式会社ジュネストリー',
    drive_folder_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'tottori-kyosai',
    name: '鳥取県市町村職員共済組合',
    drive_folder_id: null,
    created_at: '2026-02-16T00:00:00.000Z',
  },
]

function loadLocalClients(): Client[] {
  try {
    if (fs.existsSync(LOCAL_CLIENTS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CLIENTS_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

function loadLocalEntities(): Record<string, Entity[]> {
  try {
    if (fs.existsSync(LOCAL_ENTITIES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_ENTITIES_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function loadLocalIssues(): PdcaIssue[] {
  try {
    if (fs.existsSync(LOCAL_ISSUES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_ISSUES_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

function loadLocalCycles(): PdcaCycle[] {
  try {
    if (fs.existsSync(LOCAL_CYCLES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CYCLES_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

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

    // ローカルデータから取得
    const allClients = [...masterClients, ...loadLocalClients()]
    const client = allClients.find(c => c.id === clientId)

    const allEntities = loadLocalEntities()
    const entityList = allEntities[clientId] || []
    const entity = entityList.find(e => e.id === entityId)

    if (!client || !entity) {
      return NextResponse.json(
        { success: false, error: 'データが見つかりません' },
        { status: 404 }
      )
    }

    // イシューとサイクルを取得
    const allIssues = loadLocalIssues()
    const allCycles = loadLocalCycles()

    const filteredIssues = allIssues.filter(
      i => i.client_id === clientId && i.entity_id === entityId
    )

    const issuesWithCycles = filteredIssues.map(issue => ({
      ...issue,
      cycles: allCycles.filter(c => c.issue_id === issue.id).sort(
        (a, b) => new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()
      ),
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
