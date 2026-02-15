import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

// キャッシュディレクトリ
const CACHE_DIR = path.join(process.cwd(), '.cache')

// クライアントごとのデータソース設定
interface DataSource {
  path: string
  folder: string
  sheets: { posSales: string; posItems: string }
}

const DATA_SOURCES: Record<string, DataSource> = {
  'junestory': {
    path: 'C:/Users/yasuh/OneDrive - 株式会社日本コンサルタントグループ　/MyDocuments/00_Junes/2026年10月期_データ/POS分析_ジュネストリー様2.xlsm',
    folder: 'C:/Users/yasuh/OneDrive - 株式会社日本コンサルタントグループ　/MyDocuments/00_Junes',
    sheets: {
      posSales: 'POS売上',
      posItems: 'POS単品',
    },
  },
}

// データソース情報を取得
export interface ClientDataInfo {
  hasDataSource: boolean
  fileName: string | null
  filePath: string | null
  folderPath: string | null
  cacheUpdatedAt: string | null
  hasCache: boolean
}

export function getClientDataInfo(clientId: string): ClientDataInfo {
  const source = DATA_SOURCES[clientId]
  if (!source) {
    return {
      hasDataSource: false,
      fileName: null,
      filePath: null,
      folderPath: null,
      cacheUpdatedAt: getCacheUpdatedAt(clientId),
      hasCache: hasCacheData(clientId),
    }
  }

  // ファイル名を抽出
  const fileName = source.path.split('/').pop() || null

  return {
    hasDataSource: true,
    fileName,
    filePath: source.path,
    folderPath: source.folder,
    cacheUpdatedAt: getCacheUpdatedAt(clientId),
    hasCache: hasCacheData(clientId),
  }
}

// データソースを追加/更新
export function setDataSource(clientId: string, filePath: string, folderPath: string): void {
  DATA_SOURCES[clientId] = {
    path: filePath,
    folder: folderPath,
    sheets: {
      posSales: 'POS売上',
      posItems: 'POS単品',
    },
  }
}

export interface PosSalesRow {
  yearMonth: string
  storeCode: number
  storeName: string
  businessDay: string
  groups: number
  personsPerGroup: number
  customers: number
  customerPrice: number
  netSales: number
  prevYearSales: number | null
  prevYearCustomers: number | null
  prevYearCustomerPrice: number | null
}

// 利用可能なデータ項目の定義
export interface DataField {
  key: string
  label: string
  unit: string
  type: 'number' | 'currency' | 'percent'
}

export const POS_SALES_FIELDS: DataField[] = [
  { key: 'netSales', label: '売上高', unit: '円', type: 'currency' },
  { key: 'customers', label: '客数', unit: '人', type: 'number' },
  { key: 'customerPrice', label: '客単価', unit: '円', type: 'currency' },
  { key: 'groups', label: '組数', unit: '組', type: 'number' },
  { key: 'personsPerGroup', label: '一組当たり人数', unit: '人', type: 'number' },
  { key: 'prevYearSales', label: '前年売上高', unit: '円', type: 'currency' },
  { key: 'prevYearCustomers', label: '前年客数', unit: '人', type: 'number' },
  { key: 'prevYearCustomerPrice', label: '前年客単価', unit: '円', type: 'currency' },
]

// 利用可能なフィールド一覧を取得
export function getAvailableFields(): DataField[] {
  return POS_SALES_FIELDS
}

export interface PosItemRow {
  yearMonth: string
  storeCode: number
  storeName: string
  category: string
  productCode: string
  productName: string
  category1: string
  category2: string
  quantity: number
  sales: number
  unitPrice: number
}

interface CacheData {
  updatedAt: string
  posSales: PosSalesRow[]
  posItems: PosItemRow[]
}

// キャッシュファイルパスを取得
function getCachePath(clientId: string): string {
  return path.join(CACHE_DIR, `${clientId}.json`)
}

// キャッシュが存在するか確認
export function hasCacheData(clientId: string): boolean {
  return fs.existsSync(getCachePath(clientId))
}

// キャッシュの更新日時を取得
export function getCacheUpdatedAt(clientId: string): string | null {
  const cachePath = getCachePath(clientId)
  if (!fs.existsSync(cachePath)) return null
  try {
    const cache: CacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    return cache.updatedAt
  } catch {
    return null
  }
}

// キャッシュからデータを読み込む
function loadCache(clientId: string): CacheData | null {
  const cachePath = getCachePath(clientId)
  if (!fs.existsSync(cachePath)) return null
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
  } catch {
    return null
  }
}

