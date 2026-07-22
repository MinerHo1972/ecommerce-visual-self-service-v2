import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSignedUrl } from '@/lib/tos/tos-client'
import { verifyToken } from '@/lib/auth/jwt'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
        { error: { code: 'UNAUTHORIZED', message: 'Token 无效' } },
        { status: 401 }
      )
    }

    const { id } = await params

    const asset = await prisma.asset.findUnique({ where: { id } })

    if (!asset || asset.deleted_at) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '资产不存在' } },
        { status: 404 }
      )
    }

    // Owner check (admin can access all)
    if (asset.owner_id !== payload.sub && payload.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权访问' } },
        { status: 403 }
      )
    }

    const expiresSeconds = 600 // 10 minutes
    const url = getSignedUrl(asset.tos_key, expiresSeconds)
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000)

    return NextResponse.json({
      data: { url, expiresAt: expiresAt.toISOString() },
    })
  } catch (err) {
    console.error('[signed-url] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
      { status: 500 }
    )
  }
}
