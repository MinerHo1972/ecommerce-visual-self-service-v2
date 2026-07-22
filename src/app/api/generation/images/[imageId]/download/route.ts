import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'
import { getSignedUrl } from '@/lib/tos/tos-client'

// GET /api/generation/images/[imageId]/download
// 返回短期 signed URL，前端用它下载文件
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { imageId } = await params

    const image = await prisma.generatedImage.findUnique({
      where: { id: imageId },
      include: { asset: true },
    })

    if (!image || image.deleted_at) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '图片不存在或已删除' } },
        { status: 404 }
      )
    }

    if (!image.asset) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '图片资产不存在' } },
        { status: 404 }
      )
    }

    // 权限校验：只有 owner 或 admin 可下载
    if (image.asset.owner_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权下载该图片' } },
        { status: 403 }
      )
    }

    // 生成短期 signed URL（5 分钟有效）
    const downloadUrl = getSignedUrl(image.asset.tos_key, 300)

    return NextResponse.json({
      data: {
        download_url: downloadUrl,
        filename: image.asset.filename,
        expires_in: 300,
      },
    })
  } catch (err) {
    console.error('[download-image] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '下载失败' } },
      { status: 500 }
    )
  }
}
