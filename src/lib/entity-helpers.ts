import { Client, Entity, Task, PdcaCycle, PdcaIssue } from '@/lib/types'
import {
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
  findFolderByName,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const ENTITIES_FILENAME = 'entities.json'
const ALL_TASKS_FILENAME = 'all-tasks.json'
const ALL_CYCLES_FILENAME = 'all-cycles.json'
const ALL_PDCA_ISSUES_FILENAME = 'all-pdca-issues.json'
const PDCA_ISSUES_FILENAME = 'pdca-issues.json'
const PDCA_CYCLES_FILENAME = 'pdca-cycles.json'

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
// まとめJSON操作関数
// ========================================

// 全タスク読み込み（企業フォルダ直下の all-tasks.json）
export async function loadAllTasks(clientFolderId: string): Promise<Task[]> {
  try {
    const result = await loadJsonFromFolder<Task[]>(ALL_TASKS_FILENAME, clientFolderId)
    return result?.data || []
  } catch (error) {
    console.warn('全タスク読み込みエラー:', error)
    return []
  }
}

// 全タスク保存
export async function saveAllTasks(tasks: Task[], clientFolderId: string): Promise<void> {
  await saveJsonToFolder(tasks, ALL_TASKS_FILENAME, clientFolderId)
}

// 全サイクル読み込み（まとめJSONがなければ元のpdca-cycles.jsonから読む）
export async function loadAllCycles(clientFolderId: string): Promise<PdcaCycle[]> {
  try {
    // まずまとめJSONを試す
    const result = await loadJsonFromFolder<PdcaCycle[]>(ALL_CYCLES_FILENAME, clientFolderId)
    if (result?.data && result.data.length > 0) {
      return result.data
    }
    // なければ元のpdca-cycles.jsonから読む（フォールバック）
    const fallback = await loadJsonFromFolder<PdcaCycle[]>(PDCA_CYCLES_FILENAME, clientFolderId)
    return fallback?.data || []
  } catch (error) {
    console.warn('全サイクル読み込みエラー:', error)
    // エラー時も元ファイルを試す
    try {
      const fallback = await loadJsonFromFolder<PdcaCycle[]>(PDCA_CYCLES_FILENAME, clientFolderId)
      return fallback?.data || []
    } catch {
      return []
    }
  }
}

// 全サイクル保存
export async function saveAllCycles(cycles: PdcaCycle[], clientFolderId: string): Promise<void> {
  await saveJsonToFolder(cycles, ALL_CYCLES_FILENAME, clientFolderId)
}

// 全PDCAイシュー読み込み（まとめJSONがなければ元のpdca-issues.jsonから読む）
export async function loadAllIssues(clientFolderId: string): Promise<PdcaIssue[]> {
  try {
    // まずまとめJSONを試す
    const result = await loadJsonFromFolder<PdcaIssue[]>(ALL_PDCA_ISSUES_FILENAME, clientFolderId)
    if (result?.data && result.data.length > 0) {
      return result.data
    }
    // なければ元のpdca-issues.jsonから読む（フォールバック）
    const fallback = await loadJsonFromFolder<PdcaIssue[]>(PDCA_ISSUES_FILENAME, clientFolderId)
    return fallback?.data || []
  } catch (error) {
    console.warn('全PDCAイシュー読み込みエラー:', error)
    // エラー時も元ファイルを試す
    try {
      const fallback = await loadJsonFromFolder<PdcaIssue[]>(PDCA_ISSUES_FILENAME, clientFolderId)
      return fallback?.data || []
    } catch {
      return []
    }
  }
}

// 全PDCAイシュー保存
export async function saveAllIssues(issues: PdcaIssue[], clientFolderId: string): Promise<void> {
  await saveJsonToFolder(issues, ALL_PDCA_ISSUES_FILENAME, clientFolderId)
}

// タスクをまとめJSONに追加
export async function addTaskToAggregate(task: Task, clientFolderId: string): Promise<void> {
  const allTasks = await loadAllTasks(clientFolderId)
  allTasks.push(task)
  await saveAllTasks(allTasks, clientFolderId)
}

// タスクをまとめJSONで更新
export async function updateTaskInAggregate(task: Task, clientFolderId: string): Promise<void> {
  const allTasks = await loadAllTasks(clientFolderId)
  const idx = allTasks.findIndex(t => t.id === task.id)
  if (idx !== -1) {
    allTasks[idx] = task
  } else {
    // 見つからない場合は追加
    allTasks.push(task)
  }
  await saveAllTasks(allTasks, clientFolderId)
}

// タスクをまとめJSONから削除
export async function removeTaskFromAggregate(taskId: string, clientFolderId: string): Promise<void> {
  const allTasks = await loadAllTasks(clientFolderId)
  const filtered = allTasks.filter(t => t.id !== taskId)
  await saveAllTasks(filtered, clientFolderId)
}

// サイクルをまとめJSONに追加
export async function addCycleToAggregate(cycle: PdcaCycle, clientFolderId: string): Promise<void> {
  const allCycles = await loadAllCycles(clientFolderId)
  allCycles.push(cycle)
  await saveAllCycles(allCycles, clientFolderId)
}

// サイクルをまとめJSONで更新
export async function updateCycleInAggregate(cycle: PdcaCycle, clientFolderId: string): Promise<void> {
  const allCycles = await loadAllCycles(clientFolderId)
  const idx = allCycles.findIndex(c => c.id === cycle.id)
  if (idx !== -1) {
    allCycles[idx] = cycle
  } else {
    allCycles.push(cycle)
  }
  await saveAllCycles(allCycles, clientFolderId)
}

// サイクルをまとめJSONから削除
export async function removeCycleFromAggregate(cycleId: string, clientFolderId: string): Promise<void> {
  const allCycles = await loadAllCycles(clientFolderId)
  const filtered = allCycles.filter(c => c.id !== cycleId)
  await saveAllCycles(filtered, clientFolderId)
}

// PDCAイシューをまとめJSONに追加
export async function addIssueToAggregate(issue: PdcaIssue, clientFolderId: string): Promise<void> {
  const allIssues = await loadAllIssues(clientFolderId)
  allIssues.push(issue)
  await saveAllIssues(allIssues, clientFolderId)
}

// PDCAイシューをまとめJSONで更新
export async function updateIssueInAggregate(issue: PdcaIssue, clientFolderId: string): Promise<void> {
  const allIssues = await loadAllIssues(clientFolderId)
  const idx = allIssues.findIndex(i => i.id === issue.id)
  if (idx !== -1) {
    allIssues[idx] = issue
  } else {
    allIssues.push(issue)
  }
  await saveAllIssues(allIssues, clientFolderId)
}

// PDCAイシューをまとめJSONから削除
export async function removeIssueFromAggregate(issueId: string, clientFolderId: string): Promise<void> {
  const allIssues = await loadAllIssues(clientFolderId)
  const filtered = allIssues.filter(i => i.id !== issueId)
  await saveAllIssues(filtered, clientFolderId)
}
