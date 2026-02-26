'use client'

import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'

export interface KpiData {
  name: string
  unit?: string
  // 実績
  actualCumulative?: number    // 実績累計
  actualAverage?: number       // 実績平均
  // 計画
  planCumulative?: number      // 計画累計
  planAverage?: number         // 計画平均
  // 前年
  prevYearCumulative?: number  // 前年累計
  prevYearAverage?: number     // 前年平均
}

interface KpiCardProps extends KpiData {
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  isDragOver?: boolean
}

// 差分表示コンポーネント
function DiffDisplay({ label, actual, compare, unit, name }: {
  label: string
  actual?: number
  compare?: number
  unit?: string
  name: string
}) {
  if (actual === undefined || compare === undefined || compare === 0) {
    return (
      <div className="text-xs text-gray-400">
        <span className="text-gray-500">{label}:</span> -
      </div>
    )
  }

  const diff = actual - compare
  const diffRate = Math.round((actual / compare - 1) * 100)
  const isPositive = diff >= 0

  return (
    <div className="text-xs">
      <span className="text-gray-500">{label}:</span>{' '}
      <span className={isPositive ? 'text-green-600' : 'text-red-500'}>
        {isPositive ? '+' : ''}{formatCurrency(diff, unit, name, true)}
        <span className="text-[10px] ml-0.5">({isPositive ? '+' : ''}{diffRate}%)</span>
      </span>
    </div>
  )
}

export function KpiCard({
  name,
  unit = '',
  actualCumulative,
  actualAverage,
  planCumulative,
  planAverage,
  prevYearCumulative,
  prevYearAverage,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver = false,
}: KpiCardProps) {
  // 計画達成率
  const planRate = planCumulative && planCumulative > 0 && actualCumulative
    ? Math.round((actualCumulative / planCumulative) * 100)
    : null

  return (
    <div
      className={`bg-white rounded-xl shadow px-3 py-2 ${isDragOver ? 'ring-2 ring-blue-400' : ''} ${draggable ? 'cursor-move' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* ヘッダー: 項目名 + 計画達成率 */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1 min-w-0">
          {draggable && <GripVertical size={12} className="text-gray-400 flex-shrink-0" />}
          <div className="text-xs text-gray-600 font-medium truncate">{name}</div>
        </div>
        {planRate !== null && (
          <div className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            planRate >= 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'
          }`}>
            {planRate}%
          </div>
        )}
      </div>

      {/* 実績（累計・平均） */}
      <div className="flex items-baseline gap-2 mb-1.5">
        <div className="text-lg font-bold">
          {actualCumulative !== undefined ? formatCurrency(actualCumulative, unit, name) : '-'}
        </div>
        {actualAverage !== undefined && (
          <div className="text-xs text-gray-500">
            (月平均 {formatCurrency(actualAverage, unit, name, true)})
          </div>
        )}
      </div>

      {/* 差分表示 */}
      <div className="space-y-0.5 border-t pt-1.5">
        {/* 計画との差 */}
        {(planCumulative !== undefined || planAverage !== undefined) && (
          <div className="flex gap-3">
            <DiffDisplay label="vs計画累計" actual={actualCumulative} compare={planCumulative} unit={unit} name={name} />
            <DiffDisplay label="vs計画平均" actual={actualAverage} compare={planAverage} unit={unit} name={name} />
          </div>
        )}

        {/* 前年との差 */}
        {(prevYearCumulative !== undefined || prevYearAverage !== undefined) && (
          <div className="flex gap-3">
            <DiffDisplay label="vs前年累計" actual={actualCumulative} compare={prevYearCumulative} unit={unit} name={name} />
            <DiffDisplay label="vs前年平均" actual={actualAverage} compare={prevYearAverage} unit={unit} name={name} />
          </div>
        )}
      </div>

      {/* 進捗バー（計画がある場合のみ） */}
      {planRate !== null && (
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden mt-2">
          <div
            className={`h-full rounded-full transition-all ${
              planRate >= 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(planRate, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

// 横並び用コンパクトKPI一覧
interface KpiGridProps {
  kpis: KpiData[]
  editable?: boolean
  onReorder?: (kpis: KpiData[]) => void
}

export function KpiGrid({ kpis, editable = false, onReorder }: KpiGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  if (kpis.length === 0) return null

  // 項目数に応じて列数を調整
  const cols = kpis.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }

    const newKpis = [...kpis]
    const [dragged] = newKpis.splice(dragIndex, 1)
    newKpis.splice(dropIndex, 0, dragged)

    onReorder?.(newKpis)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className={`grid ${cols} gap-2`} onDragEnd={handleDragEnd}>
      {kpis.map((kpi, i) => (
        <KpiCard
          key={kpi.name}
          {...kpi}
          draggable={editable}
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={() => handleDrop(i)}
          isDragOver={dragOverIndex === i}
        />
      ))}
    </div>
  )
}

// 旧API互換用（target/actualのみ）
interface LegacyKpiData {
  name: string
  target: number
  actual: number
  unit?: string
}

export function LegacyKpiGrid({ kpis }: { kpis: LegacyKpiData[] }) {
  const convertedKpis: KpiData[] = kpis.map(k => ({
    name: k.name,
    unit: k.unit,
    actualCumulative: k.actual,
    planCumulative: k.target,
  }))
  return <KpiGrid kpis={convertedKpis} />
}
