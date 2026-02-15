'use client'

import { useState } from 'react'
import { Plus, Settings2 } from 'lucide-react'
import type { ChartConfig, GlobalFilters, ChartType, AggKey, SeriesConfig, LineStyle } from '@/lib/types'
import { METRICS, AGGS, COLOR_PALETTE } from './chart-renderer'

interface SeriesSettingProps {
  metricKey: string
  config: SeriesConfig
  onChange: (config: SeriesConfig) => void
}

function SeriesSetting({ metricKey, config, onChange }: SeriesSettingProps) {
  const metric = METRICS.find((m) => m.key === metricKey)
  const currentColor = config.color || metric?.color || COLOR_PALETTE[0]

  return (
    <div className="flex flex-wrap items-center gap-2 bg-gray-50 border rounded-lg p-2">
      <span className="text-sm font-medium min-w-20" style={{ color: currentColor }}>
        {metric?.label || metricKey}
      </span>

      {/* チャートタイプ */}
      <select
        className="border rounded px-1.5 py-0.5 text-xs bg-white"
        value={config.chartType}
        onChange={(e) => onChange({ ...config, chartType: e.target.value as ChartType })}
      >
        <option value="bar">棒</option>
        <option value="line">線</option>
      </select>

      {/* 線スタイル（線グラフのみ） */}
      {config.chartType === 'line' && (
        <select
          className="border rounded px-1.5 py-0.5 text-xs bg-white"
          value={config.lineStyle || 'solid'}
          onChange={(e) => onChange({ ...config, lineStyle: e.target.value as LineStyle })}
        >
          <option value="solid">実線</option>
          <option value="dashed">破線</option>
          <option value="dotted">点線</option>
        </select>
      )}

      {/* 線の太さ（線グラフのみ） */}
      {config.chartType === 'line' && (
        <select
          className="border rounded px-1.5 py-0.5 text-xs bg-white"
          value={config.strokeWidth || 2}
          onChange={(e) => onChange({ ...config, strokeWidth: Number(e.target.value) })}
        >
          <option value={1}>細い</option>
          <option value={2}>普通</option>
          <option value={3}>太め</option>
          <option value={4}>太い</option>
        </select>
      )}

      {/* 色 */}
      <input
        type="color"
        className="w-6 h-6 border rounded cursor-pointer"
        value={currentColor}
        onChange={(e) => onChange({ ...config, color: e.target.value })}
        title="色を選択"
      />

      {/* 透明度 */}
      <select
        className="border rounded px-1.5 py-0.5 text-xs bg-white"
        value={config.opacity ?? 1}
        onChange={(e) => onChange({ ...config, opacity: Number(e.target.value) })}
      >
        <option value={1}>100%</option>
        <option value={0.7}>70%</option>
        <option value={0.5}>50%</option>
        <option value={0.3}>30%</option>
      </select>

      {/* 第2軸 */}
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={config.yAxisId === 'right'}
          onChange={(e) => onChange({ ...config, yAxisId: e.target.checked ? 'right' : 'left' })}
          className="rounded"
        />
        第2軸
      </label>
    </div>
  )
}

interface ChartBuilderProps {
  onAdd: (chart: ChartConfig) => void
  globalFilters: GlobalFilters
  onChangeGlobalFilters: (updater: (prev: GlobalFilters) => GlobalFilters) => void
  nextSortOrder: number
  stores?: string[]  // 実データの店舗リスト
}

