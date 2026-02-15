import { SessionOptions, getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { SessionData, User } from './types'
import { getSupabaseServer } from './supabase'

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD as string,
  cookieName: 'pdca-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// 開発用アカウント
const devAccounts: Record<string, { name: string; role: 'admin' | 'user' }> = {
  'owner': { name: 'オーナー（開発用）', role: 'admin' },
}

export async function verifyCredentials(
  email: string,
  passwordPlain: string
): Promise<User | null> {
  // 開発用アカウント（email と password が同じ場合）
  if (email in devAccounts && passwordPlain === email) {
    const account = devAccounts[email]
    return {
      id: `dev-${email}`,
      client_id: '', // 開発用は全企業アクセス可
      email: email,
      password_hash: hashPassword(email),
      name: account.name,
      role: account.role,
      created_at: new Date().toISOString(),
    }
  }

  // Supabaseからユーザー検証
  try {
    const supabase = getSupabaseServer()
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (error || !user) {
      return null
    }

    const inputHash = hashPassword(passwordPlain)
    if (user.password_hash === inputHash) {
      return user as User
    }

    return null
  } catch {
    // Supabase未設定時は開発用アカウントのみ
    console.warn('Supabase接続エラー: 開発用アカウントのみ利用可能')
    return null
  }
}

// 認証チェック用ヘルパー
export async function requireAuth(): Promise<SessionData> {
  const session = await getSession()
  if (!session.isLoggedIn) {
    throw new Error('Unauthorized')
  }
  return session
}

// 管理者チェック
export async function requireAdmin(): Promise<SessionData> {
  const session = await requireAuth()
  if (session.role !== 'admin') {
    throw new Error('Forbidden')
  }
  return session
}
