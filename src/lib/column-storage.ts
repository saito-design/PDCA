// localStorageでカラム選択状態を管理

const STORAGE_KEY_PREFIX = 'pdca_columns_'

export interface SelectedColumn {
  name: string
  label: string  // 表示名（カスタマイズ可能）
  type: 'number' | 'string' | 'date' | 'unknown'
  unit?: string  // 単位（円、人、%など）
}

// 保存キーを生成
function getStorageKey(clientId: string, entityId?: string): string {
  if (entityId) {
    return `${STORAGE_KEY_PREFIX}${clientId}_${entityId}`
  }
  return `${STORAGE_KEY_PREFIX}${clientId}`
}

// 選択されたカラムを取得
export function getSelectedColumns(clientId: string, entityId?: string): SelectedColumn[] {
  if (typeof window === 'undefined') return []

  const key = getStorageKey(clientId, entityId)
  const stored = localStorage.getItem(key)

  if (!stored) return []

  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

// 選択されたカラムを保存
export function saveSelectedColumns(
  clientId: string,
  columns: SelectedColumn[],
  entityId?: string
): void {
  if (typeof window === 'undefined') return

  const key = getStorageKey(clientId, entityId)
  localStorage.setItem(key, JSON.stringify(columns))
}

// 選択をクリア
export function clearSelectedColumns(clientId: string, entityId?: string): void {
  if (typeof window === 'undefined') return

  const key = getStorageKey(clientId, entityId)
  localStorage.removeItem(key)
}

// カラムが選択されているかチェック
export function isColumnSelected(
  clientId: string,
  columnName: string,
  entityId?: string
): boolean {
  const selected = getSelectedColumns(clientId, entityId)
  return selected.some(col => col.name === columnName)
}
