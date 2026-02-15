'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Entity } from '@/lib/types'

interface EntityKpi {
  entityId: string
  entityName: string
  kpis: {
    name: string
    actual: number
    target: number
    trend: 'up' | 'down' | 'flat'
  }[]
}

interface OverviewGridProps {
  entities: Entity[]
  entityKpis: EntityKpi[]
  onSelectEntity: (entityId: string) => void
}

export function OverviewGrid({ entities, entityKpis, onSelectEntity }: OverviewGridProps) {
  const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
    switch (trend) {
      case 'up':
        return <TrendingUp size={14} className="text-green-500" />
      case 'down':
        return <TrendingDown size={14} className="text-red-500" />
      default:
        return <Minus size={14} className="text-gray-400" />
    }
  }

  const getAchievementColor = (actual: number, target: number) => {
    const percent = (actual / target) * 100
    if (percent >= 100) return 'text-green-600 bg-green-50'
    if (percent >= 80) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entities.map((entity) => {
        const kpiData = entityKpis.find((k) => k.entityId === entity.id)

        return (
          <button
            key={entity.id}
            onClick={() => onSelectEntity(entity.id)}
            className="bg-white rounded-2xl shadow p-4 text-left hover:shadow-md transition-shadow"
          >
            <div className="font-semibold mb-3">{entity.name}</div>

            {kpiData ? (
              <div className="space-y-2">
                {kpiData.kpis.slice(0, 3).map((kpi, i) => {
                  const percent = Math.round((kpi.actual / kpi.target) * 100)
                  return (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getTrendIcon(kpi.trend)}
                        <span className="text-sm text-gray-600 truncate">{kpi.name}</span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${getAchievementColor(
                          kpi.actual,
                          kpi.target
                        )}`}
                      >
                        {percent}%
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-500">KPIデータなし</div>
            )}

            <div className="mt-3 text-xs text-blue-600 hover:underline">
              詳細を見る →
            </div>
          </button>
        )
      })}
    </div>
  )
}
