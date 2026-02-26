'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Settings2, AlertCircle } from 'lucide-react'
import type { ChartConfig, GlobalFilters, ChartType, AggKey, SeriesConfig, LineStyle, DynamicMetric } from '@/lib/types'
import { AGGS, COLOR_PALETTE } from './chart-renderer'
import { getSelectedColumns, type SelectedColumn } from '@/lib/column-storage'

// SelectedColumnからDynamicMetricへの変換
function columnToMetric(col: SelectedColumn, index: number): DynamicMetric {
  return {
    key: col.name,
    label: col.label || col.name,
    color: COLOR_PALETTE[index % COLOR_PALETTE.length],
    unit: col.unit || '',
    type: col.type,
  }
}

// カテゴリの表示順序
const CATEGORY_ORDER = ['統合_', 'PL_売上高', 'PL_売上原価', 'PL_売上総利益', 'PL_販管費', 'PL_営業利益', 'PL_営業外', 'PL_経常利益', 'PL_', 'POS_売上', 'POS_効率', 'POS_単品', 'POS_']

function getCategoryFromKey(key: string): string {
  // カラム名からカテゴリを抽出（例: "純売上高" -> カテゴリはデータから推測）
  // ここではlabelに含まれるパターンで判別
  return 'その他'
}

interface MetricSelectorProps {
  metrics: DynamicMetric[]
  selectedKeys: string[]
  onToggle: (key: string) => void
}

