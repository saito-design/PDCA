// クライアント（企業）
export interface Client {
  id: string
  name: string
  drive_folder_id: string | null
  created_at: string
}

// エンティティ（部署/店舗）
export interface Entity {
  id: string
  client_id: string
  name: string
  drive_folder_id?: string  // 部署ごとのDriveフォルダID
  sort_order: number
  created_at: string
}

// ユーザー
export interface User {
  id: string
  client_id: string
  email: string
  password_hash: string
  name: string
  role: 'admin' | 'user'
  created_at: string
}

// グラフ定義
export type ChartType = 'line' | 'bar'
export type LineStyle = 'solid' | 'dashed' | 'dotted'
export type AggKey = 'raw' | 'yoy_diff' | 'yoy_pct' | 'cumulative'

// 各系列の設定
export interface SeriesConfig {
  key: string
  chartType: ChartType
  lineStyle?: LineStyle
  opacity?: number  // 0-1 (前年は薄くする等)
  yAxisId?: 'left' | 'right'  // 第2軸使用
  color?: string  // カスタム色
  strokeWidth?: number  // 線の太さ (1-5)
}

export interface Chart {
  id: string
  client_id: string
  title: string
  type: ChartType  // デフォルトタイプ（後方互換）
  x_key: string
  series_keys: string[]
  series_config?: SeriesConfig[]  // 各系列の詳細設定
  agg_key: AggKey
  store_override: string | null
  filters: Record<string, unknown>
  show_on_dashboard: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// PDCAステータス
export type PdcaStatus = 'open' | 'doing' | 'done' | 'paused'

// タスク（シンプル構造）
export interface Task {
  id: string
  client_id: string
  entity_name: string       // 部署名を直接保持
  title: string
  status: PdcaStatus
  date: string              // 登録日
  created_at: string
  updated_at: string
}

// PDCAタスク
export interface PdcaIssue {
  id: string
  client_id: string
  entity_id: string
  title: string
  status: PdcaStatus
  created_at: string
  updated_at: string
}

// エイリアス（用語統一: Issue → Task）
export type PdcaTask = PdcaIssue

export interface PdcaCycle {
  id: string
  client_id: string
  entity_id?: string  // 部署ID（レポート出力時に使用）
  issue_id: string
  cycle_date: string
  situation: string
  issue: string
  action: string
  target: string
  status: PdcaStatus
  created_at: string
  updated_at: string
}

// KPIファクト
export interface KpiFact {
  id: string
  client_id: string
  entity_id: string
  period: string
  metric_key: string
  value: number
  created_at: string
}

// 指標定義
export interface MetricDefinition {
  id: string
  client_id: string
  metric_key: string
  display_name: string
  unit: string
  allowed_aggs: AggKey[]
  created_at: string
}

// セッションデータ
export interface SessionData {
  userId: string
  email: string
  name: string
  role: 'admin' | 'user'
  clientId: string | null
  isLoggedIn: boolean
}

// API レスポンス
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// フィルタ設定
export interface GlobalFilters {
  store: string
  lastN: number
}

// グラフ作成用
export interface ChartConfig {
  id: string
  type: ChartType
  title: string
  xKey: string
  seriesKeys: string[]
  seriesConfig?: SeriesConfig[]  // 各系列の詳細設定
  aggKey: AggKey
  store: string | null
  showOnDashboard: boolean
  sortOrder: number
}

// 動的メトリクス定義（column-selectorと連携）
export interface DynamicMetric {
  key: string      // カラム名
  label: string    // 表示名
  color: string    // グラフの色
  unit: string     // 単位（円、人、%など）
  type: 'number' | 'string' | 'date' | 'unknown'
}
