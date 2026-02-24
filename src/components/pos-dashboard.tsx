'use client'

import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { PosRecord } from '@/lib/types'

interface PosDashboardProps {
  data: PosRecord[]
  storeCode?: string
  storeName?: string
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

function formatValue(value: number, unit: string): string {
  if (unit === '円') {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`
    }
    return value.toLocaleString()
  }
  return value.toLocaleString()
}

// 売上推移グラフ
export function SalesTrendChart({ data, storeCode }: { data: PosRecord[], storeCode?: string }) {
  const chartData = useMemo(() => {
    const filtered = data.filter(r =>
      r.大項目 === '売上' &&
      r.中項目 === '純売上高' &&
      r.区分 === '実績' &&
      (!storeCode || r.店舗コード === storeCode)
    )

    const byMonth: Record<string, number> = {}
    filtered.forEach(r => {
      if (r.値 !== null) {
        byMonth[r.年月] = (byMonth[r.年月] || 0) + r.値
      }
    })

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        月: month.slice(5), // "2025-12" -> "12"
        売上: value / 10000, // 万円単位
      }))
  }, [data, storeCode])

  if (chartData.length === 0) return <div className="text-gray-500 text-center py-8">データなし</div>

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">売上推移</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="月" />
          <YAxis unit="万" />
          <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}万円`, '売上']} />
          <Line type="monotone" dataKey="売上" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// 客数・客単価推移グラフ
export function CustomerAnalysisChart({ data, storeCode }: { data: PosRecord[], storeCode?: string }) {
  const chartData = useMemo(() => {
    const filtered = data.filter(r =>
      (r.中項目 === '客数' || r.中項目 === '客単価') &&
      r.区分 === '実績' &&
      (!storeCode || r.店舗コード === storeCode)
    )

    const byMonth: Record<string, { 客数: number, 客単価: number, count: number }> = {}
    filtered.forEach(r => {
      if (r.値 !== null) {
        if (!byMonth[r.年月]) {
          byMonth[r.年月] = { 客数: 0, 客単価: 0, count: 0 }
        }
        if (r.中項目 === '客数') {
          byMonth[r.年月].客数 += r.値
        } else if (r.中項目 === '客単価') {
          byMonth[r.年月].客単価 += r.値
          byMonth[r.年月].count += 1
        }
      }
    })

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        月: month.slice(5),
        客数: v.客数,
        客単価: v.count > 0 ? Math.round(v.客単価 / v.count) : 0,
      }))
  }, [data, storeCode])

  if (chartData.length === 0) return <div className="text-gray-500 text-center py-8">データなし</div>

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">客数・客単価推移</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="月" />
          <YAxis yAxisId="left" orientation="left" />
          <YAxis yAxisId="right" orientation="right" unit="円" />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="客数" fill="#10B981" />
          <Line yAxisId="right" type="monotone" dataKey="客単価" stroke="#F59E0B" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// カテゴリ構成比（円グラフ）
