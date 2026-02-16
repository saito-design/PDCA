import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ApiResponse, Client, PdcaIssue, PdcaCycle, Entity } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// ローカル保存用のパス
const LOCAL_CLIENTS_PATH = path.join(process.cwd(), '.cache', 'clients.json')
const LOCAL_ENTITIES_PATH = path.join(process.cwd(), '.cache', 'entities.json')
const LOCAL_ISSUES_PATH = path.join(process.cwd(), '.cache', 'pdca-issues.json')
const LOCAL_CYCLES_PATH = path.join(process.cwd(), '.cache', 'pdca-cycles.json')
const LOCAL_CHARTS_PATH = path.join(process.cwd(), '.cache', 'charts.json')

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

function saveLocalClients(clients: Client[]): void {
  try {
    const dir = path.dirname(LOCAL_CLIENTS_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(LOCAL_CLIENTS_PATH, JSON.stringify(clients, null, 2))
  } catch (e) {
    console.error('ローカルクライアント保存エラー:', e)
  }
}

function loadLocalEntities(): Record<string, Entity[]> {
  try {
    if (fs.existsSync(LOCAL_ENTITIES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_ENTITIES_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function saveLocalEntities(entities: Record<string, Entity[]>): void {
  try {
    fs.writeFileSync(LOCAL_ENTITIES_PATH, JSON.stringify(entities, null, 2))
  } catch { /* ignore */ }
}

function loadLocalIssues(): PdcaIssue[] {
  try {
    if (fs.existsSync(LOCAL_ISSUES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_ISSUES_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

function saveLocalIssues(issues: PdcaIssue[]): void {
  try {
    fs.writeFileSync(LOCAL_ISSUES_PATH, JSON.stringify(issues, null, 2))
  } catch { /* ignore */ }
}

function loadLocalCycles(): PdcaCycle[] {
  try {
    if (fs.existsSync(LOCAL_CYCLES_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CYCLES_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

function saveLocalCycles(cycles: PdcaCycle[]): void {
  try {
    fs.writeFileSync(LOCAL_CYCLES_PATH, JSON.stringify(cycles, null, 2))
  } catch { /* ignore */ }
}

function loadLocalCharts(): Record<string, unknown[]> {
  try {
    if (fs.existsSync(LOCAL_CHARTS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_CHARTS_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function saveLocalCharts(charts: Record<string, unknown[]>): void {
  try {
    fs.writeFileSync(LOCAL_CHARTS_PATH, JSON.stringify(charts, null, 2))
  } catch { /* ignore */ }
}

type RouteParams = {
  params: Promise<{ clientId: string }>
}

// 企業の関連データ数を取得
interface ClientStats {
  entityCount: number
  issueCount: number
  cycleCount: number
  chartCount: number
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse<{ client: Client; stats: ClientStats }>>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
        { status: 400 }
      )
    }

    // クライアントを検索
    const allClients = [...masterClients, ...loadLocalClients()]
    const client = allClients.find(c => c.id === clientId)

    if (!client) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    // 関連データ数を集計
    const entities = loadLocalEntities()[clientId] || []
    const issues = loadLocalIssues().filter(i => i.client_id === clientId)
    const cycles = loadLocalCycles().filter(c => c.client_id === clientId)
    const charts = loadLocalCharts()[clientId] || []

    const stats: ClientStats = {
      entityCount: entities.length,
      issueCount: issues.length,
      cycleCount: cycles.length,
      chartCount: charts.length,
    }

    return NextResponse.json({
      success: true,
      data: { client, stats },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Get client error:', error)
    return NextResponse.json(
      { success: false, error: '企業情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// 企業削除
export async function DELETE(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse<ApiResponse>> {
  try {
    await requireAuth()
    const { clientId } = await context.params

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: '無効なクライアントIDです' },
        { status: 400 }
      )
    }

    // マスター企業は削除不可
    if (masterClients.find(c => c.id === clientId)) {
      return NextResponse.json(
        { success: false, error: 'マスター企業は削除できません' },
        { status: 400 }
      )
    }

    // ローカルクライアントから削除
    const localClients = loadLocalClients()
    const clientIndex = localClients.findIndex(c => c.id === clientId)

    if (clientIndex === -1) {
      return NextResponse.json(
        { success: false, error: '企業が見つかりません' },
        { status: 404 }
      )
    }

    // クライアントを削除
    localClients.splice(clientIndex, 1)
    saveLocalClients(localClients)

    // 関連データも削除
    // エンティティ
    const entities = loadLocalEntities()
    delete entities[clientId]
    saveLocalEntities(entities)

    // イシュー
    const issues = loadLocalIssues()
    const filteredIssues = issues.filter(i => i.client_id !== clientId)
    saveLocalIssues(filteredIssues)

    // サイクル
    const cycles = loadLocalCycles()
    const filteredCycles = cycles.filter(c => c.client_id !== clientId)
    saveLocalCycles(filteredCycles)

    // グラフ
    const charts = loadLocalCharts()
    delete charts[clientId]
    saveLocalCharts(charts)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }
    console.error('Delete client error:', error)
    return NextResponse.json(
      { success: false, error: '企業の削除に失敗しました' },
      { status: 500 }
    )
  }
}
