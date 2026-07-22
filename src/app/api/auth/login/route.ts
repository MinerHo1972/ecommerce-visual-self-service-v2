import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { signToken } from '@/lib/auth/jwt'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '邮箱和密码不能为空' } },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    // Generic error to prevent user enumeration
    const unauthorized = () =>
      NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '邮箱或密码错误' } },
        { status: 401 }
      )

    if (!user || user.status !== 'active') {
      return unauthorized()
    }

    const valid = bcrypt.compareSync(password, user.password_hash)
    if (!valid) {
      // Write audit log for failed login
      await prisma.auditLog.create({
        data: {
          actor_user_id: user.id,
          action: 'login_failed',
          target_type: 'auth',
          target_id: user.id,
          detail_json: { email },
          ip: req.headers.get('x-forwarded-for') || null,
          user_agent: req.headers.get('user-agent') || null,
        },
      }).catch(() => {})
      return unauthorized()
    }

    const token = await signToken({
      sub: user.id,
      role: user.role,
      email: user.email,
    })

    const response = NextResponse.json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    })

    response.cookies.set('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('https'),
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
      { status: 500 }
    )
  }
}
