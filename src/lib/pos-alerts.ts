import type { PosRecord } from './types'

export interface PosAlert {
  id: string
  type: 'sales_down' | 'customers_down' | 'unit_price_down' | 'trend_warning'
  severity: 'warning' | 'danger'
  title: string
  description: string
  metric: string
  currentValue: number
  compareValue: number
  changePercent: number
  period: string
}

interface MonthlyMetrics {
  yearMonth: string
  sales: number
  customers: number
  unitPrice: number
}

/**
 * 店舗のPOSデータからアラートを生成
 */
export function generatePosAlerts(
  posData: PosRecord[],
  storeCode?: string
): PosAlert[] {
  const alerts: PosAlert[] = []

  // 店舗でフィルタ
  const filtered = storeCode
    ? posData.filter(r => r.店舗コード === storeCode)
    : posData

  if (filtered.length === 0) return alerts

  // 月別に集計
  const monthlyMap = new Map<string, MonthlyMetrics>()

  for (const record of filtered) {
    const key = record.年月
    const value = record.値 || 0
    const existing = monthlyMap.get(key) || {
      yearMonth: key,
      sales: 0,
      customers: 0,
      unitPrice: 0,
    }

    // 売上
    if (record.大項目 === '売上' && record.中項目 === '純売上高' && record.区分 === '実績') {
      existing.sales += value
    }
    // 客数
    if ((record.大項目 === '客数' || record.中項目?.includes('客数')) && record.区分 === '実績') {
      existing.customers += value
    }

    monthlyMap.set(key, existing)
  }

  // 月順にソート
  const months = Array.from(monthlyMap.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  )

  if (months.length < 2) return alerts

  // 客単価計算
  for (const m of months) {
    if (m.customers > 0) {
      m.unitPrice = Math.round(m.sales / m.customers)
    }
  }

  // 直近月と前月を比較
  const current = months[months.length - 1]
  const previous = months[months.length - 2]

  // 売上前月比
  if (previous.sales > 0) {
    const changePercent = ((current.sales - previous.sales) / previous.sales) * 100
    if (changePercent <= -10) {
      alerts.push({
        id: `alert-sales-${current.yearMonth}`,
        type: 'sales_down',
        severity: changePercent <= -20 ? 'danger' : 'warning',
        title: '売上低下',
        description: `${current.yearMonth}の売上が前月比${Math.abs(changePercent).toFixed(1)}%減少`,
        metric: '売上',
        currentValue: current.sales,
        compareValue: previous.sales,
        changePercent,
        period: current.yearMonth,
      })
    }
  }

  // 客数前月比
  if (previous.customers > 0) {
    const changePercent = ((current.customers - previous.customers) / previous.customers) * 100
    if (changePercent <= -10) {
      alerts.push({
        id: `alert-customers-${current.yearMonth}`,
        type: 'customers_down',
        severity: changePercent <= -20 ? 'danger' : 'warning',
        title: '客数減少',
        description: `${current.yearMonth}の客数が前月比${Math.abs(changePercent).toFixed(1)}%減少`,
        metric: '客数',
        currentValue: current.customers,
        compareValue: previous.customers,
        changePercent,
        period: current.yearMonth,
      })
    }
  }

  // 客単価前月比
  if (previous.unitPrice > 0) {
    const changePercent = ((current.unitPrice - previous.unitPrice) / previous.unitPrice) * 100
    if (changePercent <= -5) {
      alerts.push({
        id: `alert-unitprice-${current.yearMonth}`,
        type: 'unit_price_down',
        severity: changePercent <= -10 ? 'danger' : 'warning',
        title: '客単価低下',
        description: `${current.yearMonth}の客単価が前月比${Math.abs(changePercent).toFixed(1)}%減少`,
        metric: '客単価',
        currentValue: current.unitPrice,
        compareValue: previous.unitPrice,
        changePercent,
        period: current.yearMonth,
      })
    }
  }

  // 3ヶ月連続減少トレンド
  if (months.length >= 3) {
    const last3 = months.slice(-3)
    const salesDecreasing = last3[0].sales > last3[1].sales && last3[1].sales > last3[2].sales
    if (salesDecreasing) {
      const totalDecline = ((last3[2].sales - last3[0].sales) / last3[0].sales) * 100
      alerts.push({
        id: `alert-trend-${current.yearMonth}`,
        type: 'trend_warning',
        severity: 'warning',
        title: '売上減少トレンド',
        description: `3ヶ月連続で売上が減少（累計${Math.abs(totalDecline).toFixed(1)}%減）`,
        metric: '売上トレンド',
        currentValue: last3[2].sales,
        compareValue: last3[0].sales,
        changePercent: totalDecline,
        period: `${last3[0].yearMonth}〜${last3[2].yearMonth}`,
      })
    }
  }

  return alerts
}

/**
 * アラートから課題文を生成
 */
export function alertToIssueText(alert: PosAlert): string {
  const formatted = alert.currentValue.toLocaleString()
  const prevFormatted = alert.compareValue.toLocaleString()
  return `【${alert.title}】${alert.description}\n前月: ${prevFormatted} → 今月: ${formatted}`
}
