import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('token')?.value

  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '未登录' } },
      { status: 401 }
    )
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Token 无效或已过期' } },
      { status: 401 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar_url: true,
      feishu_open_id: true,
    },
  })

  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '用户不存在' } },
      { status: 401 }
    )
  }

  return NextResponse.json({ data: { user } })
}
