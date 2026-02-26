import { NextResponse } from 'next/server'
import { ApiResponse, SessionData } from '@/lib/types'

export async function GET(): Promise<NextResponse<ApiResponse<SessionData | null>>> {
  // ログイン画面を割愛 - 常に管理者としてログイン済みを返す
  return NextResponse.json({
    success: true,
    data: {
      userId: 'user-owner',
      email: 'owner',
      name: 'オーナー',
      role: 'admin',
      clientId: null,
      isLoggedIn: true,
    },
  })
}
