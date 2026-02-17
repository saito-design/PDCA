'use client'

import { CheckCircle, PlayCircle, PauseCircle, Circle, AlertCircle, ListTodo } from 'lucide-react'
import type { Entity, PdcaStatus, Task } from '@/lib/types'

interface PdcaSummary {
  entityId: string
  entityName: string
  issues: {
    id: string
    title: string
    latestStatus: PdcaStatus
    latestDate: string
    latestTarget: string
  }[]
  tasks?: Task[]
}

interface OverviewPdcaSummaryProps {
  entities: Entity[]
  summaries: PdcaSummary[]
  onSelectEntity: (entityId: string) => void
}

const STATUS_CONFIG: Record<PdcaStatus, { label: string; color: string; icon: typeof Circle }> = {
  open: { label: '未着手', color: 'text-gray-500 bg-gray-100', icon: Circle },
  doing: { label: '進行中', color: 'text-blue-600 bg-blue-100', icon: PlayCircle },
  done: { label: '完了', color: 'text-green-600 bg-green-100', icon: CheckCircle },
  paused: { label: '保留', color: 'text-yellow-600 bg-yellow-100', icon: PauseCircle },
}

export function OverviewPdcaSummary({ entities, summaries, onSelectEntity }: OverviewPdcaSummaryProps) {
  // 全タスクを集計（重複除去）
  const allTasks = summaries.length > 0 ? (summaries[0].tasks || []) : []

  // タスクのステータス集計
  const statusCounts = allTasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    },
    {} as Record<PdcaStatus, number>
  )

  const totalTasks = allTasks.length

  return (
    <div className="space-y-6">
      {/* 全体サマリー */}
      <div className="bg-white rounded-2xl shadow p-4">
        <h3 className="font-semibold mb-4">PDCAステータス概況</h3>
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => {
            const count = statusCounts[status as PdcaStatus] || 0
            const Icon = config.icon
            return (
              <div key={status} className="text-center">
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm ${config.color}`}>
                  <Icon size={14} />
                  {config.label}
                </div>
                <div className="text-2xl font-bold mt-2">{count}</div>
                <div className="text-xs text-gray-500">
                  {totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0}%
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 全タスク一覧 */}
      <div className="bg-white rounded-2xl shadow">
        <div className="p-4 border-b flex items-center gap-2">
          <ListTodo size={18} className="text-green-600" />
          <h3 className="font-semibold">タスク一覧</h3>
          <span className="text-sm text-gray-500">({allTasks.length}件)</span>
        </div>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {allTasks.length > 0 ? (
            allTasks.map((task) => {
              const config = STATUS_CONFIG[task.status]
              const Icon = config.icon
              const formatDate = (dateStr: string) => {
                const date = new Date(dateStr)
                return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
              }
              return (
                <div
                  key={task.id}
                  className="p-3 flex items-start justify-between gap-4 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ListTodo size={14} className="text-green-600 flex-shrink-0" />
                      <div className="font-medium">{task.title}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 ml-5">
                      {task.entity_name && (
                        <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {task.entity_name}
                        </span>
                      )}
                      <span>{formatDate(task.date)}</span>
                    </div>
                  </div>
                  <span
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${config.color}`}
                  >
                    <Icon size={12} />
                    {config.label}
                  </span>
                </div>
              )
            })
          ) : (
            <div className="p-8 text-center text-gray-500">
              <AlertCircle size={24} className="mx-auto mb-2 text-gray-300" />
              タスクがありません
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
