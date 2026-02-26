'use client'

import { useState, useEffect, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut } from 'lucide-react'
import type { ChartConfig, GlobalFilters, SessionData, Client, Entity, DynamicMetric } from '@/lib/types'
import { ChartBuilder } from '@/components/chart-builder'
import { ChartList } from '@/components/chart-list'
import { ChartRenderer } from '@/components/chart-renderer'
import { ChartEditor } from '@/components/chart-editor'
import { getSelectedColumns } from '@/lib/column-storage'
import { COLOR_PALETTE } from '@/components/chart-renderer'

interface MonthlyData {
  yearMonth: string
  [key: string]: string | number | null
}

// グラフと紐づくメトリクス情報を保持
interface ChartWithMetrics {
  chart: ChartConfig
  metrics: DynamicMetric[]
}

type PageProps = {
  params: Promise<{ clientId: string; entityId: string }>
}

export default function ChartStudioPage({ params }: PageProps) {
  const { clientId, entityId } = use(params)
  const router = useRouter()

  const [user, setUser] = useState<SessionData | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [chartsWithMetrics, setChartsWithMetrics] = useState<ChartWithMetrics[]>([])
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({ lastN: 6 })
  const [loading, setLoading] = useState(true)
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null)

  // 実データ
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])

  // 現在のカラム設定からメトリクスを生成
  const currentMetrics = useMemo(() => {
    const columns = getSelectedColumns(clientId, entityId)
    return columns
      .filter(col => col.type === 'number')
      .map((col, idx) => ({
        key: col.name,
        label: col.label || col.name,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        unit: col.unit || '',
        type: col.type,
      })) as DynamicMetric[]
  }, [clientId, entityId])

  // charts配列（後方互換性のため）
  const charts = useMemo(() => chartsWithMetrics.map(cm => cm.chart), [chartsWithMetrics])

  useEffect(() => {
    const fetchData = async () => {
      try {
        // セッション確認
        const meRes = await fetch('/api/auth/me')
        const meData = await meRes.json()
        if (!meData.success || !meData.data?.isLoggedIn) {
          router.push('/')
          return
        }
        setUser(meData.data)

        // 企業情報
        const clientsRes = await fetch('/api/clients')
        const clientsData = await clientsRes.json()
        if (clientsData.success) {
          setClient(clientsData.data.find((c: Client) => c.id === clientId) || null)
        }

        // 部署/店舗情報
        const entitiesRes = await fetch(`/api/clients/${clientId}/entities`)
        const entitiesData = await entitiesRes.json()
        if (entitiesData.success) {
          setEntity(entitiesData.data.find((e: Entity) => e.id === entityId) || null)
        }

        // グラフ一覧
        const chartsRes = await fetch(`/api/clients/${clientId}/charts`)
        const chartsData = await chartsRes.json()
        if (chartsData.success) {
          const loadedCharts = chartsData.data.map((c: Record<string, unknown>) => ({
            chart: {
              id: c.id as string,
              type: c.type as ChartConfig['type'],
              title: c.title as string,
              xKey: (c.x_key as string) || 'yearMonth',
              seriesKeys: c.series_keys as string[],
              seriesConfig: c.series_config as ChartConfig['seriesConfig'],
              aggKey: c.agg_key as ChartConfig['aggKey'],
              store: c.store_override as string | null,
              showOnDashboard: c.show_on_dashboard as boolean,
              sortOrder: c.sort_order as number,
            },
            // 保存されたメトリクス or 現在の設定から復元
            metrics: (c.metrics as DynamicMetric[]) || [],
          }))
          setChartsWithMetrics(loadedCharts)
        }

        // 月別データを取得（部署用APIを優先）
        try {
          // まず部署用chart-data APIを試す
          const entityDataRes = await fetch(`/api/clients/${clientId}/entities/${entityId}/chart-data`)
          const entityData = await entityDataRes.json()

          if (entityData.success && entityData.data.length > 0) {
            setMonthlyData(entityData.data)
          } else {
            // フォールバック: 従来のデータAPI
            const monthlyRes = await fetch(`/api/clients/${clientId}/data?type=monthly`)
            const monthlyDataRes = await monthlyRes.json()
            if (monthlyDataRes.success) {
              setMonthlyData(monthlyDataRes.data)
            }
          }
        } catch {
          console.warn('月別データ取得エラー')
        }
      } catch (error) {
        console.error('Fetch error:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, clientId, entityId])

  // 部門データ再取得（entity変更時）
  // 初期データ取得と同じロジック使用のためここでは何もしない
  // （初期useEffectで既に取得している）

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const handleBack = () => {
    router.push(`/clients/${clientId}/entities/${entityId}/dashboard`)
  }

  const nextSortOrder = useMemo(() => {
    const max = Math.max(...charts.map((c) => c.sortOrder || 0), 0)
    return max + 10
  }, [charts])

  const handleAddChart = async (chart: ChartConfig, metrics: DynamicMetric[]) => {
    // APIに保存
    try {
      const res = await fetch(`/api/clients/${clientId}/charts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: chart.title,
          type: chart.type,
          x_key: chart.xKey,
          series_keys: chart.seriesKeys,
          series_config: chart.seriesConfig,
          agg_key: chart.aggKey,
          store_override: chart.store,
          show_on_dashboard: chart.showOnDashboard,
          sort_order: chart.sortOrder,
          metrics: metrics,
        }),
      })
      const result = await res.json()
      if (result.success) {
        // 成功時のみローカルに追加（APIから返されたIDを使用）
        const savedChart = { ...chart, id: result.data.id }
        setChartsWithMetrics((prev) => [{ chart: savedChart, metrics }, ...prev])
      } else {
        console.error('Chart creation failed:', result.error)
        alert(`グラフの作成に失敗しました: ${result.error || '不明なエラー'}`)
      }
    } catch (error) {
      console.error('Chart creation error:', error)
      alert('グラフの作成中にエラーが発生しました')
    }
  }

  const handleRemoveChart = async (id: string) => {
    setChartsWithMetrics((prev) => prev.filter((cm) => cm.chart.id !== id))
    await fetch(`/api/clients/${clientId}/charts/${id}`, { method: 'DELETE' })
  }

  const handleToggleShow = async (id: string) => {
    setChartsWithMetrics((prev) =>
      prev.map((cm) =>
        cm.chart.id === id
          ? { ...cm, chart: { ...cm.chart, showOnDashboard: !cm.chart.showOnDashboard } }
          : cm
      )
    )
    const chartWithMetrics = chartsWithMetrics.find((cm) => cm.chart.id === id)
    if (chartWithMetrics) {
      await fetch(`/api/clients/${clientId}/charts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_on_dashboard: !chartWithMetrics.chart.showOnDashboard }),
      })
    }
  }

  const handleReorder = async (fromId: string, toId: string) => {
    const sorted = [...chartsWithMetrics].sort((a, b) => a.chart.sortOrder - b.chart.sortOrder)
    const fromIdx = sorted.findIndex((cm) => cm.chart.id === fromId)
    const toIdx = sorted.findIndex((cm) => cm.chart.id === toId)
    if (fromIdx < 0 || toIdx < 0) return

    const [moved] = sorted.splice(fromIdx, 1)
    sorted.splice(toIdx, 0, moved)

    const reordered = sorted.map((cm, i) => ({
      ...cm,
      chart: { ...cm.chart, sortOrder: (i + 1) * 10 }
    }))
    setChartsWithMetrics(reordered)

    await fetch(`/api/clients/${clientId}/charts/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: reordered.map((cm) => ({ id: cm.chart.id, sort_order: cm.chart.sortOrder })),
      }),
    })
  }

  // グラフ詳細設定を保存
  const handleSaveChart = async (updatedChart: ChartConfig) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/charts/${updatedChart.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updatedChart.title,
          series_config: updatedChart.seriesConfig,
        }),
      })
      const result = await res.json()
      if (result.success) {
        // ローカルのchartsWithMetricsを更新
        setChartsWithMetrics(prev =>
          prev.map(cm =>
            cm.chart.id === updatedChart.id
              ? { ...cm, chart: updatedChart }
              : cm
          )
        )
        setEditingChart(null)
      } else {
        console.error('Save failed:', result.error)
        alert(`保存に失敗しました: ${result.error || '不明なエラー'}`)
      }
    } catch (error) {
      console.error('Failed to save chart:', error)
      alert('保存中にエラーが発生しました')
    }
  }

  const sortedChartsWithMetrics = useMemo(
    () => [...chartsWithMetrics].sort((a, b) => a.chart.sortOrder - b.chart.sortOrder),
    [chartsWithMetrics]
  )
  const shownCount = charts.filter((c) => c.showOnDashboard).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ChevronLeft size={16} />
              ダッシュボードに戻る（表示中 {shownCount}）
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold">グラフ作成（{client?.name}）</h1>
          <p className="text-sm text-gray-500">
            {entity?.name} - 作成 → 「表示する」でダッシュボードに反映
          </p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* 左: ビルダー + リスト */}
          <div className="col-span-5 space-y-4">
            <ChartBuilder
              onAdd={handleAddChart}
              globalFilters={globalFilters}
              onChangeGlobalFilters={setGlobalFilters}
              nextSortOrder={nextSortOrder}
              clientId={clientId}
              entityId={entityId}
            />
            <ChartList
              charts={charts}
              onToggleShow={handleToggleShow}
              onRemove={handleRemoveChart}
              onReorder={handleReorder}
              onEdit={setEditingChart}
            />
          </div>

          {/* 右: プレビュー */}
          <div className="col-span-7 space-y-4">
            <div className="text-sm text-gray-500">プレビュー（上から3つ表示）</div>
            {sortedChartsWithMetrics.slice(0, 3).map((cm) => (
              <ChartRenderer
                key={cm.chart.id}
                config={cm.chart}
                globalFilters={globalFilters}
                data={monthlyData}
                metrics={cm.metrics.length > 0 ? cm.metrics : currentMetrics}
              />
            ))}
            {charts.length === 0 && (
              <div className="bg-white rounded-2xl shadow p-6 text-gray-500">
                左でグラフを作成するとここにプレビューされます
              </div>
            )}
          </div>
        </div>
      </main>

      {/* グラフ編集モーダル */}
      {editingChart && (
        <ChartEditor
          chart={editingChart}
          onSave={handleSaveChart}
          onClose={() => setEditingChart(null)}
        />
      )}
    </div>
  )
}
