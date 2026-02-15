'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronUp, CheckCircle, PlayCircle, PauseCircle, Circle } from 'lucide-react'
import type { PdcaCycle, PdcaStatus } from '@/lib/types'

const STATUS_CONFIG: Record<PdcaStatus, { label: string; color: string; icon: typeof Circle }> = {
  open: { label: '未着手', color: 'text-gray-500 bg-gray-100', icon: Circle },
  doing: { label: '進行中', color: 'text-blue-600 bg-blue-100', icon: PlayCircle },
  done: { label: '完了', color: 'text-green-600 bg-green-100', icon: CheckCircle },
  paused: { label: '保留', color: 'text-yellow-600 bg-yellow-100', icon: PauseCircle },
}

interface MeetingHistoryProps {
  cycles: PdcaCycle[]
  loading?: boolean
}

function CycleCard({ cycle, defaultExpanded = false }: { cycle: PdcaCycle; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const config = STATUS_CONFIG[cycle.status]
  const Icon = config.icon

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">{formatDate(cycle.cycle_date)}</div>
          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.color}`}>
            <Icon size={12} />
            {config.label}
          </span>
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t bg-gray-50">
          <div className="pt-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Situation */}
              <div className="bg-white rounded-lg p-3 border">
                <div className="text-xs font-semibold text-blue-600 mb-1">現状（S）</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {cycle.situation || <span className="text-gray-400">-</span>}
                </div>
              </div>

              {/* Issue (課題) */}
              <div className="bg-white rounded-lg p-3 border">
                <div className="text-xs font-semibold text-orange-600 mb-1">課題</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {cycle.issue || <span className="text-gray-400">-</span>}
                </div>
              </div>

              {/* Action */}
              <div className="bg-white rounded-lg p-3 border">
                <div className="text-xs font-semibold text-green-600 mb-1">アクション（A）</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {cycle.action || <span className="text-gray-400">-</span>}
                </div>
              </div>

              {/* Target */}
              <div className="bg-white rounded-lg p-3 border">
                <div className="text-xs font-semibold text-purple-600 mb-1">目標（T）</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {cycle.target || <span className="text-gray-400">-</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function MeetingHistory({ cycles, loading }: MeetingHistoryProps) {
  // 日付降順でソート
  const sortedCycles = [...cycles].sort(
    (a, b) => new Date(b.cycle_date).getTime() - new Date(a.cycle_date).getTime()
  )

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-gray-500" />
          <h3 className="font-semibold">過去のミーティング</h3>
        </div>
        <div className="text-center text-gray-500 py-8">
          読み込み中...
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center gap-2 mb-4">
        <History size={18} className="text-gray-500" />
        <h3 className="font-semibold">過去のミーティング</h3>
        <span className="text-xs text-gray-400">({sortedCycles.length}件)</span>
      </div>

      {sortedCycles.length === 0 ? (
        <div className="text-center text-gray-500 py-8 text-sm">
          まだミーティング履歴がありません
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {sortedCycles.map((cycle, index) => (
            <CycleCard
              key={cycle.id}
              cycle={cycle}
              defaultExpanded={index === 0} // 最新のものだけ展開
            />
          ))}
        </div>
      )}
    </div>
  )
}
