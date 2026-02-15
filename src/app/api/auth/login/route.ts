import { NextRequest, NextResponse } from 'next/server'
import { getSession, verifyCredentials } from '@/lib/auth'
import { ApiResponse } from '@/lib/types'

interface LoginBody {
  email: string
  password: string
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const body: LoginBody = await request.json()
    const { email, password } = body

    // 入力値バリデーション
    if (!email || typeof email !== 'string' || email.length > 255) {
      return NextResponse.json(
        { success: false, error: 'メールアドレスが無効です' },
        { status: 400 }
      )
    }
    if (!password || typeof password !== 'string' || password.length > 128) {
      return NextResponse.json(
        { success: false, error: 'パスワードが無効です' },
        { status: 400 }
      )
    }

    // 認証
    const user = await verifyCredentials(email, password)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'メールアドレスまたはパスワードが正しくありません' },
        { status: 401 }
      )
    }

    // セッション作成
    const session = await getSession()
    session.userId = user.id
    session.email = user.email
    session.name = user.name
    session.role = user.role
    session.clientId = user.client_id || null
    session.isLoggedIn = true
    await session.save()

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'ログインに失敗しました' },
      { status: 500 }
    )
  }
}
