'use client'

import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'

export interface PlRecord {
  年月: string
  店舗コード: string
  店舗名: string
  大項目: string
  中項目: string
  単位: string
  区分: string
  値: number
}

interface PlDashboardProps {
  data: PlRecord[]
  storeCode?: string
  storeName?: string
}

function formatYen(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1)}万`
  }
  return value.toLocaleString()
}

// 損益推移グラフ（売上・原価・粗利）
export function PlTrendChart({ data, storeCode }: { data: PlRecord[], storeCode?: string }) {
  const chartData = useMemo(() => {
    const filtered = data.filter(r =>
      (!storeCode || r.店舗コード === storeCode) &&
      r.区分 === '実績'
    )

    const byMonth: Record<string, { 売上高: number, 売上原価: number, 粗利: number }> = {}

    filtered.forEach(r => {
      if (!byMonth[r.年月]) {
        byMonth[r.年月] = { 売上高: 0, 売上原価: 0, 粗利: 0 }
      }
      if (r.大項目 === '売上高') {
        byMonth[r.年月].売上高 += r.値 || 0
      } else if (r.大項目 === '売上原価') {
        byMonth[r.年月].売上原価 += r.値 || 0
      }
    })

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        月: month.slice(5),
        売上高: Math.round(v.売上高 / 10000),
        売上原価: Math.round(v.売上原価 / 10000),
        粗利: Math.round((v.売上高 - v.売上原価) / 10000),
      }))
  }, [data, storeCode])

  if (chartData.length === 0) return <div className="text-gray-500 text-center py-8">データなし</div>

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">損益推移</h3>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="月" />
          <YAxis unit="万" />
          <Tooltip formatter={(v) => [`${Number(v).toLocaleString()}万円`]} />
          <Legend />
          <Bar dataKey="売上高" fill="#3B82F6" />
          <Bar dataKey="売上原価" fill="#EF4444" />
          <Line type="monotone" dataKey="粗利" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// 利益率推移グラフ
export function ProfitRatioChart({ data, storeCode }: { data: PlRecord[], storeCode?: string }) {
  const chartData = useMemo(() => {
    const filtered = data.filter(r =>
      (!storeCode || r.店舗コード === storeCode) &&
      r.区分 === '実績'
    )

    const byMonth: Record<string, { 売上高: number, 売上原価: number, 販管費: number }> = {}

    filtered.forEach(r => {
      if (!byMonth[r.年月]) {
        byMonth[r.年月] = { 売上高: 0, 売上原価: 0, 販管費: 0 }
      }
      if (r.大項目 === '売上高') {
        byMonth[r.年月].売上高 += r.値 || 0
      } else if (r.大項目 === '売上原価') {
        byMonth[r.年月].売上原価 += r.値 || 0
      } else if (r.大項目 === '販管費' || r.大項目 === 'その他') {
        // 人件費・家賃等は販管費に含める
        if (r.中項目?.includes('給与') || r.中項目?.includes('人件費') ||
            r.中項目?.includes('賃借料') || r.中項目?.includes('家賃')) {
          byMonth[r.年月].販管費 += r.値 || 0
        }
      }
    })

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        const sales = v.売上高 || 1
        const grossProfit = v.売上高 - v.売上原価
        const operatingProfit = grossProfit - v.販管費
        return {
          月: month.slice(5),
          粗利率: Math.round((grossProfit / sales) * 1000) / 10,
          営業利益率: Math.round((operatingProfit / sales) * 1000) / 10,
        }
      })
  }, [data, storeCode])

  if (chartData.length === 0) return <div className="text-gray-500 text-center py-8">データなし</div>

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">利益率推移</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="月" />
          <YAxis unit="%" domain={[-20, 80]} />
          <Tooltip formatter={(v) => [`${v}%`]} />
          <Legend />
          <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="粗利率" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="営業利益率" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// コスト構成比
export function CostBreakdownChart({ data, storeCode }: { data: PlRecord[], storeCode?: string }) {
  const chartData = useMemo(() => {
    const filtered = data.filter(r =>
      (!storeCode || r.店舗コード === storeCode) &&
      r.区分 === '実績'
    )

    // 最新月のデータを取得
    const months = [...new Set(filtered.map(r => r.年月))].sort()
    const latestMonth = months[months.length - 1]
    const monthData = filtered.filter(r => r.年月 === latestMonth)

    const sales = monthData.filter(r => r.大項目 === '売上高').reduce((sum, r) => sum + (r.値 || 0), 0)

    // コスト項目を集計
    const costs: Record<string, number> = {
      '原材料費': 0,
      '人件費': 0,
      '賃借料': 0,
      '水道光熱費': 0,
      'その他経費': 0,
    }

    monthData.forEach(r => {
      const val = r.値 || 0
      if (r.大項目 === '売上原価') {
        costs['原材料費'] += val
      } else if (r.中項目?.includes('給与') || r.中項目?.includes('人件費') || r.中項目?.includes('賞与')) {
        costs['人件費'] += val
      } else if (r.中項目?.includes('賃借料') || r.中項目?.includes('家賃')) {
        costs['賃借料'] += val
      } else if (r.中項目?.includes('水道') || r.中項目?.includes('光熱')) {
        costs['水道光熱費'] += val
      } else if (r.大項目 === '販管費' || r.大項目 === 'その他') {
        costs['その他経費'] += val
      }
    })

    return Object.entries(costs)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name,
        value: Math.round(value / 10000),
        ratio: sales > 0 ? Math.round((value / sales) * 1000) / 10 : 0,
      }))
  }, [data, storeCode])

  if (chartData.length === 0) return <div className="text-gray-500 text-center py-8">データなし</div>

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">コスト構成（直近月）</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" unit="万" />
          <YAxis type="category" dataKey="name" width={80} />
          <Tooltip formatter={(v, name) => {
            const item = chartData.find(d => d.value === v)
            return [`${Number(v).toLocaleString()}万円 (${item?.ratio || 0}%)`, name]
          }} />
          <Bar dataKey="value" fill="#6366F1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// PL KPIカード
export function PlKpiCards({ data, storeCode }: { data: PlRecord[], storeCode?: string }) {
  const kpis = useMemo(() => {
    const filtered = data.filter(r =>
      (!storeCode || r.店舗コード === storeCode) &&
      r.区分 === '実績'
    )

    const months = [...new Set(filtered.map(r => r.年月))].sort()
    const latestMonth = months[months.length - 1]
    const prevMonth = months[months.length - 2]

    const getMonthData = (month: string) => {
      const monthData = filtered.filter(r => r.年月 === month)
      const sales = monthData.filter(r => r.大項目 === '売上高').reduce((sum, r) => sum + (r.値 || 0), 0)
      const costOfSales = monthData.filter(r => r.大項目 === '売上原価').reduce((sum, r) => sum + (r.値 || 0), 0)
      const grossProfit = sales - costOfSales

      // 経常利益を取得
      const ordinaryProfit = monthData.find(r =>
        r.中項目 === '経常利益' || r.中項目 === '配賦後経常利益'
      )?.値 || 0

      return { sales, grossProfit, ordinaryProfit }
    }

    const current = getMonthData(latestMonth)
    const prev = getMonthData(prevMonth)

    return [
      {
        label: '売上高',
        value: current.sales,
        change: prev.sales > 0 ? ((current.sales - prev.sales) / prev.sales) * 100 : undefined,
      },
      {
        label: '粗利',
        value: current.grossProfit,
        change: prev.grossProfit > 0 ? ((current.grossProfit - prev.grossProfit) / prev.grossProfit) * 100 : undefined,
      },
      {
        label: '経常利益',
        value: current.ordinaryProfit,
        change: prev.ordinaryProfit !== 0 ? ((current.ordinaryProfit - prev.ordinaryProfit) / Math.abs(prev.ordinaryProfit)) * 100 : undefined,
      },
    ]
  }, [data, storeCode])

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {kpis.map(kpi => (
        <div key={kpi.label} className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">{kpi.label}</div>
          <div className={`text-2xl font-bold ${kpi.value < 0 ? 'text-red-600' : ''}`}>
            {formatYen(kpi.value)}
            <span className="text-sm font-normal text-gray-500 ml-1">円</span>
          </div>
          {kpi.change !== undefined && (
            <div className={`text-sm ${kpi.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {kpi.change >= 0 ? '↑' : '↓'} {Math.abs(kpi.change).toFixed(1)}% 前月比
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// メインダッシュボード
export function PlDashboard({ data, storeCode, storeName }: PlDashboardProps) {
  return (
    <div className="space-y-6">
      {storeName && (
        <h2 className="text-xl font-bold">{storeName} - 損益分析</h2>
      )}

      {/* KPIカード */}
      <PlKpiCards data={data} storeCode={storeCode} />

      {/* グラフ2列 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlTrendChart data={data} storeCode={storeCode} />
        <ProfitRatioChart data={data} storeCode={storeCode} />
      </div>

      {/* コスト構成 */}
      <CostBreakdownChart data={data} storeCode={storeCode} />
    </div>
  )
}
