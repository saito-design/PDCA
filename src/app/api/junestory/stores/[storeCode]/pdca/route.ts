import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

interface PdcaCycle {
  id: string
  client_id: string
  entity_id: string
  issue_id: string
  cycle_date: string
  situation: string
  issue: string
  action: string
  target: string
  status: 'open' | 'doing' | 'done' | 'paused'
  created_at: string
  updated_at: string
}

interface StoreTask {
  id: string
  title: string
  status: 'open' | 'doing' | 'done' | 'paused'
  created_at: string
  updated_at: string
}

interface StorePdcaData {
  store_code: string
  cycles: PdcaCycle[]
  tasks: StoreTask[]
}

const DATA_DIR = path.join(process.cwd(), 'data', 'junestory', 'pdca')

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true })
  }
}

async function loadStorePdca(storeCode: string): Promise<StorePdcaData> {
  await ensureDataDir()
  const filePath = path.join(DATA_DIR, `${storeCode}.json`)
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {
      store_code: storeCode,
      cycles: [],
      tasks: [],
    }
  }
}

async function saveStorePdca(storeCode: string, data: StorePdcaData): Promise<void> {
  await ensureDataDir()
  const filePath = path.join(DATA_DIR, `${storeCode}.json`)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

// 【】からタスクを抽出
function extractTasks(text: string): string[] {
  const matches = text.match(/【([^】]+)】/g) || []
  return matches.map(m => m.slice(1, -1))
}

type RouteContext = {
  params: Promise<{ storeCode: string }>
}

// GET: PDCAデータ取得
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { storeCode } = await context.params
    const data = await loadStorePdca(storeCode)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PDCA GET error:', error)
    return NextResponse.json(
      { success: false, error: 'データ取得に失敗しました' },
      { status: 500 }
    )
  }
}

// POST: 新規サイクル追加
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { storeCode } = await context.params
    const body = await request.json()
    const { situation, issue, action, target } = body

    const data = await loadStorePdca(storeCode)
    const now = new Date().toISOString()

    // 新規サイクル作成
    const newCycle: PdcaCycle = {
      id: `cycle-${Date.now()}`,
      client_id: 'junestory',
      entity_id: storeCode,
      issue_id: 'store-meeting',
      cycle_date: now.split('T')[0],
      situation: situation || '',
      issue: issue || '',
      action: action || '',
      target: target || '',
      status: 'open',
      created_at: now,
      updated_at: now,
    }
    data.cycles.push(newCycle)

    // アクションからタスクを抽出して追加
    const taskTitles = extractTasks(action || '')
    for (const title of taskTitles) {
      // 同名タスクがなければ追加
      if (!data.tasks.some(t => t.title === title)) {
        data.tasks.push({
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          status: 'open',
          created_at: now,
          updated_at: now,
        })
      }
    }

    await saveStorePdca(storeCode, data)

    return NextResponse.json({ success: true, data: newCycle })
  } catch (error) {
    console.error('PDCA POST error:', error)
    return NextResponse.json(
      { success: false, error: '保存に失敗しました' },
      { status: 500 }
    )
  }
}

// PATCH: サイクルまたはタスク更新
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { storeCode } = await context.params
    const body = await request.json()
    const { id, type, ...updates } = body

    const data = await loadStorePdca(storeCode)
    const now = new Date().toISOString()

    if (type === 'task') {
      // タスク更新
      const taskIndex = data.tasks.findIndex(t => t.id === id)
      if (taskIndex === -1) {
        return NextResponse.json(
          { success: false, error: 'タスクが見つかりません' },
          { status: 404 }
        )
      }
      data.tasks[taskIndex] = {
        ...data.tasks[taskIndex],
        ...updates,
        updated_at: now,
      }
    } else {
      // サイクル更新
      const cycleIndex = data.cycles.findIndex(c => c.id === id)
      if (cycleIndex === -1) {
        return NextResponse.json(
          { success: false, error: 'サイクルが見つかりません' },
          { status: 404 }
        )
      }
      data.cycles[cycleIndex] = {
        ...data.cycles[cycleIndex],
        ...updates,
        updated_at: now,
      }

      // アクションが更新された場合、タスクも更新
      if (updates.action) {
        const taskTitles = extractTasks(updates.action)
        for (const title of taskTitles) {
          if (!data.tasks.some(t => t.title === title)) {
            data.tasks.push({
              id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              title,
              status: 'open',
              created_at: now,
              updated_at: now,
            })
          }
        }
      }
    }

    await saveStorePdca(storeCode, data)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('PDCA PATCH error:', error)
    return NextResponse.json(
      { success: false, error: '更新に失敗しました' },
      { status: 500 }
    )
  }
}
