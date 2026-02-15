'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface MonthlySummary {
  yearMonth: string
  sales: number
  customers: number
  customerPrice: number
  prevYearSales: number | null
  prevYearCustomers: number | null
}

interface SalesChartProps {
  data: MonthlySummary[]
  loading?: boolean
  lastN?: number
}

// 年月を表示用にフォーマット
function formatYearMonth(ym: string): string {
  if (ym.length !== 6) return ym
  const year = ym.slice(0, 4)
  const month = parseInt(ym.slice(4, 6), 10)
  return `${year}/${month}月`
}

// 金額を万円単位でフォーマット
function formatMoney(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}億`
  }
  if (value >= 10000) {
    return `${Math.round(value / 10000)}万`
  }
  return value.toLocaleString()
}

export function SalesChart({ data, loading, lastN = 12 }: SalesChartProps) {
  // 直近N件に絞る
  const displayData = data.slice(-lastN).map((d) => ({
    month: formatYearMonth(d.yearMonth),
    売上: d.sales,
    前年売上: d.prevYearSales,
    客数: d.customers,
    前年客数: d.prevYearCustomers,
    客単価: d.customerPrice,
  }))

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-4">
        <h3 className="font-semibold mb-4">売上推移</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          読み込み中...
        </div>
      </div>
    )
  }

  if (displayData.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-4">
        <h3 className="font-semibold mb-4">売上推移</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          データがありません
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h3 className="font-semibold mb-4">売上推移</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={formatMoney}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => `${v}人`}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value, name) => {
                const v = typeof value === 'number' ? value : 0
                const n = String(name)
                if (n.includes('客数')) {
                  return [`${v.toLocaleString()}人`, n]
                }
                if (n.includes('客単価')) {
                  return [`¥${v.toLocaleString()}`, n]
                }
                return [`¥${v.toLocaleString()}`, n]
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              yAxisId="left"
              dataKey="売上"
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
              name="売上"
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="前年売上"
              stroke="#94a3b8"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
              name="前年売上"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="客数"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="客数"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
