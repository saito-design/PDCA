import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ApiResponse, SessionData } from '@/lib/types'

export async function GET(): Promise<NextResponse<ApiResponse<SessionData | null>>> {
  try {
    const session = await getSession()

    if (!session.isLoggedIn) {
      return NextResponse.json({
        success: true,
        data: null,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        clientId: session.clientId,
        isLoggedIn: session.isLoggedIn,
      },
    })
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json(
      { success: false, error: 'セッション確認に失敗しました' },
      { status: 500 }
    )
  }
}
