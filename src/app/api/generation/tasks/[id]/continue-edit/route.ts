import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'
import { getSignedUrl } from '@/lib/tos/tos-client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id: taskId } = await params
    const body = await req.json()
    const { source_generated_image_id, edit_instruction_text } = body

    if (!source_generated_image_id) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '缺少 source_generated_image_id' } },
        { status: 400 }
      )
    }
    if (!edit_instruction_text) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '缺少 edit_instruction_text' } },
        { status: 400 }
      )
    }

    // 校验原任务归属
    const originalTask = await prisma.generationTask.findUnique({ where: { id: taskId } })
    if (!originalTask) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '任务不存在' } },
        { status: 404 }
      )
    }
    if (originalTask.user_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权操作' } },
        { status: 403 }
      )
    }

    // Fix4: 校验源图存在（不限 task_id），通过 asset.owner_id 校验归属
    const sourceGi = await prisma.generatedImage.findFirst({
      where: { id: source_generated_image_id, deleted_at: null },
      include: { asset: true },
    })
    if (!sourceGi) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '源图不存在' } },
        { status: 404 }
      )
    }
    // 通过 asset 的 owner_id 校验归属
    if (sourceGi.asset?.owner_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权使用该图片' } },
        { status: 403 }
      )
    }

    // 生成 source image 的 signed URL 用于快照
    const sourceImageUrl = sourceGi.asset ? getSignedUrl(sourceGi.asset.tos_key, 600) : ''

    // 生成新的 task_no
    const date = new Date()
    const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    const suffix = String(date.getTime()).slice(-6)
    const taskNo = `TASK-${yyyymmdd}-${suffix}`

    // 创建 edit 类型的新任务
    const newTask = await prisma.generationTask.create({
      data: {
        task_no: taskNo,
        task_type: 'edit',
        status: 'pending',
        user_id: auth.userId,
        source_generated_image_id: source_generated_image_id,
        input_snapshot_json: {
          sourceImageUrl,
          editInstructionText: edit_instruction_text,
          sourceVersionNo: sourceGi.version_no,
        },
        edit_instruction_text,
        attempt_count: 0,
        max_attempts: 3,
        provider: process.env.GENERATION_PROVIDER || 'mock',
        params_json: { count: 1 },
      },
    })

    // 审计日志
    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'continue_edit',
        target_type: 'generation_task',
        target_id: newTask.id,
        detail_json: {
          source_task_id: taskId,
          source_image_id: source_generated_image_id,
          new_task_id: newTask.id,
        },
      },
    })

    return NextResponse.json(
      {
        data: {
          id: newTask.id,
          task_type: 'edit',
          status: 'pending',
          source_generated_image_id,
          created_at: newTask.created_at,
        },
      },
      { status: 202 }
    )
  } catch (err) {
    console.error('[continue-edit] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '继续改图失败' } },
      { status: 500 }
    )
  }
}
