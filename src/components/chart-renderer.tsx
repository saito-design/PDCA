'use client'

import { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ChartConfig, GlobalFilters, SeriesConfig, LineStyle, DynamicMetric } from '@/lib/types'
import { formatCurrency } from '@/lib/formatters'

// デフォルトの指標定義（後方互換性のため残す）
export const DEFAULT_METRICS: DynamicMetric[] = [
  { key: 'netSales', label: '売上高', color: '#3b82f6', unit: '円', type: 'number' },
  { key: 'customers', label: '客数', color: '#10b981', unit: '人', type: 'number' },
  { key: 'customerPrice', label: '客単価', color: '#ec4899', unit: '円', type: 'number' },
  { key: 'groups', label: '組数', color: '#f59e0b', unit: '組', type: 'number' },
  { key: 'personsPerGroup', label: '一組当たり人数', color: '#8b5cf6', unit: '人', type: 'number' },
  { key: 'prevYearSales', label: '前年売上', color: '#9ca3af', unit: '円', type: 'number' },
  { key: 'prevYearCustomers', label: '前年客数', color: '#6b7280', unit: '人', type: 'number' },
]

// 後方互換性のためエクスポート
export const METRICS = DEFAULT_METRICS

// 集計タイプ
export const AGGS = [
  { key: 'raw', label: 'そのまま' },
  { key: 'yoy_diff', label: '前年差' },
  { key: 'yoy_pct', label: '前年比%' },
  { key: 'cumulative', label: '累計' },
]

// 線のスタイル
const LINE_STYLES: Record<LineStyle, string> = {
  solid: '0',
  dashed: '8 4',
  dotted: '2 2',
}

// 色のパレット
export const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f97316', // orange
]

interface DataRow {
  yearMonth: string
  [key: string]: unknown
}

// 会計年度を取得（11月始まり・10月決算）
function getFiscalYear(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  // 11月以降は翌年度
  return month >= 11 ? String(year + 1) : String(year)
}

// 累計系列かどうかを判定
function isCumulativeSeries(key: string): boolean {
  return key.includes('累計')
}

function computeAggRow(row: DataRow, aggKey: string, seriesKeys: string[]): DataRow {
  if (aggKey === 'raw') return row

  const out = { ...row }
  const prevYearSales = row.prevYearSales as number | null
  const prevYearCustomers = row.prevYearCustomers as number | null

  for (const k of seriesKeys) {
    const v = row[k]
    if (typeof v !== 'number') continue

    // 前年比較の基準値を決定
    let baseValue: number | null = null
    if (k === 'netSales') baseValue = prevYearSales
    else if (k === 'customers') baseValue = prevYearCustomers
    else if (k === 'customerPrice' && prevYearSales && prevYearCustomers) {
      baseValue = Math.round(prevYearSales / prevYearCustomers)
    }

    if (aggKey === 'yoy_diff' && baseValue !== null) {
      out[k] = v - baseValue
    }
    if (aggKey === 'yoy_pct' && baseValue !== null && baseValue !== 0) {
      out[k] = Math.round((v / baseValue) * 1000) / 10
    }
  }
  return out
}

interface ChartRendererProps {
  config: ChartConfig
  globalFilters: GlobalFilters
  data?: DataRow[]
  metrics?: DynamicMetric[]  // 動的メトリクス（指定しない場合はデフォルト）
}