// エクセルからデータを読み込んでキャッシュに保存
export function refreshCache(clientId: string): { success: boolean; updatedAt: string; error?: string } {
  const source = DATA_SOURCES[clientId]
  if (!source) {
    return { success: false, updatedAt: '', error: `データソースが設定されていません: ${clientId}` }
  }

  try {
    // キャッシュディレクトリ作成
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }

    // エクセル読み込み
    const buffer = fs.readFileSync(source.path)
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    // POS売上シート
    const salesSheet = workbook.Sheets[source.sheets.posSales]
    const salesRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(salesSheet)
    const posSales: PosSalesRow[] = salesRaw.map((row) => ({
      yearMonth: String(row['年月'] || ''),
      storeCode: Number(row['店番']) || 0,
      storeName: String(row['店名'] || ''),
      businessDay: String(row['営業日'] || ''),
      groups: Number(row['組数(組)']) || 0,
      personsPerGroup: Number(row['一組当たり人数']) || 0,
      customers: Number(row['客数']) || 0,
      customerPrice: Number(row['客単価']) || 0,
      netSales: Number(row['純売上高']) || Number(row['純売上高POS']) || 0,
      prevYearSales: row['前年売上高'] ? Number(row['前年売上高']) : null,
      prevYearCustomers: row['前年客数'] ? Number(row['前年客数']) : null,
      prevYearCustomerPrice: row['前年客単価'] ? Number(row['前年客単価']) : null,
    }))

    // POS単品シート
    const itemsSheet = workbook.Sheets[source.sheets.posItems]
    const itemsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(itemsSheet)
    const posItems: PosItemRow[] = itemsRaw.map((row) => ({
      yearMonth: String(row['年月'] || ''),
      storeCode: Number(row['店番']) || 0,
      storeName: String(row['店名'] || ''),
      category: String(row['業態'] || ''),
      productCode: String(row['商品コード'] || ''),
      productName: String(row['商品名'] || ''),
      category1: String(row['カテゴリ1'] || ''),
      category2: String(row['カテゴリ2'] || ''),
      quantity: Number(row['売上数量']) || 0,
      sales: Number(row['売上金額']) || 0,
      unitPrice: Number(row['平均単価']) || 0,
    }))

    const updatedAt = new Date().toISOString()
    const cache: CacheData = { updatedAt, posSales, posItems }

    // キャッシュ保存
    fs.writeFileSync(getCachePath(clientId), JSON.stringify(cache))

    return { success: true, updatedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'エクセル読み込みエラー'
    return { success: false, updatedAt: '', error: message }
  }
}

// POS売上データを取得（キャッシュ優先）
export function readPosSales(clientId: string): PosSalesRow[] {
  const cache = loadCache(clientId)
  if (cache) {
    return cache.posSales
  }
  // Vercel環境ではエクセルがないのでキャッシュがなければ空配列を返す
  const source = DATA_SOURCES[clientId]
  if (!source || !fs.existsSync(source.path)) {
    console.warn(`キャッシュが見つかりません: ${clientId}`)
    return []
  }
  // ローカル環境ではキャッシュがなければ自動リフレッシュ
  const result = refreshCache(clientId)
  if (!result.success) {
    throw new Error(result.error)
  }
  return loadCache(clientId)!.posSales
}

// POS単品データを取得（キャッシュ優先）
export function readPosItems(clientId: string): PosItemRow[] {
  const cache = loadCache(clientId)
  if (cache) {
    return cache.posItems
  }
  // Vercel環境ではエクセルがないのでキャッシュがなければ空配列を返す
  const source = DATA_SOURCES[clientId]
  if (!source || !fs.existsSync(source.path)) {
    console.warn(`キャッシュが見つかりません: ${clientId}`)
    return []
  }
  // ローカル環境ではキャッシュがなければ自動リフレッシュ
  const result = refreshCache(clientId)
  if (!result.success) {
    throw new Error(result.error)
  }
  return loadCache(clientId)!.posItems
}

// 月別集計データを取得（全フィールド対応）
export interface MonthlySummary {
  yearMonth: string
  sales: number
  customers: number
  customerPrice: number
  prevYearSales: number | null
  prevYearCustomers: number | null
}

// 全フィールドを含む月別データ
export interface MonthlyData {
  yearMonth: string
  netSales: number
  customers: number
  customerPrice: number
  groups: number
  personsPerGroup: number
  prevYearSales: number | null
  prevYearCustomers: number | null
  prevYearCustomerPrice: number | null
}

