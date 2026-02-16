import { SessionOptions, getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { SessionData, User } from './types'

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

// アカウント（マスター管理）
const accounts: Record<string, { name: string; role: 'admin' | 'user' }> = {
  'owner': { name: 'オーナー', role: 'admin' },
}

export async function verifyCredentials(
  email: string,
  passwordPlain: string
): Promise<User | null> {
  // アカウント認証（email と password が同じ場合）
  if (email in accounts && passwordPlain === email) {
    const account = accounts[email]
    return {
      id: `user-${email}`,
      client_id: '',
      email: email,
      password_hash: hashPassword(email),
      name: account.name,
      role: account.role,
      created_at: new Date().toISOString(),
    }
  }

  return null
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
