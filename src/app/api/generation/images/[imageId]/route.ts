import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'

// DELETE /api/generation/images/[imageId] — 软删除生成版本
export async function DELETE(
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

    // 权限校验
    if (image.asset?.owner_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权删除该图片' } },
        { status: 403 }
      )
    }

    // 禁止删除采用版
    if (image.is_selected) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: '不能删除当前采用版，请先选择其他版本作为采用版' } },
        { status: 409 }
      )
    }

    // 禁止删除 root 图（保护版本链入口）
    const rootId = image.root_generated_image_id ?? image.id
    if (image.id === rootId) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: '不能删除根版本图，请先删除其子版本' } },
        { status: 409 }
      )
    }

    // 软删除
    await prisma.generatedImage.update({
      where: { id: imageId },
      data: { deleted_at: new Date() },
    })

    // 审计日志
    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'image_deleted',
        target_type: 'generated_image',
        target_id: imageId,
        detail_json: {
          root_id: rootId,
          version_no: image.version_no,
          variant_index: image.variant_index,
        },
      },
    })

    return NextResponse.json({
      data: null,
      message: '已删除',
    })
  } catch (err) {
    console.error('[delete-image] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '删除失败' } },
      { status: 500 }
    )
  }
}
