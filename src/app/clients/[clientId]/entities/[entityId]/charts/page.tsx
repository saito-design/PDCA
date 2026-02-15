'use client'

import { useState, useEffect, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut } from 'lucide-react'
import type { ChartConfig, GlobalFilters, SessionData, Client, Entity } from '@/lib/types'
import { ChartBuilder } from '@/components/chart-builder'
import { ChartList } from '@/components/chart-list'
import { ChartRenderer } from '@/components/chart-renderer'

interface MonthlyData {
  yearMonth: string
  netSales: number
  customers: number
  customerPrice: number
  groups: number
  personsPerGroup: number
  prevYearSales: number | null
  prevYearCustomers: number | null
  prevYearCustomerPrice: number | null
  [key: string]: string | number | null
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
  const [charts, setCharts] = useState<ChartConfig[]>([])
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({ store: '全店', lastN: 6 })
  const [loading, setLoading] = useState(true)

  // 実データ
  const [stores, setStores] = useState<string[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])

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
          setCharts(chartsData.data.map((c: Record<string, unknown>) => ({
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
          })))
        }

        // 店舗一覧を取得
        try {
          const storesRes = await fetch(`/api/clients/${clientId}/data?type=stores`)
          const storesData = await storesRes.json()
          if (storesData.success) {
            setStores(storesData.data)
          }
        } catch {
          console.warn('店舗一覧取得エラー')
        }

        // 月別データを取得
        try {
          const monthlyRes = await fetch(`/api/clients/${clientId}/data?type=monthly`)
          const monthlyDataRes = await monthlyRes.json()
          if (monthlyDataRes.success) {
            setMonthlyData(monthlyDataRes.data)
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

  // 店舗フィルター変更時にデータ再取得
  useEffect(() => {
    const fetchMonthlyData = async () => {
      try {
        const storeParam = globalFilters.store !== '全店' ? `&store=${encodeURIComponent(globalFilters.store)}` : ''
        const monthlyRes = await fetch(`/api/clients/${clientId}/data?type=monthly${storeParam}`)
        const monthlyDataRes = await monthlyRes.json()
        if (monthlyDataRes.success) {
          setMonthlyData(monthlyDataRes.data)
        }
      } catch {
        console.warn('月別データ取得エラー')
      }
    }

    if (!loading) {
      fetchMonthlyData()
    }
  }, [clientId, globalFilters.store, loading])

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

  const handleAddChart = async (chart: ChartConfig) => {
    setCharts((prev) => [chart, ...prev])

    // APIに保存
    await fetch(`/api/clients/${clientId}/charts`, {
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
      }),
    })
  }

  const handleRemoveChart = async (id: string) => {
    setCharts((prev) => prev.filter((c) => c.id !== id))
    await fetch(`/api/clients/${clientId}/charts/${id}`, { method: 'DELETE' })
  }

  const handleToggleShow = async (id: string) => {
    setCharts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, showOnDashboard: !c.showOnDashboard } : c))
    )
    const chart = charts.find((c) => c.id === id)
    if (chart) {
      await fetch(`/api/clients/${clientId}/charts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_on_dashboard: !chart.showOnDashboard }),
      })
    }
  }

  const handleReorder = async (fromId: string, toId: string) => {
    const sorted = [...charts].sort((a, b) => a.sortOrder - b.sortOrder)
    const fromIdx = sorted.findIndex((c) => c.id === fromId)
    const toIdx = sorted.findIndex((c) => c.id === toId)
    if (fromIdx < 0 || toIdx < 0) return

    const [moved] = sorted.splice(fromIdx, 1)
    sorted.splice(toIdx, 0, moved)

    const reordered = sorted.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10 }))
    setCharts(reordered)

    await fetch(`/api/clients/${clientId}/charts/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: reordered.map((c) => ({ id: c.id, sort_order: c.sortOrder })),
      }),
    })
  }

  const sortedCharts = useMemo(() => [...charts].sort((a, b) => a.sortOrder - b.sortOrder), [charts])
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
              stores={stores}
            />
            <ChartList
              charts={charts}
              onToggleShow={handleToggleShow}
              onRemove={handleRemoveChart}
              onReorder={handleReorder}
            />
          </div>

          {/* 右: プレビュー */}
          <div className="col-span-7 space-y-4">
            <div className="text-sm text-gray-500">プレビュー（上から3つ表示）</div>
            {sortedCharts.slice(0, 3).map((c) => (
              <ChartRenderer
                key={c.id}
                config={c}
                globalFilters={globalFilters}
                data={monthlyData}
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
    </div>
  )
}