function MetricSelector({ metrics, selectedKeys, onToggle }: MetricSelectorProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['統合_売上', 'PL_売上高']))

  // メトリクスをカテゴリでグループ化
  const groupedMetrics = useMemo(() => {
    const groups = new Map<string, DynamicMetric[]>()

    for (const m of metrics) {
      // カラム名からカテゴリを推測
      let category = 'その他'

      // labelから区分を除いた部分でカテゴリを判別
      const label = m.label || m.key
      const baseLabel = label.replace(/（[^）]+）$/, '')

      // カテゴリ判定（優先順位順）
      if (baseLabel.includes('純売上高') && m.key.includes('統合')) {
        category = '統合_売上'
      } else if (['現金売上', 'クレジット売上', 'ポイント売上', '電子マネー売上', '飲食店売上', '純売上', 'フランチャイズ料'].some(k => baseLabel.includes(k))) {
        category = 'PL_売上高'
      } else if (['期首棚卸', '商品仕入', '原価', '棚卸'].some(k => baseLabel.includes(k))) {
        category = 'PL_売上原価'
      } else if (baseLabel.includes('売上総利益')) {
        category = 'PL_売上総利益'
      } else if (['人件費', '給与', 'アルバイト', '役員報酬', '法定福利', '厚生', '旅費', '車両', '水道光熱', '通信', '家賃', '減価償却', '広告', '手数料', '保険', '租税', '販管費', '設備費', '経営戦略'].some(k => baseLabel.includes(k))) {
        category = 'PL_販管費'
      } else if (baseLabel.includes('営業利益')) {
        category = 'PL_営業利益'
      } else if (['営業外', '支払利息', '受取利息', '雑収入', '雑損失'].some(k => baseLabel.includes(k))) {
        category = 'PL_営業外'
      } else if (['経常利益', '配賦'].some(k => baseLabel.includes(k))) {
        category = 'PL_経常利益'
      } else if (['客数', '客単価', '組数', '回転'].some(k => baseLabel.includes(k))) {
        category = 'POS_売上'
      } else if (['単品', '商品'].some(k => baseLabel.includes(k))) {
        category = 'POS_単品'
      }

      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(m)
    }

    // カテゴリをソート
    const sortedCategories = Array.from(groups.keys()).sort((a, b) => {
      const getOrder = (cat: string) => {
        for (let i = 0; i < CATEGORY_ORDER.length; i++) {
          if (cat.startsWith(CATEGORY_ORDER[i]) || cat === CATEGORY_ORDER[i].replace('_', '')) {
            return i
          }
        }
        return CATEGORY_ORDER.length
      }
      return getOrder(a) - getOrder(b)
    })

    return sortedCategories.map(cat => ({
      category: cat,
      metrics: groups.get(cat)!
    }))
  }, [metrics])

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  const formatCategoryName = (cat: string) => {
    return cat.replace('PL_', 'PL ').replace('POS_', 'POS ').replace('統合_', '統合 ')
  }

  return (
    <div className="max-h-80 overflow-y-auto border rounded-lg">
      {groupedMetrics.map(({ category, metrics: catMetrics }) => (
        <div key={category} className="border-b last:border-b-0">
          <button
            onClick={() => toggleCategory(category)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100"
          >
            <span>{formatCategoryName(category)} ({catMetrics.length})</span>
            <span className="text-gray-400">{expandedCategories.has(category) ? '▼' : '▶'}</span>
          </button>
          {expandedCategories.has(category) && (
            <div className="grid grid-cols-2 gap-1 p-1">
              {catMetrics.map((m) => (
                <label
                  key={m.key}
                  className="flex items-center gap-1.5 text-xs bg-white border rounded px-1.5 py-1 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(m.key)}
                    onChange={() => onToggle(m.key)}
                    className="rounded w-3 h-3"
                  />
                  <span className="truncate" style={{ color: m.color }}>{m.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface SeriesSettingProps {
  metricKey: string
  config: SeriesConfig
  onChange: (config: SeriesConfig) => void
  metrics: DynamicMetric[]
}

function SeriesSetting({ metricKey, config, onChange, metrics }: SeriesSettingProps) {
  const metric = metrics.find((m) => m.key === metricKey)
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
  onAdd: (chart: ChartConfig, metrics: DynamicMetric[]) => void
  globalFilters: GlobalFilters
  onChangeGlobalFilters: (updater: (prev: GlobalFilters) => GlobalFilters) => void
  nextSortOrder: number
  clientId: string   // 動的カラム取得用
  entityId?: string  // 部署ID（オプション）
}

export function ChartBuilder({
  onAdd,
  globalFilters,
  onChangeGlobalFilters,
  nextSortOrder,
  clientId,
  entityId,
}: ChartBuilderProps) {
  const [defaultType, setDefaultType] = useState<ChartType>('bar')
  const [xKey] = useState('yearMonth')
  const [title, setTitle] = useState('新規グラフ')
  const [seriesKeys, setSeriesKeys] = useState<string[]>([])
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfig[]>([])
  const [aggKey, setAggKey] = useState<AggKey>('raw')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // localStorageからカラム設定を読み込んでメトリクスに変換
  const [metrics, setMetrics] = useState<DynamicMetric[]>([])

  useEffect(() => {
    const columns = getSelectedColumns(clientId, entityId)
    // 数値型のカラムのみをメトリクスとして使用
    const numericColumns = columns.filter(col => col.type === 'number')
    const newMetrics = numericColumns.map((col, idx) => columnToMetric(col, idx))
    setMetrics(newMetrics)
  }, [clientId, entityId])

  const toggleSeries = (k: string) => {
    if (seriesKeys.includes(k)) {
      setSeriesKeys((prev) => prev.filter((x) => x !== k))
      setSeriesConfig((prev) => prev.filter((x) => x.key !== k))
    } else {
      const metric = metrics.find((m) => m.key === k)
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

    // 選択されたメトリクスのみを抽出
    const selectedMetrics = metrics.filter(m => seriesKeys.includes(m.key))

    onAdd({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      type: defaultType,
      title,
      xKey,
      seriesKeys,
      seriesConfig,
      aggKey,
      store: null,  // 部門ベースに移行のため廃止
      showOnDashboard: true,
      sortOrder: nextSortOrder,
    }, selectedMetrics)

    // リセット
    setTitle('新規グラフ')
    setSeriesKeys([])
    setSeriesConfig([])
    setAggKey('raw')
  }

  return (
    <div className="bg-white rounded-2xl shadow p-3 space-y-2">
      {/* ヘッダー + 設定を1行に */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-sm">グラフ作成</div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-1.5 py-1 bg-white text-xs"
            value={globalFilters.lastN}
            onChange={(e) =>
              onChangeGlobalFilters((p) => ({ ...p, lastN: Number(e.target.value) }))
            }
            title="期間（直近N件）"
          >
            {[3, 6, 12].map((n) => (
              <option key={n} value={n}>{n}ヶ月</option>
            ))}
          </select>
          <select
            className="border rounded px-1.5 py-1 bg-white text-xs"
            value={defaultType}
            onChange={(e) => setDefaultType(e.target.value as ChartType)}
            title="デフォルト形状"
          >
            <option value="bar">棒</option>
            <option value="line">線</option>
          </select>
          <select
            className="border rounded px-1.5 py-1 bg-white text-xs"
            value={aggKey}
            onChange={(e) => setAggKey(e.target.value as AggKey)}
            title="集計"
          >
            {AGGS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* タイトル */}
      <input
        className="w-full border rounded-lg px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タイトル"
      />

      <div>
        <div className="text-xs text-gray-500 mb-1">データ項目（表示する数値）</div>
        {metrics.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-700">
              <div className="font-medium">データ項目が設定されていません</div>
              <div className="text-xs mt-1">
                ダッシュボードの「データ項目」ボタンからカラムを選択してください
              </div>
            </div>
          </div>
        ) : (
          <MetricSelector
            metrics={metrics}
            selectedKeys={seriesKeys}
            onToggle={toggleSeries}
          />
        )}
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
                    metrics={metrics}
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
