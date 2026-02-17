'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronUp, CheckCircle, PlayCircle, PauseCircle, Circle, ListTodo, Save, Edit3 } from 'lucide-react'
import type { PdcaCycle, PdcaStatus } from '@/lib/types'
import { parseTextWithTasks } from '@/lib/task-utils'

const STATUS_CONFIG: Record<PdcaStatus, { label: string; color: string; icon: typeof Circle }> = {
  open: { label: '未着手', color: 'text-gray-500 bg-gray-100', icon: Circle },
  doing: { label: '進行中', color: 'text-blue-600 bg-blue-100', icon: PlayCircle },
  done: { label: '完了', color: 'text-green-600 bg-green-100', icon: CheckCircle },
  paused: { label: '保留', color: 'text-yellow-600 bg-yellow-100', icon: PauseCircle },
}

interface MeetingHistoryProps {
  cycles: PdcaCycle[]
  loading?: boolean
  onUpdateCycle?: (cycle: PdcaCycle) => Promise<void>
}

// タスクをハイライト表示するコンポーネント
function ActionWithTasks({ text }: { text: string }) {
  const parts = parseTextWithTasks(text)

  return (
    <div className="space-y-1">
      {parts.map((part, index) => {
        if (part.type === 'task') {
          return (
            <div
              key={index}
              className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-800 px-2 py-1 rounded-md text-sm font-medium mr-1 mb-1"
            >
              <ListTodo size={14} className="text-green-600" />
              {part.content}
            </div>
          )
        }
        // 通常テキスト（改行を保持）
        return (
          <span key={index} className="whitespace-pre-wrap">
            {part.content}
          </span>
        )
      })}
    </div>
  )
}

interface CycleCardProps {
  cycle: PdcaCycle
  defaultExpanded?: boolean
  onUpdate?: (cycle: PdcaCycle) => Promise<void>
}

function CycleCard({ cycle, defaultExpanded = false, onUpdate }: CycleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editData, setEditData] = useState({
    situation: cycle.situation,
    issue: cycle.issue,
    action: cycle.action,
    target: cycle.target,
    status: cycle.status,
  })

  const config = STATUS_CONFIG[editData.status]
  const Icon = config.icon

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const handleSave = async () => {
    if (!onUpdate) return
    setSaving(true)
    try {
      await onUpdate({
        ...cycle,
        situation: editData.situation,
        issue: editData.issue,
        action: editData.action,
        target: editData.target,
        status: editData.status,
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditData({
      situation: cycle.situation,
      issue: cycle.issue,
      action: cycle.action,
      target: cycle.target,
      status: cycle.status,
    })
    setEditing(false)
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
        <div className="flex items-center gap-2">
          {expanded && onUpdate && !editing && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true) }}
              className="text-gray-400 hover:text-blue-600 p-1"
              title="編集"
            >
              <Edit3 size={14} />
            </button>
          )}
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t bg-gray-50">
          <div className="pt-3">
            {editing ? (
              /* 編集モード */
              <div className="space-y-3">
                {/* ステータス選択 */}
                <div className="flex gap-2">
                  {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                    const StatusIcon = cfg.icon
                    return (
                      <button
                        key={status}
                        onClick={() => setEditData(prev => ({ ...prev, status: status as PdcaStatus }))}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                          editData.status === status ? cfg.color : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <StatusIcon size={12} />
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-blue-600 mb-1 block">現状（S）</label>
                    <textarea
                      value={editData.situation}
                      onChange={(e) => setEditData(prev => ({ ...prev, situation: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-orange-600 mb-1 block">課題</label>
                    <textarea
                      value={editData.issue}
                      onChange={(e) => setEditData(prev => ({ ...prev, issue: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-green-600 mb-1 block">アクション / タスク</label>
                    <textarea
                      value={editData.action}
                      onChange={(e) => setEditData(prev => ({ ...prev, action: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-purple-600 mb-1 block">目標（T）</label>
                    <textarea
                      value={editData.target}
                      onChange={(e) => setEditData(prev => ({ ...prev, target: e.target.value }))}
                      className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
                    />
                  </div>
                </div>

                {/* 保存・キャンセルボタン */}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={handleCancel}
                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save size={14} />
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            ) : (
              /* 表示モード */
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

                {/* Action with Tasks */}
                <div className="bg-white rounded-lg p-3 border">
                  <div className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                    <ListTodo size={12} />
                    アクション / タスク
                  </div>
                  <div className="text-sm text-gray-700">
                    {cycle.action ? (
                      <ActionWithTasks text={cycle.action} />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function MeetingHistory({ cycles, loading, onUpdateCycle }: MeetingHistoryProps) {
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
        {onUpdateCycle && <span className="text-xs text-blue-500">編集可能</span>}
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
              defaultExpanded={index === 0}
              onUpdate={onUpdateCycle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
