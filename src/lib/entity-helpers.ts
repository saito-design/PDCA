import { Client, Entity } from '@/lib/types'
import {
  getPdcaFolderId,
  loadJsonFromFolder,
  saveJsonToFolder,
  findFolderByName,
} from '@/lib/drive'

const CLIENTS_FILENAME = 'clients.json'
const ENTITIES_FILENAME = 'entities.json'

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
