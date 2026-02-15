'use client'

import { CheckCircle, PlayCircle, PauseCircle, Circle, AlertCircle } from 'lucide-react'
import type { Entity, PdcaStatus } from '@/lib/types'

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
  // 全体のステータス集計
  const statusCounts = summaries.reduce(
    (acc, summary) => {
      summary.issues.forEach((issue) => {
        acc[issue.latestStatus] = (acc[issue.latestStatus] || 0) + 1
      })
      return acc
    },
    {} as Record<PdcaStatus, number>
  )

  const totalIssues = Object.values(statusCounts).reduce((a, b) => a + b, 0)

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
                  {totalIssues > 0 ? Math.round((count / totalIssues) * 100) : 0}%
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 部署/店舗別 */}
      <div className="bg-white rounded-2xl shadow">
        <div className="p-4 border-b">
          <h3 className="font-semibold">部署/店舗別イシュー</h3>
        </div>
        <div className="divide-y">
          {entities.map((entity) => {
            const summary = summaries.find((s) => s.entityId === entity.id)
            const issues = summary?.issues || []

            return (
              <div key={entity.id} className="p-4">
                <button
                  onClick={() => onSelectEntity(entity.id)}
                  className="font-medium text-blue-600 hover:underline mb-2 block"
                >
                  {entity.name}
                </button>

                {issues.length > 0 ? (
                  <div className="space-y-2">
                    {issues.slice(0, 3).map((issue) => {
                      const config = STATUS_CONFIG[issue.latestStatus]
                      const Icon = config.icon
                      return (
                        <div
                          key={issue.id}
                          className="flex items-start justify-between gap-4 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{issue.title}</div>
                            {issue.latestTarget && (
                              <div className="text-xs text-gray-500 truncate">
                                目標: {issue.latestTarget}
                              </div>
                            )}
                          </div>
                          <span
                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${config.color}`}
                          >
                            <Icon size={12} />
                            {config.label}
                          </span>
                        </div>
                      )
                    })}
                    {issues.length > 3 && (
                      <div className="text-xs text-gray-500">
                        他 {issues.length - 3} 件
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <AlertCircle size={14} />
                    イシューなし
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