export function ChartBuilder({
  onAdd,
  globalFilters,
  onChangeGlobalFilters,
  nextSortOrder,
  stores = [],
}: ChartBuilderProps) {
  const [defaultType, setDefaultType] = useState<ChartType>('bar')
  const [xKey] = useState('yearMonth')
  const [title, setTitle] = useState('売上推移')
  const [seriesKeys, setSeriesKeys] = useState<string[]>(['netSales', 'prevYearSales'])
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfig[]>([
    { key: 'netSales', chartType: 'bar', color: '#3b82f6' },
    { key: 'prevYearSales', chartType: 'line', lineStyle: 'dashed', opacity: 0.5, color: '#9ca3af' },
  ])
  const [aggKey, setAggKey] = useState<AggKey>('raw')
  const [store, setStore] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const storeOptions = ['全店', ...stores]

  const toggleSeries = (k: string) => {
    if (seriesKeys.includes(k)) {
      setSeriesKeys((prev) => prev.filter((x) => x !== k))
      setSeriesConfig((prev) => prev.filter((x) => x.key !== k))
    } else {
      const metric = METRICS.find((m) => m.key === k)
      setSeriesKeys((prev) => [...prev, k])
      setSeriesConfig((prev) => [...prev, {
        key: k,
        chartType: defaultType,
        color: metric?.color || COLOR_PALETTE[prev.length % COLOR_PALETTE.length]
      }])
    }
  }

  const updateSeriesConfig = (key: string, config: SeriesConfig) => {
    setSeriesConfig((prev) =>
      prev.map((sc) => (sc.key === key ? config : sc))
    )
  }

  const handleAdd = () => {
    if (!title.trim()) return
    if (seriesKeys.length === 0) return

    onAdd({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      type: defaultType,
      title,
      xKey,
      seriesKeys,
      seriesConfig,
      aggKey,
      store: store || null,
      showOnDashboard: false,
      sortOrder: nextSortOrder,
    })

    // リセット
    setTitle('売上推移')
    setSeriesKeys(['netSales', 'prevYearSales'])
    setSeriesConfig([
      { key: 'netSales', chartType: 'bar', color: '#3b82f6' },
      { key: 'prevYearSales', chartType: 'line', lineStyle: 'dashed', opacity: 0.5, color: '#9ca3af' },
    ])
    setAggKey('raw')
    setStore('')
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-4">
      <div>
        <div className="font-semibold">グラフ作成</div>
        <div className="text-xs text-gray-500">データ項目ごとに棒/折れ線・色・線種を設定可能</div>
      </div>

      {/* グローバルフィルタ */}
      <div className="rounded-xl border bg-gray-50 p-3">
        <div className="text-xs font-semibold text-gray-600 mb-2">全体フィルタ</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">店舗</div>
            <select
              className="w-full border rounded-lg px-2 py-1.5 bg-white text-sm"
              value={globalFilters.store}
              onChange={(e) =>
                onChangeGlobalFilters((p) => ({ ...p, store: e.target.value }))
              }
            >
              {storeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">期間（直近N件）</div>
            <select
              className="w-full border rounded-lg px-2 py-1.5 bg-white text-sm"
              value={globalFilters.lastN}
              onChange={(e) =>
                onChangeGlobalFilters((p) => ({ ...p, lastN: Number(e.target.value) }))
              }
            >
              {[3, 6, 12].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* グラフ設定 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-gray-500 mb-1">デフォルト形状</div>
          <select
            className="w-full border rounded-lg px-2 py-1.5 bg-white text-sm"
            value={defaultType}
            onChange={(e) => setDefaultType(e.target.value as ChartType)}
          >
            <option value="bar">棒</option>
            <option value="line">折れ線</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">集計</div>
          <select
            className="w-full border rounded-lg px-2 py-1.5 bg-white text-sm"
            value={aggKey}
            onChange={(e) => setAggKey(e.target.value as AggKey)}
          >
            {AGGS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">店舗（このグラフだけ）</div>
        <select
          className="w-full border rounded-lg px-2 py-1.5 bg-white text-sm"
          value={store}
          onChange={(e) => setStore(e.target.value)}
        >
          <option value="">全体フィルタに従う</option>
          {storeOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">タイトル</div>
        <input
          className="w-full border rounded-lg px-3 py-1.5 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="グラフのタイトル"
        />
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">データ項目（表示する数値）</div>
        <div className="grid grid-cols-2 gap-2">
          {METRICS.map((m) => (
            <label
              key={m.key}
              className="flex items-center gap-2 text-sm bg-gray-50 border rounded-lg px-2 py-1.5 cursor-pointer hover:bg-gray-100"
            >
              <input
                type="checkbox"
                checked={seriesKeys.includes(m.key)}
                onChange={() => toggleSeries(m.key)}
                className="rounded"
              />
              <span style={{ color: m.color }}>{m.label}</span>
              <span className="text-xs text-gray-400">({m.unit})</span>
            </label>
          ))}
        </div>
      </div>

      {/* 詳細設定（各系列ごと） */}
      {seriesKeys.length > 0 && (
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Settings2 size={14} />
            {showAdvanced ? '詳細設定を閉じる' : '詳細設定を開く（色・線種・太さ）'}
          </button>

          {showAdvanced && (
            <div className="mt-2 space-y-2">
              {seriesKeys.map((key) => {
                const cfg = seriesConfig.find((sc) => sc.key === key) || { key, chartType: defaultType }
                return (
                  <SeriesSetting
                    key={key}
                    metricKey={key}
                    config={cfg}
                    onChange={(c) => updateSeriesConfig(key, c)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={!title.trim() || seriesKeys.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus size={16} />
        グラフを作成
      </button>
    </div>
  )
}
