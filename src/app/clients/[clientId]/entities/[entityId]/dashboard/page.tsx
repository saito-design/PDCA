'use client'

import { useState, useEffect, useMemo, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, PenTool, Settings2, X, PanelLeftClose, PanelLeftOpen, Save, Database } from 'lucide-react'
import ColumnSelector from '@/components/column-selector'
import type { SelectedColumn } from '@/lib/column-storage'
import { getSelectedColumns } from '@/lib/column-storage'
import type { ChartConfig, GlobalFilters, SessionData, Client, Entity, PdcaCycle, Task, PdcaStatus, DynamicMetric } from '@/lib/types'
import { KpiGrid } from '@/components/kpi-card'
import { ChartRenderer, COLOR_PALETTE } from '@/components/chart-renderer'
import { PdcaEditor } from '@/components/pdca-editor'
import { MeetingHistory } from '@/components/meeting-history'
import { ReportExportButton } from '@/components/report-export-button'
// SalesChart は削除 - グラフ作成で自作可能
import { TaskManager } from '@/components/task-manager'

interface KpiData {
  key: string
  name: string
  actual: number      // 実績累計
  plan: number        // 計画累計
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
  const [pendingTaskChanges, setPendingTaskChanges] = useState<Map<string, PdcaStatus>>(new Map())
  const [savingTasks, setSavingTasks] = useState(false)
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({ lastN: 6 })
  const [loading, setLoading] = useState(true)

