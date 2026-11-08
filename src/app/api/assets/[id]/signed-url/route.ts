import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSignedUrl } from '@/lib/tos/tos-client'
import { requireAuth } from '@/lib/auth/api-auth'
import { canReadAsset } from '@/lib/assets/access'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const variant = new URL(req.url).searchParams.get("variant") // "thumb" | null

    const asset = await prisma.asset.findUnique({ where: { id } })

    if (!asset || asset.deleted_at) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '资产不存在' } },
        { status: 404 }
      )
    }

    if (!canReadAsset(auth, asset)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权访问' } },
        { status: 403 }
      )
    }

    // B 方案：variant=thumb 时优先返回缩略图签名 URL；无缩略图回退原图。
    const useThumb = variant === "thumb" && asset.thumb_tos_key
    const key = useThumb ? asset.thumb_tos_key! : asset.tos_key

    const expiresSeconds = 600 // 10 minutes
    const url = getSignedUrl(key, expiresSeconds)
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000)

    return NextResponse.json({
      data: { url, expiresAt: expiresAt.toISOString(), variant: useThumb ? "thumb" : "full" },
    })
  } catch (err) {
    console.error('[signed-url] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
      { status: 500 }
    )
  }
}
