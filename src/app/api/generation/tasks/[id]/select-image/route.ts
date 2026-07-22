import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id: taskId } = await params
    const body = await req.json()
    const { generated_image_id } = body

    if (!generated_image_id) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '缺少 generated_image_id' } },
        { status: 400 }
      )
    }

    // Fix4: 不限制 task_id，通过 task 归属校验权限
    const task = await prisma.generationTask.findUnique({ where: { id: taskId } })
    if (!task) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '任务不存在' } },
        { status: 404 }
      )
    }
    if (task.user_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权操作' } },
        { status: 403 }
      )
    }

    // Fix4: 校验目标图片存在（不限 task_id），通过 asset.owner_id 校验权限
    const targetImage = await prisma.generatedImage.findFirst({
      where: { id: generated_image_id, deleted_at: null },
      include: { asset: true },
    })
    if (!targetImage) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '候选图不存在' } },
        { status: 404 }
      )
    }
    // 通过 asset 的 owner_id 校验归属
    if (targetImage.asset?.owner_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权操作该图片' } },
        { status: 403 }
      )
    }

    const rootId = targetImage.root_generated_image_id ?? targetImage.id

    // 事务：同一 root 下先全部 false，再设目标为 true
    await prisma.$transaction([
      prisma.generatedImage.updateMany({
        where: { root_generated_image_id: rootId, deleted_at: null },
        data: { is_selected: false },
      }),
      prisma.generatedImage.updateMany({
        where: { id: rootId, deleted_at: null },
        data: { is_selected: false },
      }),
      prisma.generatedImage.update({
        where: { id: generated_image_id, deleted_at: null },
        data: { is_selected: true },
      }),
    ])

    // 审计日志
    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'image_selected',
        target_type: 'generated_image',
        target_id: generated_image_id,
        detail_json: { task_id: taskId, root_id: rootId },
      },
    })

    return NextResponse.json({
      data: { generated_image_id, is_selected: true },
    })
  } catch (err) {
    console.error('[select-image] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '选择采用版失败' } },
      { status: 500 }
    )
  }
}
