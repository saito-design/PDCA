'use client'

import { useState, useEffect, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, PenTool, RefreshCw, Settings2, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ChartConfig, GlobalFilters, SessionData, Client, Entity, PdcaCycle, Task, PdcaStatus } from '@/lib/types'
import { KpiGrid } from '@/components/kpi-card'
import { ChartRenderer } from '@/components/chart-renderer'
import { PdcaEditor } from '@/components/pdca-editor'
import { MeetingHistory } from '@/components/meeting-history'
import { ReportExportButton } from '@/components/report-export-button'
import { SalesChart } from '@/components/sales-chart'
import { TaskManager } from '@/components/task-manager'

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
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

  // データパネル開閉
  const [showDataPanel, setShowDataPanel] = useState(false)

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

        // タスク一覧を取得
        setTasksLoading(true)
        try {
          const tasksRes = await fetch(`/api/clients/${clientId}/tasks`)
          const tasksData = await tasksRes.json()
          if (tasksData.success) {
            setTasks(tasksData.data)
          }
        } catch {
          // エラーを無視
        } finally {
          setTasksLoading(false)
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

  // サイクル更新（過去の履歴を編集）
  const handleUpdateCycle = async (cycle: PdcaCycle) => {
    try {
      const res = await fetch(
        `/api/clients/${clientId}/entities/${entityId}/pdca/issues/issue-1/cycles`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cycle.id,
            situation: cycle.situation,
            issue: cycle.issue,
            action: cycle.action,
            target: cycle.target,
            status: cycle.status,
          }),
        }
      )
      const result = await res.json()
      if (result.success) {
        setCycles(prev => prev.map(c => c.id === cycle.id ? result.data : c))
      } else {
        alert('更新に失敗しました: ' + result.error)
      }
    } catch (error) {
      console.error('Update cycle error:', error)
      alert('更新に失敗しました')
    }
  }

  const handleStoreChange = (store: string) => {
    setGlobalFilters((prev) => ({ ...prev, store }))
  }

  // タスクステータス変更
  const handleTaskStatusChange = async (taskId: string, newStatus: PdcaStatus) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const result = await res.json()
      if (result.success) {
        setTasks(prev => prev.map(t => t.id === taskId ? result.data : t))
      } else {
        alert('ステータス更新に失敗: ' + result.error)
      }
    } catch (error) {
      console.error('Task status change error:', error)
      alert('ステータス更新に失敗しました')
    }
  }

  // タスク追加
  const handleAddTask = async (title: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          entity_name: entity?.name || '',
          status: 'open',
        }),
      })
      const result = await res.json()
      if (result.success) {
        setTasks(prev => [result.data, ...prev])
      } else {
        alert('タスク追加に失敗: ' + result.error)
      }
    } catch (error) {
      console.error('Add task error:', error)
      alert('タスク追加に失敗しました')
    }
  }

  // タスク削除
  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/tasks/${taskId}`, {
        method: 'DELETE',
      })
      const result = await res.json()
      if (result.success) {
        setTasks(prev => prev.filter(t => t.id !== taskId))
      } else {
        alert('タスク削除に失敗: ' + result.error)
      }
    } catch (error) {
      console.error('Delete task error:', error)
      alert('タスク削除に失敗しました')
    }
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
        <div className="flex gap-6">
          {/* Left: KPI + Charts (横折りたたみ) */}
          {showDataPanel && (
            <div className="w-[400px] flex-shrink-0 space-y-4">
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">データ表示</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowKpiSettings(true)}
                      className="text-gray-400 hover:text-gray-600"
                      title="表示項目を設定"
                    >
                      <Settings2 size={16} />
                    </button>
                    <button
                      onClick={handleOpenChartStudio}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <PenTool size={14} />
                      グラフ作成
                    </button>
                    <button
                      onClick={() => setShowDataPanel(false)}
                      className="text-gray-400 hover:text-gray-600 ml-2"
                      title="パネルを閉じる"
                    >
                      <PanelLeftClose size={18} />
                    </button>
                  </div>
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

                {/* KPI Grid */}
                {dataLoading ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-500">
                    読み込み中...
                  </div>
                ) : displayKpis.length > 0 ? (
                  <KpiGrid kpis={displayKpis} />
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-500">
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
          )}

          {/* Right: PDCA Editor + History (データパネル閉じたら全幅) */}
          <div className="flex-1 space-y-4">
            {/* データパネル開くボタン */}
            {!showDataPanel && (
              <button
                onClick={() => setShowDataPanel(true)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2"
              >
                <PanelLeftOpen size={18} />
                データ表示を開く
              </button>
            )}

            {/* 進行中タスク（最上部に表示） */}
            {tasks.filter(t => t.entity_name === entity?.name && t.status === 'doing').length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-blue-700 font-semibold mb-2">
                  <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-xs rounded-full">
                    {tasks.filter(t => t.entity_name === entity?.name && t.status === 'doing').length}
                  </span>
                  進行中のタスク
                </div>
                <div className="space-y-1">
                  {tasks
                    .filter(t => t.entity_name === entity?.name && t.status === 'doing')
                    .map(task => (
                      <div key={task.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                        <span>{task.title}</span>
                        <button
                          onClick={() => handleTaskStatusChange(task.id, 'done')}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                        >
                          完了
                        </button>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* ミーティングメモ（SAT形式） */}
            <PdcaEditor
              onSave={handleSavePdca}
              storageKey={`pdca-draft-${clientId}-${entityId}`}
            />

            {/* 過去のミーティング履歴 */}
            <MeetingHistory
              cycles={cycles}
              loading={cyclesLoading}
              onUpdateCycle={handleUpdateCycle}
            />

            {/* タスク管理 */}
            <TaskManager
              tasks={tasks}
              entityName={entity?.name || ''}
              clientId={clientId}
              onStatusChange={handleTaskStatusChange}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              loading={tasksLoading}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