export function getMonthlyData(clientId: string, storeFilter?: string): MonthlyData[] {
  const data = readPosSales(clientId)

  // TOTAL行のみ抽出（日別ではなく月合計）
  const totals = data.filter((row) => row.businessDay === 'TOTAL')

  // 店舗フィルター適用
  const filtered = storeFilter && storeFilter !== '全店'
    ? totals.filter((row) => row.storeName === storeFilter)
    : totals

  // 年月でグループ化して集計
  const byMonth = new Map<string, MonthlyData>()

  for (const row of filtered) {
    const existing = byMonth.get(row.yearMonth)
    if (existing) {
      existing.netSales += row.netSales
      existing.customers += row.customers
      existing.groups += row.groups
      existing.prevYearSales = (existing.prevYearSales || 0) + (row.prevYearSales || 0)
      existing.prevYearCustomers = (existing.prevYearCustomers || 0) + (row.prevYearCustomers || 0)
    } else {
      byMonth.set(row.yearMonth, {
        yearMonth: row.yearMonth,
        netSales: row.netSales,
        customers: row.customers,
        customerPrice: 0,
        groups: row.groups,
        personsPerGroup: 0,
        prevYearSales: row.prevYearSales,
        prevYearCustomers: row.prevYearCustomers,
        prevYearCustomerPrice: row.prevYearCustomerPrice,
      })
    }
  }

  // 計算フィールドを算出してソート
  const result = Array.from(byMonth.values())
    .map((m) => ({
      ...m,
      customerPrice: m.customers > 0 ? Math.round(m.netSales / m.customers) : 0,
      personsPerGroup: m.groups > 0 ? Math.round((m.customers / m.groups) * 10) / 10 : 0,
      prevYearCustomerPrice: m.prevYearCustomers && m.prevYearSales
        ? Math.round(m.prevYearSales / m.prevYearCustomers)
        : null,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))

  return result
}

export function getMonthlySummary(clientId: string, storeFilter?: string): MonthlySummary[] {
  const data = getMonthlyData(clientId, storeFilter)
  return data.map((m) => ({
    yearMonth: m.yearMonth,
    sales: m.netSales,
    customers: m.customers,
    customerPrice: m.customerPrice,
    prevYearSales: m.prevYearSales,
    prevYearCustomers: m.prevYearCustomers,
  }))
}

// 店舗一覧を取得
export function getStoreList(clientId: string): string[] {
  const data = readPosSales(clientId)
  const stores = new Set<string>()
  for (const row of data) {
    if (row.storeName) {
      stores.add(row.storeName)
    }
  }
  return Array.from(stores).sort()
}

// KPIデータを取得（直近月・全項目）
export interface KpiData {
  key: string
  name: string
  target: number
  actual: number
  prevYear: number | null
  unit?: string
}

export function getLatestKpis(clientId: string, storeFilter?: string): KpiData[] {
  const data = getMonthlyData(clientId, storeFilter)
  if (data.length === 0) return []

  const latest = data[data.length - 1]
  const prevMonth = data.length > 1 ? data[data.length - 2] : null

  const kpis: KpiData[] = [
    {
      key: 'netSales',
      name: '売上高',
      target: latest.prevYearSales || (prevMonth?.netSales || latest.netSales),
      actual: latest.netSales,
      prevYear: latest.prevYearSales,
      unit: '円',
    },
    {
      key: 'customers',
      name: '客数',
      target: latest.prevYearCustomers || (prevMonth?.customers || latest.customers),
      actual: latest.customers,
      prevYear: latest.prevYearCustomers,
      unit: '人',
    },
    {
      key: 'customerPrice',
      name: '客単価',
      target: latest.prevYearCustomerPrice || (prevMonth?.customerPrice || latest.customerPrice),
      actual: latest.customerPrice,
      prevYear: latest.prevYearCustomerPrice,
      unit: '円',
    },
    {
      key: 'groups',
      name: '組数',
      target: prevMonth?.groups || latest.groups,
      actual: latest.groups,
      prevYear: null,
      unit: '組',
    },
    {
      key: 'personsPerGroup',
      name: '一組当たり人数',
      target: prevMonth?.personsPerGroup || latest.personsPerGroup,
      actual: latest.personsPerGroup,
      prevYear: null,
      unit: '人',
    },
  ]

  // 前年データがある項目のみ追加
  if (latest.prevYearSales) {
    kpis.push({
      key: 'prevYearSales',
      name: '前年売上',
      target: latest.prevYearSales,
      actual: latest.prevYearSales,
      prevYear: null,
      unit: '円',
    })
  }
  if (latest.prevYearCustomers) {
    kpis.push({
      key: 'prevYearCustomers',
      name: '前年客数',
      target: latest.prevYearCustomers,
      actual: latest.prevYearCustomers,
      prevYear: null,
      unit: '人',
    })
  }

  return kpis
}
