import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'
import { getProvider } from '@/lib/providers/registry'
import { initProviders } from '@/lib/providers'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id: taskId } = await params

    const task = await prisma.generationTask.findUnique({ where: { id: taskId } })
    if (!task) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '任务不存在' } },
        { status: 404 }
      )
    }

    // 权限校验
    if (task.user_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权操作' } },
        { status: 403 }
      )
    }

    // 只有 pending/running 可取消
    if (!['pending', 'running'].includes(task.status)) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: '任务已完成，无法取消' } },
        { status: 409 }
      )
    }

    // 尝试调用 provider cancel
    if (task.provider_task_id) {
      try {
        initProviders()
        const provider = getProvider()
        await provider.cancel(task.provider_task_id)
      } catch {
        // provider cancel 失败不影响任务状态
      }
    }

    // 更新任务状态
    await prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'canceled',
        finished_at: new Date(),
      },
    })

    // 审计日志
    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'task_canceled',
        target_type: 'generation_task',
        target_id: taskId,
      },
    })

    return NextResponse.json({
      data: null,
      message: '已取消',
    })
  } catch (err) {
    console.error('[cancel-task] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '取消任务失败' } },
      { status: 500 }
    )
  }
}
