import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// クライアントサイド用（Row Level Securityに従う）
let clientInstance: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase環境変数が設定されていません')
    }
    clientInstance = createClient(supabaseUrl, supabaseAnonKey)
  }
  return clientInstance
}

// サーバーサイド用（管理者権限）
let serverInstance: SupabaseClient | null = null

export function getSupabaseServer(): SupabaseClient {
  if (!serverInstance) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase SERVICE_ROLE_KEY が設定されていません')
    }
    serverInstance = createClient(supabaseUrl, supabaseServiceKey)
  }
  return serverInstance
}
