'use client'

import { useState, useEffect, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, PenTool, Store, RefreshCw, Settings2, X } from 'lucide-react'
import type { ChartConfig, GlobalFilters, SessionData, Client, Entity, PdcaCycle } from '@/lib/types'
import { KpiGrid } from '@/components/kpi-card'
import { ChartRenderer } from '@/components/chart-renderer'
import { PdcaEditor } from '@/components/pdca-editor'
import { MeetingHistory } from '@/components/meeting-history'
import { ReportExportButton } from '@/components/report-export-button'
import { SalesChart } from '@/components/sales-chart'

interface KpiData {
  key: string
  name: string
  target: number
  actual: number
  prevYear: number | null
  unit?: string
}

interface MonthlySummary {
  yearMonth: string
  sales: number
  customers: number
  customerPrice: number
  prevYearSales: number | null
  prevYearCustomers: number | null
}

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

export default function DashboardPage({ params }: PageProps) {
  const { clientId, entityId } = use(params)
  const router = useRouter()

  const [user, setUser] = useState<SessionData | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [charts, setCharts] = useState<ChartConfig[]>([])
  const [cycles, setCycles] = useState<PdcaCycle[]>([])
  const [cyclesLoading, setCyclesLoading] = useState(false)
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({ store: '全店', lastN: 6 })
  const [loading, setLoading] = useState(true)

  // 実データ
  const [stores, setStores] = useState<string[]>([])
  const [kpis, setKpis] = useState<KpiData[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // KPI表示設定
  const [hiddenKpis, setHiddenKpis] = useState<string[]>([])
  const [showKpiSettings, setShowKpiSettings] = useState(false)

  // ローカルストレージからKPI設定を読み込み
  useEffect(() => {
    const saved = localStorage.getItem(`kpi-hidden-${clientId}`)
    if (saved) {
      setHiddenKpis(JSON.parse(saved))
    }
  }, [clientId])

  // KPI設定をローカルストレージに保存
  const toggleKpiVisibility = (key: string) => {
    setHiddenKpis((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      localStorage.setItem(`kpi-hidden-${clientId}`, JSON.stringify(next))
      return next
    })
  }

  // 初期データ取得
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

        // グラフ一覧（ダッシュボード表示のみ）
        const chartsRes = await fetch(`/api/clients/${clientId}/charts`)
        const chartsData = await chartsRes.json()
        if (chartsData.success) {
          const allCharts = chartsData.data.map((c: Record<string, unknown>) => ({
            id: c.id as string,
            type: c.type as ChartConfig['type'],
            title: c.title as string,
            xKey: (c.x_key as string) || 'month',
            seriesKeys: c.series_keys as string[],
            seriesConfig: c.series_config as ChartConfig['seriesConfig'],
            aggKey: c.agg_key as ChartConfig['aggKey'],
            store: c.store_override as string | null,
            showOnDashboard: c.show_on_dashboard as boolean,
            sortOrder: c.sort_order as number,
          }))
          setCharts(allCharts.filter((c: ChartConfig) => c.showOnDashboard))
        }

        // 店舗一覧取得
        try {
          const storesRes = await fetch(`/api/clients/${clientId}/data?type=stores`)
          const storesData = await storesRes.json()
          if (storesData.success) {
            setStores(storesData.data)
          }
        } catch {
          console.warn('店舗一覧取得エラー')
        }

        // キャッシュ更新日時を取得
        try {
          const cacheRes = await fetch(`/api/clients/${clientId}/data/refresh`)
          const cacheData = await cacheRes.json()
          if (cacheData.success && cacheData.updatedAt) {
            setCacheUpdatedAt(cacheData.updatedAt)
          }
        } catch {
          // 無視
        }

        // サイクル履歴を取得
        setCyclesLoading(true)
        try {
          const cyclesRes = await fetch(
            `/api/clients/${clientId}/entities/${entityId}/pdca/issues/issue-1/cycles`
          )
          const cyclesData = await cyclesRes.json()
          if (cyclesData.success) {
            setCycles(cyclesData.data)
          }
        } catch {
          // デモモードではエラーを無視
        } finally {
          setCyclesLoading(false)
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
    const fetchPosData = async () => {
      setDataLoading(true)
      try {
        const storeParam = globalFilters.store !== '全店' ? `&store=${encodeURIComponent(globalFilters.store)}` : ''

        // KPIデータ取得
        const kpiRes = await fetch(`/api/clients/${clientId}/data?type=kpi${storeParam}`)
        const kpiData = await kpiRes.json()
        if (kpiData.success) {
          setKpis(kpiData.data)
        }

        // 月別サマリー取得
        const summaryRes = await fetch(`/api/clients/${clientId}/data?type=summary${storeParam}`)
        const summaryData = await summaryRes.json()
        if (summaryData.success) {
          setMonthlySummary(summaryData.data)
        }

        // 月別データ取得（グラフ用）
        const monthlyRes = await fetch(`/api/clients/${clientId}/data?type=monthly${storeParam}`)
        const monthlyDataRes = await monthlyRes.json()
        if (monthlyDataRes.success) {
          setMonthlyData(monthlyDataRes.data)
        }
      } catch (error) {
        console.error('POS data fetch error:', error)
      } finally {
        setDataLoading(false)
      }
    }

    if (!loading) {
      fetchPosData()
    }
  }, [clientId, globalFilters.store, loading])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const handleBack = () => {
    router.push(`/clients/${clientId}`)
  }

  const handleOpenChartStudio = () => {
    router.push(`/clients/${clientId}/entities/${entityId}/charts`)
  }

  const handleSavePdca = async (data: { situation: string; issue: string; action: string; target: string }) => {
    try {
      const res = await fetch(
        `/api/clients/${clientId}/entities/${entityId}/pdca/issues/issue-1/cycles`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cycle_date: new Date().toISOString().split('T')[0],
            situation: data.situation,
            issue: data.issue,
            action: data.action,
            target: data.target,
            status: 'open',
          }),
        }
      )
      const result = await res.json()
      if (result.success) {
        // 保存成功 - サイクル一覧を再取得
        const cyclesRes = await fetch(
          `/api/clients/${clientId}/entities/${entityId}/pdca/issues/issue-1/cycles`
        )
        const cyclesData = await cyclesRes.json()
        if (cyclesData.success) {
          setCycles(cyclesData.data)
        }
        alert('保存しました')
      } else {
        alert('保存に失敗しました: ' + result.error)
      }
    } catch (error) {
      console.error('Save PDCA error:', error)
      alert('保存に失敗しました')
    }
  }

  const handleStoreChange = (store: string) => {
    setGlobalFilters((prev) => ({ ...prev, store }))
  }

  const handleRefreshData = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/data/refresh`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setCacheUpdatedAt(data.updatedAt)
        // データを再取得
        setDataLoading(true)
        const storeParam = globalFilters.store !== '全店' ? `&store=${encodeURIComponent(globalFilters.store)}` : ''
        const [kpiRes, summaryRes] = await Promise.all([
          fetch(`/api/clients/${clientId}/data?type=kpi${storeParam}`),
          fetch(`/api/clients/${clientId}/data?type=summary${storeParam}`),
        ])
        const kpiData = await kpiRes.json()
        const summaryData = await summaryRes.json()
        if (kpiData.success) setKpis(kpiData.data)
        if (summaryData.success) setMonthlySummary(summaryData.data)
        setDataLoading(false)
      } else {
        alert('データ更新に失敗しました: ' + data.error)
      }
    } catch (error) {
      console.error('Refresh error:', error)
      alert('データ更新に失敗しました')
    } finally {
      setRefreshing(false)
    }
  }

  const sortedCharts = useMemo(
    () => [...charts].sort((a, b) => a.sortOrder - b.sortOrder),
    [charts]
  )

  // KPIをグリッド用に変換（非表示設定を適用）
  const displayKpis = kpis
    .filter((k) => !hiddenKpis.includes(k.key))
    .map((k) => ({
      name: k.name,
      target: k.target,
      actual: k.actual,
      unit: k.unit,
    }))

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
              戻る
            </button>
            <div className="flex items-baseline gap-3">
              <h1 className="text-base text-gray-600">{client?.name}</h1>
              <span className="text-xl font-bold">{entity?.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* 店舗フィルター */}
            <div className="flex items-center gap-2">
              <Store size={16} className="text-gray-400" />
              <select
                value={globalFilters.store}
                onChange={(e) => handleStoreChange(e.target.value)}
                className="text-sm border rounded-lg px-2 py-1"
              >
                <option value="全店">全店</option>
                {stores.map((store) => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>
            </div>
            {/* データ更新ボタン */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshData}
                disabled={refreshing}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                title={cacheUpdatedAt ? `最終更新: ${new Date(cacheUpdatedAt).toLocaleString('ja-JP')}` : 'データ更新'}
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? '更新中...' : 'データ更新'}
              </button>
              {cacheUpdatedAt && (
                <span className="text-xs text-gray-400">
                  {new Date(cacheUpdatedAt).toLocaleDateString('ja-JP')}
                </span>
              )}
            </div>
            <ReportExportButton clientId={clientId} entityId={entityId} />
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
        <div className="grid grid-cols-12 gap-6">
          {/* Left: KPI + Charts */}
          <div className="col-span-5 space-y-4">
            {/* KPI Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">KPI</h2>
                  <button
                    onClick={() => setShowKpiSettings(true)}
                    className="text-gray-400 hover:text-gray-600"
                    title="表示項目を設定"
                  >
                    <Settings2 size={16} />
                  </button>
                </div>
                <button
                  onClick={handleOpenChartStudio}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <PenTool size={14} />
                  グラフ作成
                </button>
              </div>

              {/* KPI設定モーダル */}
              {showKpiSettings && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-lg p-4 w-80 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold">KPI表示設定</h3>
                      <button onClick={() => setShowKpiSettings(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">チェックを外すと非表示になります</p>
                    <div className="space-y-2">
                      {kpis.map((kpi) => (
                        <label key={kpi.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!hiddenKpis.includes(kpi.key)}
                            onChange={() => toggleKpiVisibility(kpi.key)}
                            className="rounded"
                          />
                          <span className="text-sm">{kpi.name}</span>
                          <span className="text-xs text-gray-400">({kpi.unit})</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowKpiSettings(false)}
                      className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}

              {/* KPI Grid（横並び） */}
              {dataLoading ? (
                <div className="bg-white rounded-xl shadow p-4 text-center text-gray-500">
                  読み込み中...
                </div>
              ) : displayKpis.length > 0 ? (
                <KpiGrid kpis={displayKpis} />
              ) : (
                <div className="bg-white rounded-xl shadow p-4 text-center text-gray-500">
                  KPIデータなし
                </div>
              )}
            </div>

            {/* 売上推移グラフ */}
            <SalesChart
              data={monthlySummary}
              loading={dataLoading}
              lastN={globalFilters.lastN}
            />

            {/* Charts */}
            {sortedCharts.map((chart) => (
              <ChartRenderer
                key={chart.id}
                config={chart}
                globalFilters={globalFilters}
                data={monthlyData}
              />
            ))}
          </div>

          {/* Right: PDCA Editor + History */}
          <div className="col-span-7 space-y-4">
            {/* ミーティングメモ（SAT形式） */}
            <PdcaEditor
              onSave={handleSavePdca}
              storageKey={`pdca-draft-${clientId}-${entityId}`}
            />

            {/* 過去のミーティング履歴 */}
            <MeetingHistory
              cycles={cycles}
              loading={cyclesLoading}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