  // 実データ
  const [kpis, setKpis] = useState<KpiData[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // KPI表示設定
  const [hiddenKpis, setHiddenKpis] = useState<string[]>([])
  const [showKpiSettings, setShowKpiSettings] = useState(false)

  // データパネル開閉
  const [showDataPanel, setShowDataPanel] = useState(false)

  // カラム選択
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([])

  // ローカルストレージからKPI設定を読み込み
  useEffect(() => {
    const saved = localStorage.getItem(`kpi-hidden-${clientId}`)
    if (saved) {
      setHiddenKpis(JSON.parse(saved))
    }
  }, [clientId])

  // ローカルストレージからカラム選択を読み込み
  useEffect(() => {
    const saved = getSelectedColumns(clientId, entityId)
    setSelectedColumns(saved)
  }, [clientId, entityId])

  // 選択されたカラムから動的メトリクスを生成
  const currentMetrics = useMemo((): DynamicMetric[] => {
    return selectedColumns
      .filter(col => col.type === 'number')
      .map((col, idx) => ({
        key: col.name,
        label: col.label || col.name,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        unit: col.unit || '',
        type: col.type,
      }))
  }, [selectedColumns])

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

        // サイクル履歴を取得（entity_idでフィルタ）
        setCyclesLoading(true)
        try {
          const cyclesRes = await fetch(
            `/api/clients/${clientId}/entities/${entityId}/cycles`
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

        // タスク一覧を取得（部署別）
        setTasksLoading(true)
        try {
          const tasksRes = await fetch(`/api/clients/${clientId}/entities/${entityId}/tasks`)
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

  // 部門データ取得（entity.nameを部門パラメータとして使用）
  useEffect(() => {
    const fetchDepartmentData = async () => {
      if (!entity?.name) return

      setDataLoading(true)
      try {
        // 新しい chart-data API からデータ取得（master_data.json対応）
        const chartDataRes = await fetch(`/api/clients/${clientId}/entities/${entityId}/chart-data`)
        const chartData = await chartDataRes.json()

        if (chartData.success && chartData.data.length > 0) {
          // グラフ用データを設定
          setMonthlyData(chartData.data)

          // KPIデータは最新月のデータから生成
          // グラフで選択されたカラムの「累計」版を使用
          const latestMonth = chartData.data[chartData.data.length - 1]
          const savedColumns = getSelectedColumns(clientId, entityId)
          const columns = chartData.columns || []

          let generatedKpis: KpiData[] = []

          if (savedColumns.length > 0) {
            // 選択されたカラムから累計KPIを生成
            generatedKpis = savedColumns
              .filter(col => col.type === 'number')
              .map((col) => {
                // ベースカラム名を取得（「（実績）」などを除去）
                const baseName = col.name.replace(/（[^）]+）$/, '')

                // 実績累計と計画累計のキーを生成
                const actualKey = `${baseName}（実績累計）`
                const planKey = `${baseName}（計画累計）`

                // 最新月から値を取得
                const actualValue = latestMonth[actualKey] ?? latestMonth[col.name] ?? 0
                const planValue = latestMonth[planKey] ?? 0

                return {
                  key: col.name,
                  name: col.label || baseName,
                  actual: Number(actualValue) || 0,
                  plan: Number(planValue) || 0,
                  unit: col.unit || '',
                }
              })
              .filter(kpi => kpi.actual !== 0 || kpi.plan !== 0)
          } else {
            // フォールバック: 累計カラムから自動生成（最大6項目）
            const cumulativeColumns = columns.filter((col: string) =>
              col.includes('（実績累計）')
            )
            generatedKpis = cumulativeColumns.slice(0, 6).map((col: string) => {
              const baseName = col.replace('（実績累計）', '')
              const planKey = `${baseName}（計画累計）`
              return {
                key: col,
                name: baseName,
                actual: Number(latestMonth[col]) || 0,
                plan: Number(latestMonth[planKey]) || 0,
                unit: '',
              }
            }).filter((kpi: KpiData) => kpi.actual !== 0 || kpi.plan !== 0)
          }

          setKpis(generatedKpis)

          // 月別サマリーも同じデータから生成
          const summary = chartData.data.map((row: Record<string, unknown>) => ({
            yearMonth: row.yearMonth as string,
            sales: (row['売上'] ?? row['宿泊料'] ?? row['室料合計'] ?? 0) as number,
            customers: (row['宿泊人数'] ?? row['利用客数'] ?? 0) as number,
            customerPrice: 0,
            prevYearSales: null,
            prevYearCustomers: null,
          }))
          setMonthlySummary(summary)
        } else {
          // フォールバック: 旧API
          const deptParam = `&department=${encodeURIComponent(entity.name)}`

          const kpiRes = await fetch(`/api/clients/${clientId}/data?type=kpi${deptParam}`)
          const kpiData = await kpiRes.json()
          if (kpiData.success) {
            setKpis(kpiData.data)
          }

          const summaryRes = await fetch(`/api/clients/${clientId}/data?type=summary${deptParam}`)
          const summaryData = await summaryRes.json()
          if (summaryData.success) {
            setMonthlySummary(summaryData.data)
          }

          const monthlyRes = await fetch(`/api/clients/${clientId}/data?type=monthly${deptParam}`)
          const monthlyDataRes = await monthlyRes.json()
          if (monthlyDataRes.success) {
            setMonthlyData(monthlyDataRes.data)
          }
        }
      } catch (error) {
        console.error('Department data fetch error:', error)
      } finally {
        setDataLoading(false)
      }
    }

    if (!loading && entity) {
      fetchDepartmentData()
    }
  }, [clientId, entity, loading])

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
        `/api/clients/${clientId}/entities/${entityId}/pdca/tasks/task-1/cycles`,
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
          `/api/clients/${clientId}/entities/${entityId}/cycles`
        )
        const cyclesData = await cyclesRes.json()
        if (cyclesData.success) {
          setCycles(cyclesData.data)
        }
        // タスク一覧も再取得（API側で【】からタスクが自動追加されるため）
        const tasksRes = await fetch(`/api/clients/${clientId}/entities/${entityId}/tasks`)
        const tasksData = await tasksRes.json()
        if (tasksData.success) {
          setTasks(tasksData.data)
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
        `/api/clients/${clientId}/entities/${entityId}/pdca/tasks/task-1/cycles`,
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
        // タスク一覧も再取得（API側で【】からタスクが自動追加されるため）
        const tasksRes = await fetch(`/api/clients/${clientId}/entities/${entityId}/tasks`)
        const tasksData = await tasksRes.json()
        if (tasksData.success) {
          setTasks(tasksData.data)
        }
      } else {
        alert('更新に失敗しました: ' + result.error)
      }
    } catch (error) {
      console.error('Update cycle error:', error)
      alert('更新に失敗しました')
    }
  }

  // handleStoreChange は廃止（部門ベースに移行）

  // タスクステータス変更（ローカルのみ、保存ボタンで反映）
  const handleTaskStatusChange = useCallback((taskId: string, newStatus: PdcaStatus) => {
    setPendingTaskChanges(prev => {
      const next = new Map(prev)
      next.set(taskId, newStatus)
      return next
    })
    // UIに即座に反映（ただしまだ保存されていない）
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
  }, [])

  // タスク変更を保存
  const handleSaveTaskChanges = async () => {
    if (pendingTaskChanges.size === 0) return

    setSavingTasks(true)
    try {
      const promises = Array.from(pendingTaskChanges.entries()).map(([taskId, newStatus]) =>
        fetch(`/api/clients/${clientId}/entities/${entityId}/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }).then(res => res.json())
      )

      const results = await Promise.all(promises)
      const allSuccess = results.every(r => r.success)

      if (allSuccess) {
        setPendingTaskChanges(new Map())
        // タスク一覧を再取得
        const tasksRes = await fetch(`/api/clients/${clientId}/entities/${entityId}/tasks`)
        const tasksData = await tasksRes.json()
        if (tasksData.success) {
          setTasks(tasksData.data)
        }
      } else {
        alert('一部のタスク更新に失敗しました')
      }
    } catch (error) {
      console.error('Save task changes error:', error)
      alert('タスク保存に失敗しました')
    } finally {
      setSavingTasks(false)
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
      target: k.plan,    // 計画累計
      actual: k.actual,  // 実績累計
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
                      onClick={() => setShowColumnSelector(true)}
                      className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
                      title="データ項目を設定"
                    >
                      <Database size={14} />
                      データ項目
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

              {/* Charts - グラフ作成で自由に追加可能 */}
              {sortedCharts.map((chart) => (
                <ChartRenderer
                  key={chart.id}
                  config={chart}
                  globalFilters={globalFilters}
                  data={monthlyData}
                  metrics={currentMetrics.length > 0 ? currentMetrics : undefined}
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

            {/* 進行中タスク（最上部に表示）またはペンディング変更がある場合 */}
            {(tasks.filter(t => t.status === 'doing').length > 0 || pendingTaskChanges.size > 0) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-blue-700 font-semibold">
                    <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-xs rounded-full">
                      {tasks.filter(t => t.status === 'doing').length}
                    </span>
                    進行中のタスク
                  </div>
                  {pendingTaskChanges.size > 0 && (
                    <button
                      onClick={handleSaveTaskChanges}
                      disabled={savingTasks}
                      className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save size={14} />
                      {savingTasks ? '保存中...' : `保存 (${pendingTaskChanges.size}件の変更)`}
                    </button>
                  )}
                </div>
                {tasks.filter(t => t.status === 'doing').length > 0 ? (
                  <div className="space-y-1">
                    {tasks
                      .filter(t => t.status === 'doing')
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
                ) : (
                  <div className="text-sm text-blue-600">
                    進行中のタスクはありません
                  </div>
                )}
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

            {/* タスク管理（下部に全ステータス表示） */}
            <TaskManager
              tasks={tasks}
              onStatusChange={handleTaskStatusChange}
              loading={tasksLoading}
            />
          </div>
        </div>
      </main>

      {/* カラム選択モーダル */}
      {showColumnSelector && (
        <ColumnSelector
          clientId={clientId}
          entityId={entityId}
          onClose={() => setShowColumnSelector(false)}
          onSave={(columns) => setSelectedColumns(columns)}
        />
      )}
    </div>
  )
}
