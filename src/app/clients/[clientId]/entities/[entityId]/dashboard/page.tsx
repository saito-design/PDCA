'use client'

import { useState, useEffect, useMemo, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, LogOut, PenTool, Settings2, X, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Save, Database, RefreshCw, Edit2, Trash2 } from 'lucide-react'
import ColumnSelectorTable from '@/components/column-selector-table'
import type { SelectedColumn } from '@/lib/column-storage'
import { getSelectedColumns } from '@/lib/column-storage'
import type { ChartConfig, GlobalFilters, SessionData, Client, Entity, PdcaCycle, Task, PdcaStatus, DynamicMetric } from '@/lib/types'
import { KpiGrid } from '@/components/kpi-card'
import { ChartRenderer, COLOR_PALETTE } from '@/components/chart-renderer'
import { ChartEditor } from '@/components/chart-editor'
import { PdcaEditor } from '@/components/pdca-editor'
import { MeetingHistory } from '@/components/meeting-history'
import { ReportExportButton } from '@/components/report-export-button'
// SalesChart は削除 - グラフ作成で自作可能
import { TaskManager } from '@/components/task-manager'

interface KpiData {
  key: string
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
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null)
  const [cycles, setCycles] = useState<PdcaCycle[]>([])
  const [cyclesLoading, setCyclesLoading] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [pendingTaskChanges, setPendingTaskChanges] = useState<Map<string, PdcaStatus>>(new Map())
  const [savingTasks, setSavingTasks] = useState(false)
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>(() => {
    if (typeof window === 'undefined') return { lastN: 6 }
    const saved = localStorage.getItem(`dashboard-filters-${entityId}`)
    return saved ? JSON.parse(saved) : { lastN: 6 }
  })
  const [loading, setLoading] = useState(true)

  // 実データ
  const [kpis, setKpis] = useState<KpiData[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // KPI表示設定（localStorageから復元）
  const [hiddenKpis, setHiddenKpis] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    const saved = localStorage.getItem(`dashboard-hiddenKpis-${entityId}`)
    return saved ? JSON.parse(saved) : []
  })
  const [showKpiSettings, setShowKpiSettings] = useState(false)
  // KPI順序（localStorageから復元）
  const [kpiOrder, setKpiOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    const saved = localStorage.getItem(`dashboard-kpiOrder-${entityId}`)
    return saved ? JSON.parse(saved) : []
  })

  // データパネル開閉（localStorageから復元）
  const [showDataPanel, setShowDataPanel] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(`dashboard-dataPanel-${entityId}`) === 'true'
  })
  // ミーティングメモパネル開閉（localStorageから復元）
  const [showMemoPanel, setShowMemoPanel] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem(`dashboard-memoPanel-${entityId}`)
    return saved === null ? true : saved === 'true'
  })

  // カラム選択
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([])

  // selectedColumnsをlocalStorageから初期化
  useEffect(() => {
    const saved = getSelectedColumns(clientId, entityId)
    if (saved.length > 0) {
      setSelectedColumns(saved)
    }
  }, [clientId, entityId])

  // データ更新
  const [refreshingData, setRefreshingData] = useState(false)

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

  // パネル開閉状態をlocalStorageに保存
  useEffect(() => {
    localStorage.setItem(`dashboard-dataPanel-${entityId}`, String(showDataPanel))
  }, [showDataPanel, entityId])

  useEffect(() => {
    localStorage.setItem(`dashboard-memoPanel-${entityId}`, String(showMemoPanel))
  }, [showMemoPanel, entityId])

  // KPI順序をlocalStorageに保存
  useEffect(() => {
    if (kpiOrder.length > 0) {
      localStorage.setItem(`dashboard-kpiOrder-${entityId}`, JSON.stringify(kpiOrder))
    }
  }, [kpiOrder, entityId])

  // KPI非表示設定をlocalStorageに保存
  useEffect(() => {
    localStorage.setItem(`dashboard-hiddenKpis-${entityId}`, JSON.stringify(hiddenKpis))
  }, [hiddenKpis, entityId])

  // グローバルフィルターをlocalStorageに保存
  useEffect(() => {
    localStorage.setItem(`dashboard-filters-${entityId}`, JSON.stringify(globalFilters))
  }, [globalFilters, entityId])

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
          const columns = chartData.columns || []

          let generatedKpis: KpiData[] = []

          // 選択されたカラム（state）またはデフォルトから KPI を生成
          const targetColumns = selectedColumns.length > 0
            ? selectedColumns.filter(col => col.type === 'number')
            : columns
                .filter((col: string) => col.includes('（実績累計）'))
                .slice(0, 6)
                .map((col: string) => ({
                  name: col,
                  label: col.replace('（実績累計）', ''),
                  type: 'number' as const,
                  unit: ''
                }))

          // ベース項目名でグループ化してKPIを生成
          const baseNames = new Set<string>()
          for (const col of targetColumns) {
            const baseName = (col.label || col.name).replace(/（[^）]+）$/, '')
            baseNames.add(baseName)
          }

          generatedKpis = Array.from(baseNames).map((baseName) => {
            // 各区分のキーを生成
            const getValue = (suffix: string) => {
              const key = `${baseName}（${suffix}）`
              const val = latestMonth[key]
              return val !== undefined && val !== null ? Number(val) : undefined
            }

            return {
              key: baseName,
              name: baseName,
              unit: targetColumns.find((c: SelectedColumn) => (c.label || c.name).includes(baseName))?.unit || '',
              // 実績
              actualCumulative: getValue('実績累計'),
              actualAverage: getValue('実績平均'),
              // 計画
              planCumulative: getValue('計画累計'),
              planAverage: getValue('計画平均'),
              // 前年
              prevYearCumulative: getValue('前年累計'),
              prevYearAverage: getValue('前年平均'),
            }
          }).filter(kpi =>
            kpi.actualCumulative !== undefined ||
            kpi.planCumulative !== undefined ||
            kpi.prevYearCumulative !== undefined
          )

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, entityId, entity, loading])

  // selectedColumns変更時にKPIを再生成（データ再取得なし）
  useEffect(() => {
    if (monthlyData.length === 0) return

    const latestMonth = monthlyData[monthlyData.length - 1]
    const columns = Object.keys(latestMonth).filter(k => k !== 'yearMonth')

    // デバッグ: 選択されたカラムを表示
    console.log('[KPI生成] selectedColumns:', selectedColumns.length, selectedColumns.map(c => c.name))

    // 選択されたカラムまたはデフォルトから KPI を生成
    const targetColumns = selectedColumns.length > 0
      ? selectedColumns.filter(col => col.type === 'number')
      : columns
          .filter((col: string) => col.includes('（実績累計）'))
          .slice(0, 6)
          .map((col: string) => ({
            name: col,
            label: col.replace('（実績累計）', ''),
            type: 'number' as const,
            unit: ''
          }))

    console.log('[KPI生成] targetColumns:', targetColumns.length, targetColumns.map(c => c.name))

    // ベース項目名でグループ化してKPIを生成
    const baseNames = new Set<string>()
    for (const col of targetColumns) {
      const baseName = (col.label || col.name).replace(/（[^）]+）$/, '')
      baseNames.add(baseName)
    }

    console.log('[KPI生成] 抽出されたベース名:', Array.from(baseNames))
    console.log('[KPI生成] latestMonthのキー(売上関連):', Object.keys(latestMonth).filter(k => k.includes('売上')))

    const generatedKpis: KpiData[] = Array.from(baseNames).map((baseName) => {
      // データからベース名にマッチするキーを探す（完全一致 or 部分一致）
      const getValue = (suffix: string) => {
        // まず完全一致を試す
        const exactKey = `${baseName}（${suffix}）`
        if (latestMonth[exactKey] !== undefined) {
          return Number(latestMonth[exactKey])
        }

        // 部分一致を試す（baseName を含むキーを探す）
        const matchingKey = Object.keys(latestMonth).find(k =>
          k.includes(baseName) && k.includes(`（${suffix}）`)
        )
        if (matchingKey && latestMonth[matchingKey] !== undefined) {
          return Number(latestMonth[matchingKey])
        }

        return undefined
      }

      return {
        key: baseName,
        name: baseName,
        unit: targetColumns.find((c: SelectedColumn) => (c.label || c.name).includes(baseName))?.unit || '',
        actualCumulative: getValue('実績累計'),
        actualAverage: getValue('実績平均'),
        planCumulative: getValue('計画累計'),
        planAverage: getValue('計画平均'),
        prevYearCumulative: getValue('前年累計'),
        prevYearAverage: getValue('前年平均'),
      }
    })

    // フィルタ前のKPIをログ
    const kpisBeforeFilter = generatedKpis.map(k => ({
      name: k.name,
      actual: k.actualCumulative,
      plan: k.planCumulative,
      prev: k.prevYearCumulative
    }))
    console.log('[KPI生成] フィルタ前の全KPI:', kpisBeforeFilter)

    const filteredKpis = generatedKpis.filter(kpi =>
      kpi.actualCumulative !== undefined ||
      kpi.planCumulative !== undefined ||
      kpi.prevYearCumulative !== undefined
    )

    console.log('[KPI生成] 生成されたKPI:', filteredKpis.map(k => k.name))
    setKpis(filteredKpis)
  }, [selectedColumns, monthlyData])

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

  // グラフ編集を保存
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
        // ローカルのchartsを更新
        setCharts(prev => prev.map(c => c.id === updatedChart.id ? updatedChart : c))
        setEditingChart(null)
      }
    } catch (error) {
      console.error('Failed to save chart:', error)
    }
  }

  // グラフ削除
  const handleDeleteChart = async (chartId: string) => {
    if (!confirm('このグラフを削除しますか？')) return
    try {
      const res = await fetch(`/api/clients/${clientId}/charts/${chartId}`, {
        method: 'DELETE',
      })
      const result = await res.json()
      if (result.success) {
        setCharts(prev => prev.filter(c => c.id !== chartId))
      }
    } catch (error) {
      console.error('Failed to delete chart:', error)
    }
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

  // KPIをグリッド用に変換（非表示設定・順序を適用）
  const displayKpis = useMemo(() => {
    const filtered = kpis
      .filter((k) => !hiddenKpis.includes(k.key))
      .map((k) => ({
        name: k.name,
        unit: k.unit,
        actualCumulative: k.actualCumulative,
        actualAverage: k.actualAverage,
        planCumulative: k.planCumulative,
        planAverage: k.planAverage,
        prevYearCumulative: k.prevYearCumulative,
        prevYearAverage: k.prevYearAverage,
      }))

    // 保存された順序に並べ替え
    if (kpiOrder.length > 0) {
      return filtered.sort((a, b) => {
        const aIndex = kpiOrder.indexOf(a.name)
        const bIndex = kpiOrder.indexOf(b.name)
        // 順序リストにないものは最後に
        if (aIndex === -1 && bIndex === -1) return 0
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      })
    }
    return filtered
  }, [kpis, hiddenKpis, kpiOrder])

  // KPI順序変更ハンドラ
  const handleKpiReorder = useCallback((reorderedKpis: { name: string }[]) => {
    setKpiOrder(reorderedKpis.map(k => k.name))
  }, [])

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
            <button
              onClick={async () => {
                setRefreshingData(true)
                try {
                  await fetch(`/api/clients/${clientId}/data/refresh`, { method: 'POST' })
                  // データ再取得
                  window.location.reload()
                } finally {
                  setRefreshingData(false)
                }
              }}
              disabled={refreshingData}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshingData ? 'animate-spin' : ''} />
              {refreshingData ? '更新中...' : 'データ更新'}
            </button>
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
          {/* データパネルが閉じているとき：開くボタン */}
          {!showDataPanel && (
            <button
              onClick={() => setShowDataPanel(true)}
              className="p-2 text-gray-400 hover:text-gray-600 active:text-blue-600 active:scale-95 transition-all"
              title="データ表示を開く"
            >
              <PanelLeftOpen size={20} />
            </button>
          )}

          {/* Left: KPI + Charts (横折りたたみ、メモ閉じたら全幅) */}
          {showDataPanel && (
            <div className={`${showMemoPanel ? 'w-[400px] flex-shrink-0' : 'flex-1'} space-y-4`}>
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
                  <KpiGrid kpis={displayKpis} editable onReorder={handleKpiReorder} />
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-500">
                    KPIデータなし
                  </div>
                )}
              </div>

              {/* Charts - グラフ作成で自由に追加可能 */}
              {sortedCharts.map((chart) => (
                <div key={chart.id} className="relative group">
                  {/* 編集・削除ボタン */}
                  <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingChart(chart)}
                      className="p-1.5 bg-white/90 hover:bg-white rounded-lg shadow text-gray-600 hover:text-blue-600"
                      title="編集"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteChart(chart.id)}
                      className="p-1.5 bg-white/90 hover:bg-white rounded-lg shadow text-gray-600 hover:text-red-600"
                      title="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <ChartRenderer
                    config={chart}
                    globalFilters={globalFilters}
                    data={monthlyData}
                    metrics={currentMetrics.length > 0 ? currentMetrics : undefined}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Right: PDCA Editor + History (メモ閉じたら完全非表示) */}
          {showMemoPanel && (
          <div className="flex-1 space-y-4">
            {/* メモ閉じるボタン */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowMemoPanel(false)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 active:text-blue-600 active:scale-95 transition-all"
              >
                <PanelRightClose size={18} />
                メモを閉じる
              </button>
            </div>

            {/* 進行中タスク（最上部に表示）またはペンディング変更がある場合 */}
            {showMemoPanel && (tasks.filter(t => t.status === 'doing').length > 0 || pendingTaskChanges.size > 0) && (
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

            {/* ミーティングメモ（SAT形式） - 折りたたみ可能 */}
            {showMemoPanel && (
              <>
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
              </>
            )}
          </div>
          )}

          {/* メモが閉じているとき：開くボタン（アイコンのみ） */}
          {!showMemoPanel && (
            <button
              onClick={() => setShowMemoPanel(true)}
              className="p-2 text-gray-400 hover:text-gray-600 active:text-blue-600 active:scale-95 transition-all"
              title="ミーティングメモを開く"
            >
              <PanelRightOpen size={20} />
            </button>
          )}
        </div>
      </main>

      {/* カラム選択モーダル */}
      {showColumnSelector && (
        <ColumnSelectorTable
          clientId={clientId}
          entityId={entityId}
          onClose={() => setShowColumnSelector(false)}
          onSave={(columns) => {
            console.log('[データ項目] 保存されたカラム:', columns.length, columns.map(c => c.name))
            setSelectedColumns(columns)
          }}
        />
      )}

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
