'use client'

import { Clock, CheckCircle, PlayCircle, PauseCircle, Circle } from 'lucide-react'
import type { PdcaCycle, PdcaStatus } from '@/lib/types'

const STATUS_CONFIG: Record<PdcaStatus, { label: string; color: string; icon: typeof Circle }> = {
  open: { label: '未着手', color: 'text-gray-500 bg-gray-100', icon: Circle },
  doing: { label: '進行中', color: 'text-blue-600 bg-blue-100', icon: PlayCircle },
  done: { label: '完了', color: 'text-green-600 bg-green-100', icon: CheckCircle },
  paused: { label: '保留', color: 'text-yellow-600 bg-yellow-100', icon: PauseCircle },
}

interface PdcaCycleHistoryProps {
  cycles: PdcaCycle[]
  onSelect: (cycle: PdcaCycle) => void
  selectedId?: string
}

export function PdcaCycleHistory({ cycles, onSelect, selectedId }: PdcaCycleHistoryProps) {
  const sortedCycles = [...cycles].sort(
    (a, b) => new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()
  )

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-gray-500" />
        <h3 className="font-semibold">サイクル履歴</h3>
      </div>

      <div className="space-y-3">
        {sortedCycles.map((cycle) => {
          const config = STATUS_CONFIG[cycle.status]
          const Icon = config.icon

          return (
            <button
              key={cycle.id}
              onClick={() => onSelect(cycle)}
              className={`w-full p-3 rounded-xl text-left border transition-colors ${
                selectedId === cycle.id
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-medium">
                  {new Date(cycle.cycle_date).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <span
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.color}`}
                >
                  <Icon size={12} />
                  {config.label}
                </span>
              </div>

              {cycle.target && (
                <div className="text-sm text-gray-600 mb-1">
                  <span className="font-medium">目標:</span> {cycle.target}
                </div>
              )}

              {cycle.action && (
                <div className="text-xs text-gray-500 line-clamp-2">
                  {cycle.action}
                </div>
              )}
            </button>
          )
        })}

        {cycles.length === 0 && (
          <div className="text-center text-gray-500 py-4 text-sm">
            サイクル履歴がありません
          </div>
        )}
      </div>
    </div>
  )
}
