import { Client, Entity, PdcaCycle, PdcaIssue } from '@/lib/types'
import {
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
  findFolderByName,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const ENTITIES_FILENAME = 'entities.json'
const MASTER_DATA_FILENAME = 'master-data.json'

// マスターデータの型
export interface MasterData {
  version: string
  updated_at: string
  issues: (PdcaIssue & { entity_name?: string; date?: string })[]
  cycles: PdcaCycle[]
}

// Google Driveからクライアント一覧を読み込む
export async function loadClients(): Promise<Client[]> {
  try {
    const pdcaFolderId = getPdcaFolderId()
    const result = await loadJsonFromFolder<Client[]>(CLIENTS_FILENAME, pdcaFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('クライアント読み込みエラー:', error)
    return []
  }
}

// 企業のdrive_folder_idを取得
export async function getClientFolderId(clientId: string): Promise<string | null> {
  const clients = await loadClients()
  const client = clients.find(c => c.id === clientId)
  return client?.drive_folder_id || null
}

// エンティティ一覧を読み込む
export async function loadEntities(clientFolderId: string): Promise<Entity[]> {
  try {
    const result = await loadJsonFromFolder<Entity[]>(ENTITIES_FILENAME, clientFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('エンティティ読み込みエラー:', error)
    return []
  }
}

// エンティティ一覧を保存
export async function saveEntities(entities: Entity[], clientFolderId: string): Promise<void> {
  await saveJsonToFolder(entities, ENTITIES_FILENAME, clientFolderId)
}

// 部署のdrive_folder_idを取得（なければフォルダ名で検索してentities.jsonを更新）
export async function getEntityFolderId(
  clientFolderId: string,
  entityId: string
): Promise<string | null> {
  const entities = await loadEntities(clientFolderId)
  const entity = entities.find(e => e.id === entityId)

  if (!entity) {
    return null
  }

  // drive_folder_idがあればそのまま返す
  if (entity.drive_folder_id) {
    return entity.drive_folder_id
  }

  // なければフォルダ名で検索
  try {
    const folderId = await findFolderByName(entity.name, clientFolderId)
    if (folderId) {
      // entities.jsonを更新
      entity.drive_folder_id = folderId
      await saveEntities(entities, clientFolderId)
      console.log(`Entity ${entity.name} のdrive_folder_idを更新: ${folderId}`)
      return folderId
    }
  } catch (error) {
    console.warn(`フォルダ検索エラー (${entity.name}):`, error)
  }

  return null
}

// 部署情報を取得
export async function getEntity(
  clientFolderId: string,
  entityId: string
): Promise<Entity | null> {
  const entities = await loadEntities(clientFolderId)
  return entities.find(e => e.id === entityId) || null
}

// ========================================
// マスターデータ（統合JSON）操作
// ========================================

// マスターデータ読み込み
export async function loadMasterData(clientFolderId: string): Promise<MasterData | null> {
  try {
    const result = await loadJsonFromFolder<MasterData>(MASTER_DATA_FILENAME, clientFolderId)
    if (result?.data) {
      console.log('loadMasterData: master-data.json loaded', {
        issues: result.data.issues?.length || 0,
        cycles: result.data.cycles?.length || 0,
      })
      return result.data
    }
    return null
  } catch (error) {
    console.warn('マスターデータ読み込みエラー:', error)
    return null
  }
}

// マスターデータ保存
export async function saveMasterData(data: MasterData, clientFolderId: string): Promise<void> {
  data.updated_at = new Date().toISOString()
  await saveJsonToFolder(data, MASTER_DATA_FILENAME, clientFolderId)
}

// ========================================
// アクション内タスク自動抽出
// ========================================

// アクション文字列から【】で囲まれたタスクを抽出
export function extractTasksFromAction(action: string): string[] {
  if (!action || !action.includes('【')) return []
  const matches = action.match(/【([^】]+)】/g) || []
  return matches.map(m => m.replace(/【|】/g, ''))
}

// サイクルのアクションから新規タスクを抽出してissuesに追加
export function extractAndAddTasksFromCycle(
  masterData: MasterData,
  cycle: PdcaCycle
): number {
  const tasks = extractTasksFromAction(cycle.action)
  if (tasks.length === 0) return 0

  const existingTitles = new Set(masterData.issues.map(i => i.title))
  const now = new Date().toISOString()
  let addedCount = 0

  for (const taskTitle of tasks) {
    if (!existingTitles.has(taskTitle)) {
      const newIssue: PdcaIssue & { entity_name?: string; date?: string } = {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        client_id: cycle.client_id,
        entity_id: cycle.entity_id || '',
        title: taskTitle,
        status: 'open',
        date: cycle.cycle_date,
        created_at: now,
        updated_at: now,
      }
      masterData.issues.push(newIssue)
      existingTitles.add(taskTitle)
      addedCount++
      console.log(`extractAndAddTasksFromCycle: 新規タスク追加 "${taskTitle}"`)
    }
  }

  return addedCount
}

