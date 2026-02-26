'use client'

import { useState, useEffect } from 'react'
import { Check, X, Database, Hash, Calendar, Type, Settings2 } from 'lucide-react'
import { getSelectedColumns, saveSelectedColumns, SelectedColumn } from '@/lib/column-storage'

interface ColumnInfo {
  name: string
  label?: string
  type: 'number' | 'string' | 'date' | 'unknown'
  unit?: string
  sampleValues: unknown[]
  isSystem?: boolean
  category?: string  // 大項目
}

interface ColumnSelectorProps {
  clientId: string
  entityId?: string
  onClose: () => void
  onSave: (columns: SelectedColumn[]) => void
}

export default function ColumnSelector({
  clientId,
  entityId,
  onClose,
  onSave
}: ColumnSelectorProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selected, setSelected] = useState<Map<string, SelectedColumn>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSystemColumns, setShowSystemColumns] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)  // カテゴリ絞り込み

  useEffect(() => {
    fetchColumns()
    loadSavedSelection()
  }, [clientId, entityId])

  const fetchColumns = async () => {
    try {
      // 部署IDがある場合は部署用APIを使用
      const url = entityId
        ? `/api/clients/${clientId}/entities/${entityId}/columns`
        : `/api/clients/${clientId}/columns`

      const res = await fetch(url)
      const data = await res.json()

      if (data.success) {
        // 部署用APIからのカラム情報をマッピング
        const cols = data.data.columns.map((col: ColumnInfo) => ({
          ...col,
          isSystem: col.isSystem ?? col.name.startsWith('_')
        }))
        setColumns(cols)

        // 大項目（カテゴリ）を設定
        if (data.data.categories) {
          setCategories(data.data.categories)
        }

        // 単位情報があれば自動設定
        if (entityId && cols.length > 0) {
          const saved = getSelectedColumns(clientId, entityId)
          if (saved.length === 0) {
            // 初回は単位情報付きでプリセット
            const preset = new Map<string, SelectedColumn>()
            cols.forEach((col: ColumnInfo) => {
              if (col.type === 'number' && col.unit) {
                preset.set(col.name, {
                  name: col.name,
                  label: col.label || col.name,
                  type: col.type,
                  unit: col.unit
                })
              }
            })
            setSelected(preset)
          }
        }
      } else {
        setError(data.error || 'カラム取得に失敗しました')
      }
    } catch {
      setError('カラム取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const loadSavedSelection = () => {
    const saved = getSelectedColumns(clientId, entityId)
    const map = new Map<string, SelectedColumn>()
    saved.forEach(col => map.set(col.name, col))
    setSelected(map)
  }

  const toggleColumn = (col: ColumnInfo) => {
    setSelected(prev => {
      const newMap = new Map(prev)
      if (newMap.has(col.name)) {
        newMap.delete(col.name)
      } else {
        newMap.set(col.name, {
          name: col.name,
          label: col.label || col.name,
          type: col.type,
          unit: col.unit || (col.type === 'number' ? '' : undefined)
        })
      }
      return newMap
    })
  }

  const updateColumnLabel = (name: string, label: string) => {
    setSelected(prev => {
      const newMap = new Map(prev)
      const col = newMap.get(name)
      if (col) {
        newMap.set(name, { ...col, label })
      }
      return newMap
    })
  }

  const updateColumnUnit = (name: string, unit: string) => {
    setSelected(prev => {
      const newMap = new Map(prev)
      const col = newMap.get(name)
      if (col) {
        newMap.set(name, { ...col, unit })
      }
      return newMap
    })
  }

  const handleSave = () => {
    const selectedArray = Array.from(selected.values())
    saveSelectedColumns(clientId, selectedArray, entityId)
    onSave(selectedArray)
    onClose()
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'number': return <Hash size={14} className="text-blue-500" />
      case 'date': return <Calendar size={14} className="text-green-500" />
      case 'string': return <Type size={14} className="text-orange-500" />
      default: return <Database size={14} className="text-gray-400" />
    }
  }

  // フィルター関数
  const applyFilter = (filterFn: (col: ColumnInfo) => boolean, select: boolean) => {
    setSelected(prev => {
      const newMap = new Map(prev)
      columns.filter(filterFn).forEach(col => {
        if (select) {
          newMap.set(col.name, {
            name: col.name,
            label: col.label || col.name,
            type: col.type,
            unit: col.unit || (col.type === 'number' ? '' : undefined)
          })
        } else {
          newMap.delete(col.name)
        }
      })
      return newMap
    })
  }

  // 全選択
  const selectAll = () => {
    const newMap = new Map<string, SelectedColumn>()
    filteredColumns.forEach(col => {
      newMap.set(col.name, {
        name: col.name,
        label: col.label || col.name,
        type: col.type,
        unit: col.unit || (col.type === 'number' ? '' : undefined)
      })
    })
    setSelected(newMap)
  }

  // カテゴリフィルター（絞り込み表示用）
  const categoryFilters = [
    { label: 'すべて', value: null },
    ...categories.map(cat => ({ label: cat, value: cat }))
  ]

  // カラム一覧のフィルタリング（システムカラム + カテゴリ）
  const filteredColumns = columns.filter(col => {
    if (!showSystemColumns && col.isSystem) return false
    if (categoryFilter && col.category !== categoryFilter) return false
    return true
  })

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 size={20} className="text-blue-600" />
            <h3 className="text-lg font-semibold">データ項目の設定</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {/* システムカラム表示トグル */}
          <div className="flex items-center gap-2 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showSystemColumns}
                onChange={(e) => setShowSystemColumns(e.target.checked)}
                className="rounded"
              />
              システムカラム（_で始まる）を表示
            </label>
          </div>

          {/* カテゴリ絞り込み */}
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-2">カテゴリで絞り込み</div>
            <div className="flex flex-wrap gap-2">
              {categoryFilters.map((filter, idx) => (
                <button
                  key={idx}
                  onClick={() => setCategoryFilter(filter.value)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors active:scale-95 ${
                    categoryFilter === filter.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 active:bg-blue-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* 選択操作 */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={selectAll}
              className="px-3 py-1 text-sm rounded border bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 active:bg-blue-300"
            >
              表示中を全選択
            </button>
            <button
              onClick={() => setSelected(new Map())}
              className="px-3 py-1 text-sm rounded border bg-red-100 text-red-700 border-red-200 hover:bg-red-200 active:bg-red-300"
            >
              全解除
            </button>
          </div>

          {/* カラム一覧 */}
          <div className="space-y-2">
            {filteredColumns.map(col => {
              const isSelected = selected.has(col.name)
              const selectedCol = selected.get(col.name)

              return (
                <div
                  key={col.name}
                  className={`border rounded-lg p-3 transition-colors ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* チェックボックス */}
                    <button
                      onClick={() => toggleColumn(col)}
                      className={`w-5 h-5 rounded flex items-center justify-center border ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <Check size={14} />}
                    </button>

                    {/* カラム情報 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(col.type)}
                        <span className={`font-medium ${col.isSystem ? 'text-gray-400' : ''}`}>
                          {col.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {col.type}
                        </span>
                      </div>
                      {col.sampleValues.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          例: {col.sampleValues.slice(0, 3).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 選択時の詳細設定 */}
                  {isSelected && selectedCol && (
                    <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">表示名</label>
                        <input
                          type="text"
                          value={selectedCol.label}
                          onChange={(e) => updateColumnLabel(col.name, e.target.value)}
                          className="w-full text-sm border rounded px-2 py-1"
                          placeholder={col.name}
                        />
                      </div>
                      {col.type === 'number' && (
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">単位</label>
                          <input
                            type="text"
                            value={selectedCol.unit || ''}
                            onChange={(e) => updateColumnUnit(col.name, e.target.value)}
                            className="w-full text-sm border rounded px-2 py-1"
                            placeholder="円、人、%など"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {selected.size} 項目を選択中
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
