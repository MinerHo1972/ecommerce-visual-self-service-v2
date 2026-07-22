import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'
import { getSignedUrl } from '@/lib/tos/tos-client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const task = await prisma.generationTask.findUnique({ where: { id } })
    if (!task) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '任务不存在' } },
        { status: 404 }
      )
    }

    if (task.user_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权查看' } },
        { status: 403 }
      )
    }

    // Fix4: 版本链闭合 — 先查当前 task 的图，再扩展到同 root 的所有版本
    const taskImages = await prisma.generatedImage.findMany({
      where: { task_id: id, deleted_at: null },
      select: { root_generated_image_id: true },
      take: 1,
    })

    let images
    if (taskImages.length > 0 && taskImages[0].root_generated_image_id) {
      // 有 root，查同 root 下所有版本
      const rootId = taskImages[0].root_generated_image_id
      images = await prisma.generatedImage.findMany({
        where: {
          OR: [
            { root_generated_image_id: rootId },
            { id: rootId },
          ],
          deleted_at: null,
        },
        orderBy: [{ version_no: 'asc' }, { variant_index: 'asc' }],
        include: { asset: true },
      })
    } else {
      // 无 root（理论上不会），回退到 task_id 查询
      images = await prisma.generatedImage.findMany({
        where: { task_id: id, deleted_at: null },
        orderBy: [{ version_no: 'asc' }, { variant_index: 'asc' }],
        include: { asset: true },
      })
    }

    const result = images.map((img) => ({
      id: img.id,
      version_no: img.version_no,
      variant_index: img.variant_index,
      is_selected: img.is_selected,
      root_generated_image_id: img.root_generated_image_id,
      parent_generated_image_id: img.parent_generated_image_id,
      preview_url: img.asset ? getSignedUrl(img.asset.tos_key, 600) : '',
      quality_check_json: img.quality_check_json,
    }))

    return NextResponse.json({
      data: { images: result },
    })
  } catch (err) {
    console.error('[get-images] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
      { status: 500 }
    )
  }
}
