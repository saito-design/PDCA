'use client'

interface KpiCardProps {
  name: string
  target: number  // 計画累計
  actual: number  // 実績累計
  unit?: string
}

// 金額フォーマット（売上高は千円単位、客単価は円単位）
function formatValue(value: number, unit?: string, name?: string, compact?: boolean): string {
  if (unit === '円') {
    // 売上高など大きい金額は千円単位
    if (name?.includes('売上') || name?.includes('室料') || name?.includes('宿泊料') || Math.abs(value) >= 100000) {
      const inThousands = Math.round(value / 1000)
      return compact ? `${inThousands.toLocaleString()}千` : `${inThousands.toLocaleString()}千円`
    }
    // 客単価などは円単位
    return `${value.toLocaleString()}${compact ? '' : '円'}`
  }
  if (unit === '%') {
    return `${value.toLocaleString()}%`
  }
  return `${value.toLocaleString()}${compact ? '' : (unit || '')}`
}

export function KpiCard({ name, target, actual, unit = '' }: KpiCardProps) {
  const percent = target > 0 ? Math.round((actual / target) * 100) : 0
  const isGood = percent >= 100
  const diff = actual - target

  return (
    <div className="bg-white rounded-xl shadow px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-gray-500 font-medium truncate">{name}</div>
        <div className={`text-xs font-medium ${isGood ? 'text-green-600' : 'text-orange-500'}`}>
          {percent}%
        </div>
      </div>
      {/* 実績（大きく） */}
      <div className="text-lg font-bold mt-0.5">
        {formatValue(actual, unit, name)}
      </div>
      {/* 計画と差分 */}
      <div className="flex items-center justify-between text-xs mt-1">
        <div className="text-gray-500">
          計画: {formatValue(target, unit, name, true)}
        </div>
        <div className={`font-medium ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {diff >= 0 ? '+' : ''}{formatValue(diff, unit, name, true)}
        </div>
      </div>
      {/* 進捗バー */}
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1.5">
        <div
          className={`h-full rounded-full transition-all ${
            isGood ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

// 横並び用コンパクトKPI一覧
interface KpiGridProps {
  kpis: Array<{ name: string; target: number; actual: number; unit?: string }>
}

export function KpiGrid({ kpis }: KpiGridProps) {
  // 項目数に応じて列数を調整
  const cols = kpis.length <= 3 ? 'grid-cols-3' : kpis.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className={`grid ${cols} gap-2`}>
      {kpis.map((kpi, i) => {
        const { name, target, actual, unit } = kpi
        return <KpiCard key={i} name={name} target={target} actual={actual} unit={unit} />
      })}
    </div>
  )
}