export function CategoryPieChart({ data, storeCode }: { data: PosRecord[], storeCode?: string }) {
  const chartData = useMemo(() => {
    const filtered = data.filter(r =>
      r.大項目 === '単品売上' &&
      r.区分 === '実績' &&
      (!storeCode || r.店舗コード === storeCode)
    )

    // カテゴリごとに集計
    const byCategory: Record<string, number> = {}
    filtered.forEach(r => {
      if (r.値 !== null) {
        const category = r.中項目.split('_')[0] || r.中項目
        byCategory[category] = (byCategory[category] || 0) + r.値
      }
    })

    // 上位8カテゴリ
    return Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }))
  }, [data, storeCode])

  if (chartData.length === 0) return <div className="text-gray-500 text-center py-8">データなし</div>

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">カテゴリ構成比</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
          >
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatValue(Number(v) || 0, '円')} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// 単品ランキング
export function ItemRankingTable({ data, storeCode, limit = 10 }: { data: PosRecord[], storeCode?: string, limit?: number }) {
  const rankings = useMemo(() => {
    const filtered = data.filter(r =>
      (r.大項目 === '単品' || r.大項目 === '単品出数') &&
      r.区分 === '実績' &&
      (!storeCode || r.店舗コード === storeCode)
    )

    // 商品ごとに集計
    const byItem: Record<string, number> = {}
    filtered.forEach(r => {
      if (r.値 !== null) {
        byItem[r.中項目] = (byItem[r.中項目] || 0) + r.値
      }
    })

    return Object.entries(byItem)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, value], idx) => ({ rank: idx + 1, name, value }))
  }, [data, storeCode, limit])

  if (rankings.length === 0) return <div className="text-gray-500 text-center py-8">データなし</div>

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">単品ランキング TOP{limit}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left w-12">#</th>
            <th className="py-2 text-left">商品名</th>
            <th className="py-2 text-right">出数</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map(item => (
            <tr key={item.name} className="border-b hover:bg-gray-50">
              <td className="py-2 font-bold">{item.rank}</td>
              <td className="py-2">{item.name}</td>
              <td className="py-2 text-right">{item.value.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// KPIカード
interface KpiData {
  label: string
  value: number
  unit: string
  change?: number
}

export function PosKpiCards({ data, storeCode }: { data: PosRecord[], storeCode?: string }) {
  const kpis = useMemo(() => {
    const filtered = data.filter(r =>
      r.区分 === '実績' &&
      (!storeCode || r.店舗コード === storeCode)
    )

    // 最新月を取得
    const months = [...new Set(filtered.map(r => r.年月))].sort()
    const latestMonth = months[months.length - 1]
    const prevMonth = months[months.length - 2]

    const getSum = (month: string, category: string, item: string) => {
      return filtered
        .filter(r => r.年月 === month && r.大項目 === category && r.中項目 === item)
        .reduce((sum, r) => sum + (r.値 || 0), 0)
    }

    const getAvg = (month: string, category: string, item: string) => {
      const vals = filtered
        .filter(r => r.年月 === month && r.大項目 === category && r.中項目 === item)
        .map(r => r.値)
        .filter((v): v is number => v !== null)
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }

    const sales = getSum(latestMonth, '売上', '純売上高')
    const prevSales = getSum(prevMonth, '売上', '純売上高')
    const customers = getSum(latestMonth, '客数', '客数')
    const prevCustomers = getSum(prevMonth, '客数', '客数')
    const unitPrice = getAvg(latestMonth, '効率', '客単価')
    const prevUnitPrice = getAvg(prevMonth, '効率', '客単価')

    return [
      {
        label: '売上',
        value: sales,
        unit: '円',
        change: prevSales > 0 ? ((sales - prevSales) / prevSales) * 100 : undefined,
      },
      {
        label: '客数',
        value: customers,
        unit: '人',
        change: prevCustomers > 0 ? ((customers - prevCustomers) / prevCustomers) * 100 : undefined,
      },
      {
        label: '客単価',
        value: unitPrice,
        unit: '円',
        change: prevUnitPrice > 0 ? ((unitPrice - prevUnitPrice) / prevUnitPrice) * 100 : undefined,
      },
    ]
  }, [data, storeCode])

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {kpis.map(kpi => (
        <div key={kpi.label} className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">{kpi.label}</div>
          <div className="text-2xl font-bold">
            {formatValue(kpi.value, kpi.unit)}
            <span className="text-sm font-normal text-gray-500 ml-1">{kpi.unit}</span>
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
export function PosDashboard({ data, storeCode, storeName }: PosDashboardProps) {
  return (
    <div className="space-y-6">
      {storeName && (
        <h2 className="text-xl font-bold">{storeName} - POS分析</h2>
      )}

      {/* KPIカード */}
      <PosKpiCards data={data} storeCode={storeCode} />

      {/* グラフ2列 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SalesTrendChart data={data} storeCode={storeCode} />
        <CustomerAnalysisChart data={data} storeCode={storeCode} />
      </div>

      {/* 下段 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryPieChart data={data} storeCode={storeCode} />
        <ItemRankingTable data={data} storeCode={storeCode} />
      </div>
    </div>
  )
}
