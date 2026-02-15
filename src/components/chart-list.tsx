'use client'

import { useRef } from 'react'
import { GripVertical, Trash2, Eye, EyeOff } from 'lucide-react'
import type { ChartConfig } from '@/lib/types'
import { METRICS, AGGS } from './chart-renderer'

interface ChartListProps {
  charts: ChartConfig[]
  onToggleShow: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
}

export function ChartList({ charts, onToggleShow, onRemove, onReorder }: ChartListProps) {
  const dragIdRef = useRef<string | null>(null)

  const sortedCharts = [...charts].sort((a, b) => a.sortOrder - b.sortOrder)

  const handleDragStart = (id: string) => {
    dragIdRef.current = id
  }

  const handleDrop = (toId: string) => {
    if (dragIdRef.current && dragIdRef.current !== toId) {
      onReorder(dragIdRef.current, toId)
    }
    dragIdRef.current = null
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-end justify-between gap-2 mb-3">
        <div>
          <div className="font-semibold">作成済みグラフ</div>
          <div className="text-xs text-gray-500">
            ドラッグで順番変更（この順でダッシュボードにも出る）
          </div>
        </div>
        <div className="text-xs text-gray-500">件数: {charts.length}</div>
      </div>

      <div className="space-y-2">
        {sortedCharts.map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={() => handleDragStart(c.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(c.id)}
            className="flex items-center justify-between gap-2 border rounded-xl bg-white p-3 cursor-move hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <GripVertical size={16} className="text-gray-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate">{c.title}</div>
                <div className="text-xs text-gray-500 truncate">
                  {c.type === 'line' ? '折れ線' : '棒'} /{' '}
                  {AGGS.find((a) => a.key === c.aggKey)?.label} / 系列:{' '}
                  {c.seriesKeys
                    .map((k) => METRICS.find((m) => m.key === k)?.label ?? k)
                    .join('・')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onToggleShow(c.id)}
                className={`p-2 rounded-lg ${
                  c.showOnDashboard
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={c.showOnDashboard ? 'ダッシュボードに表示中' : 'ダッシュボードに表示する'}
              >
                {c.showOnDashboard ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              <button
                onClick={() => onRemove(c.id)}
                className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600"
                title="削除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {charts.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-4">
            まだグラフがありません
          </div>
        )}
      </div>
    </div>
  )
}
