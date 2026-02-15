import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ApiResponse } from '@/lib/types'

export async function POST(): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await getSession()
    session.destroy()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { success: false, error: 'ログアウトに失敗しました' },
      { status: 500 }
    )
  }
}