export function ChartRenderer({ config, globalFilters, data, metrics }: ChartRendererProps) {
  const {
    title,
    xKey = 'yearMonth',
    seriesKeys,
    seriesConfig = [],
    aggKey = 'raw',
    store,
  } = config

  // 使用するメトリクス定義（propsで渡されたものを優先）
  const activeMetrics = metrics || DEFAULT_METRICS

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []

    // 直近N件
    const sliced = data.slice(-globalFilters.lastN)

    // 累計計算（aggKey === 'cumulative'の場合のみ）
    if (aggKey === 'cumulative') {
      let cumulativeValues: Record<string, number> = {}
      return sliced.map((row) => {
        const newRow = { ...row }
        for (const key of seriesKeys) {
          const v = row[key]
          if (typeof v === 'number') {
            cumulativeValues[key] = (cumulativeValues[key] || 0) + v
            newRow[key] = cumulativeValues[key]
          }
        }
        return newRow
      })
    }

    // 累計系列の年度フィルタリング
    // 最新データの年度を基準に、累計系列は今期データのみ表示
    const latestYearMonth = sliced[sliced.length - 1]?.yearMonth
    const currentFiscalYear = latestYearMonth ? getFiscalYear(latestYearMonth) : null

    // 累計系列があるかチェック
    const hasCumulativeSeries = seriesKeys.some(isCumulativeSeries)

    if (hasCumulativeSeries && currentFiscalYear) {
      return sliced.map((row) => {
        const rowFiscalYear = getFiscalYear(row.yearMonth)
        const newRow = { ...row }

        // 今期以外の累計データはnullにする
        if (rowFiscalYear !== currentFiscalYear) {
          for (const key of seriesKeys) {
            if (isCumulativeSeries(key)) {
              newRow[key] = null
            }
          }
        }

        return computeAggRow(newRow, aggKey, seriesKeys)
      })
    }

    // 集計適用
    return sliced.map((row) => computeAggRow(row, aggKey, seriesKeys))
  }, [data, globalFilters, aggKey, seriesKeys])

  // 系列設定のマップ
  const seriesConfigMap = useMemo(() => {
    const map = new Map<string, SeriesConfig>()
    for (const sc of seriesConfig) {
      map.set(sc.key, sc)
    }
    return map
  }, [seriesConfig])

  // Y軸が必要か（非表示系列を除く）
  const hasRightAxis = seriesConfig.some((sc) => sc.yAxisId === 'right' && !sc.hidden)

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="text-sm font-semibold mb-2">{title}</div>
        <div className="h-48 flex items-center justify-center text-gray-400">
          データがありません
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-sm font-semibold mb-2">
        {title}
        {store && <span className="text-gray-400 ml-2">({store})</span>}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 25 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => {
              if (typeof v === 'string' && v.length >= 7) {
                return v.slice(5) // 年月から月だけ
              }
              return v
            }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => {
              if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
              if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
              return v
            }}
          />
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
                if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
                return v
              }}
            />
          )}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload) return null

              // 全系列のデータを取得（非表示除く）
              const dataPoint = payload[0]?.payload || {}
              const visibleKeys = seriesKeys.filter(key => !seriesConfigMap.get(key)?.hidden)

              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                  <div className="font-semibold text-gray-800 mb-2">{label}</div>
                  {visibleKeys.map((key, idx) => {
                    const metric = activeMetrics.find((m) => m.key === key)
                    const sc = seriesConfigMap.get(key)
                    const color = sc?.color || metric?.color || COLOR_PALETTE[idx % COLOR_PALETTE.length]
                    const value = dataPoint[key]
                    const displayName = metric?.label || key

                    let displayValue: string
                    if (value === null || value === undefined) {
                      // 前年系列でデータなしの場合
                      if (key.includes('前年')) {
                        displayValue = 'データなし（前年売上0）'
                      } else {
                        displayValue = 'データなし'
                      }
                    } else if (typeof value === 'number') {
                      displayValue = formatCurrency(value, metric?.unit, metric?.label)
                    } else {
                      displayValue = String(value)
                    }

                    return (
                      <div key={key} className="flex items-center gap-2 py-0.5">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-gray-600">{displayName}:</span>
                        <span className={value === null || value === undefined ? 'text-gray-400 italic' : 'font-medium'}>
                          {displayValue}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '10px', paddingTop: 5 }}
            content={() => {
              // seriesKeysの順序で凡例を表示（非表示系列は除外）
              const items = seriesKeys
                .filter(key => !seriesConfigMap.get(key)?.hidden)
                .map((key, idx) => {
                  const metric = activeMetrics.find((m) => m.key === key)
                  const sc = seriesConfigMap.get(key)
                  const color = sc?.color || metric?.color || COLOR_PALETTE[idx % COLOR_PALETTE.length]
                  const isLine = sc?.chartType === 'line'
                  return (
                    <span key={key} className="inline-flex items-center gap-1 mr-3">
                      {isLine ? (
                        <svg width="14" height="10">
                          <line x1="0" y1="5" x2="14" y2="5" stroke={color} strokeWidth="2" />
                          <circle cx="7" cy="5" r="3" fill={color} />
                        </svg>
                      ) : (
                        <span style={{ width: 10, height: 10, backgroundColor: color, display: 'inline-block' }} />
                      )}
                      <span style={{ color: '#666' }}>{metric?.label || key}</span>
                    </span>
                  )
                })
              return <div className="flex flex-wrap justify-center">{items}</div>
            }}
          />

          {seriesKeys.map((key, idx) => {
            const metric = activeMetrics.find((m) => m.key === key)
            const sc = seriesConfigMap.get(key)

            // 非表示の系列はスキップ
            if (sc?.hidden) return null

            const chartType = sc?.chartType || 'bar'
            const color = sc?.color || metric?.color || COLOR_PALETTE[idx % COLOR_PALETTE.length]
            const opacity = sc?.opacity ?? 1
            const yAxisId = sc?.yAxisId || 'left'
            const lineStyle = sc?.lineStyle || 'solid'
            const strokeWidth = sc?.strokeWidth || 2

            if (chartType === 'line') {
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={metric?.label || key}
                  stroke={color}
                  strokeOpacity={opacity}
                  strokeWidth={strokeWidth}
                  strokeDasharray={LINE_STYLES[lineStyle]}
                  yAxisId={yAxisId}
                  dot={false}
                />
              )
            }

            return (
              <Bar
                key={key}
                dataKey={key}
                name={metric?.label || key}
                fill={color}
                fillOpacity={opacity}
                yAxisId={yAxisId}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
