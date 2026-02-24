/**
 * 縦持ちJSON（Drive上）からデータを読み取るモジュール
 *
 * データ形式:
 * { 年月, 部門, 大項目, 中項目, 単位, 区分, 値 }
 *
 * 区分: 実績, 計画, 実績累計, 計画累計
 */

import { loadJsonFromFolder, getDriveClient, isDriveConfigured } from '@/lib/drive'
import { getClientFolderId } from '@/lib/entity-helpers'

// 縦持ちレコードの型
export interface LongFormatRecord {
  年月: string
  部門: string
  大項目: string
  中項目: string
  単位: string
  区分: string
  値: number | null
}

// master_data.json の構造（Pythonスクリプトで生成）
interface MasterData {
  company_name?: string
  generated_at?: string
  format?: string
  columns?: string[]
  total_records?: number
  departments?: string[]
  data: LongFormatRecord[]
}

// KPIデータの型
export interface KpiData {
  key: string
  name: string
  target: number
  actual: number
  prevYear: number | null
  unit: string
}

// 月別データの型
export interface MonthlyMetric {
  yearMonth: string
  [key: string]: string | number | null
}

// キャッシュ
const dataCache = new Map<string, { data: LongFormatRecord[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5分

/**
 * *_master_data.json ファイルを検索
 */
async function findMasterDataFile(folderId: string): Promise<string | null> {
  if (!isDriveConfigured()) return null

  try {
    const drive = getDriveClient()
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false and name contains '_master_data.json'`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const files = res.data.files || []
    if (files.length > 0) {
      return files[0].name || null
    }
    return null
  } catch {
    return null
  }
}

/**
 * Driveからmaster_dataをJSON形式で読み込む
 */
export async function loadUnifiedData(clientId: string): Promise<LongFormatRecord[]> {
  // キャッシュチェック
  const cached = dataCache.get(clientId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  const clientFolderId = await getClientFolderId(clientId)
  if (!clientFolderId) {
    return []
  }

  try {
    // *_master_data.json を検索
    const masterDataFileName = await findMasterDataFile(clientFolderId)
    if (!masterDataFileName) {
      console.warn('master_data.json が見つかりません')
      return []
    }

    const result = await loadJsonFromFolder<MasterData>(masterDataFileName, clientFolderId)

    if (!result?.data?.data) {
      return []
    }

    const records = result.data.data
    dataCache.set(clientId, { data: records, timestamp: Date.now() })
    return records
  } catch (error) {
    console.error('loadMasterData error:', error)
    return []
  }
}

/**
 * 部門一覧を取得
 */
export async function getDepartments(clientId: string): Promise<string[]> {
  const data = await loadUnifiedData(clientId)
  const departments = new Set<string>()
  for (const record of data) {
    if (record.部門) {
      departments.add(record.部門)
    }
  }
  return Array.from(departments).sort()
}

/**
 * 利用可能な指標（中項目）一覧を取得
 */
export async function getAvailableMetrics(clientId: string, department?: string): Promise<{
  key: string
  label: string
  unit: string
  category: string
}[]> {
  const data = await loadUnifiedData(clientId)
  const metrics = new Map<string, { label: string, unit: string, category: string }>()

  for (const record of data) {
    if (department && record.部門 !== department) continue
    if (!record.中項目) continue

    const key = `${record.部門}_${record.中項目}`.replace(/[（）\(\)\s]/g, '_')
    if (!metrics.has(key)) {
      metrics.set(key, {
        label: record.中項目,
        unit: record.単位 || '',
        category: record.大項目 || '',
      })
    }
  }

  return Array.from(metrics.entries()).map(([key, value]) => ({
    key,
    ...value,
  }))
}

/**
 * 最新月のKPIデータを取得（実績 vs 計画）
 */
export async function getLatestKpis(
  clientId: string,
  department?: string
): Promise<KpiData[]> {
  const data = await loadUnifiedData(clientId)
  if (data.length === 0) return []

  // 部門フィルタ
  const filtered = department
    ? data.filter(r => r.部門 === department)
    : data

  // 利用可能な年月を取得し、最新を特定
  const yearMonths = new Set<string>()
  for (const record of filtered) {
    if (record.年月 && record.区分 === '実績') {
      yearMonths.add(record.年月)
    }
  }
  const sortedMonths = Array.from(yearMonths).sort()
  const latestMonth = sortedMonths[sortedMonths.length - 1]
  const prevMonth = sortedMonths[sortedMonths.length - 2] || null

  if (!latestMonth) return []

  // 最新月の実績と計画を集計
  const kpiMap = new Map<string, { actual: number, plan: number, unit: string, name: string }>()

  for (const record of filtered) {
    if (record.年月 !== latestMonth) continue
    if (!record.中項目 || record.値 === null) continue

    const key = record.中項目
    if (!kpiMap.has(key)) {
      kpiMap.set(key, { actual: 0, plan: 0, unit: record.単位 || '', name: record.中項目 })
    }

    const entry = kpiMap.get(key)!
    if (record.区分 === '実績') {
      entry.actual = record.値
    } else if (record.区分 === '計画') {
      entry.plan = record.値
    }
  }

  // 前月実績を取得（前年比較用の代替）
  const prevMonthActuals = new Map<string, number>()
  if (prevMonth) {
    for (const record of filtered) {
      if (record.年月 === prevMonth && record.区分 === '実績' && record.中項目) {
        prevMonthActuals.set(record.中項目, record.値 || 0)
      }
    }
  }

  // KPI配列を生成
  const kpis: KpiData[] = []
  for (const [name, entry] of kpiMap) {
    kpis.push({
      key: name.replace(/[（）\(\)\s]/g, '_'),
      name,
      target: entry.plan || prevMonthActuals.get(name) || entry.actual,
      actual: entry.actual,
      prevYear: prevMonthActuals.get(name) || null,
      unit: entry.unit,
    })
  }

  return kpis
}

/**
 * 月別データを取得（グラフ用）
 */
export async function getMonthlyData(
  clientId: string,
  department?: string,
  metrics?: string[]  // 取得したい中項目リスト
): Promise<MonthlyMetric[]> {
  const data = await loadUnifiedData(clientId)
  if (data.length === 0) return []

  // 部門フィルタ
  const filtered = department
    ? data.filter(r => r.部門 === department)
    : data

  // 年月ごとにデータを集約
  const monthlyMap = new Map<string, MonthlyMetric>()

  for (const record of filtered) {
    if (!record.年月 || record.区分 !== '実績') continue
    if (metrics && !metrics.includes(record.中項目)) continue

    if (!monthlyMap.has(record.年月)) {
      monthlyMap.set(record.年月, { yearMonth: record.年月 })
    }

    const entry = monthlyMap.get(record.年月)!
    const key = record.中項目.replace(/[（）\(\)\s]/g, '_')
    entry[key] = record.値
  }

  // 年月順にソート
  return Array.from(monthlyMap.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  )
}

/**
 * 月別サマリー（売上・客数など主要指標）
 */
export async function getMonthlySummary(
  clientId: string,
  department?: string
): Promise<{
  yearMonth: string
  sales: number
  customers: number
  customerPrice: number
  prevYearSales: number | null
  prevYearCustomers: number | null
}[]> {
  const data = await loadUnifiedData(clientId)
  if (data.length === 0) return []

  // 部門フィルタ（デフォルトは全体）
  const targetDept = department || '全体'
  const filtered = data.filter(r => r.部門 === targetDept)

  // 年月ごとにサマリー集計
  const summaryMap = new Map<string, {
    sales: number
    customers: number
    customerPrice: number
  }>()

  for (const record of filtered) {
    if (!record.年月 || record.区分 !== '実績') continue

    if (!summaryMap.has(record.年月)) {
      summaryMap.set(record.年月, { sales: 0, customers: 0, customerPrice: 0 })
    }

    const entry = summaryMap.get(record.年月)!
    const name = record.中項目

    // 指標名のマッチング（部門によって異なる可能性）
    if (name.includes('売上') || name.includes('室料')) {
      entry.sales += record.値 || 0
    } else if (name.includes('客数') || name.includes('人員') || name.includes('利用人数')) {
      entry.customers += record.値 || 0
    } else if (name.includes('単価') || name === 'ADR（平均客室単価）') {
      entry.customerPrice = record.値 || 0
    }
  }

  // 配列に変換してソート
  return Array.from(summaryMap.entries())
    .map(([yearMonth, data]) => ({
      yearMonth,
      ...data,
      prevYearSales: null,  // TODO: 前年データがあれば対応
      prevYearCustomers: null,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
}

/**
 * キャッシュをクリア
 */
export function clearCache(clientId?: string): void {
  if (clientId) {
    dataCache.delete(clientId)
  } else {
    dataCache.clear()
  }
}
