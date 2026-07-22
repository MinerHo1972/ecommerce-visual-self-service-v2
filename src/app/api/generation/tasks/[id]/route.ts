import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'

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

    // 权限校验
    if (task.user_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权查看该任务' } },
        { status: 403 }
      )
    }

    const snapshot = task.input_snapshot_json as Record<string, unknown> | null
    return NextResponse.json({
      data: {
        id: task.id,
        task_no: task.task_no,
        task_type: task.task_type,
        status: task.status,
        user_id: task.user_id,
        error_code: task.error_code,
        error_message_safe: task.error_message_safe,
        created_at: task.created_at,
        started_at: task.started_at,
        finished_at: task.finished_at,
        params_json: task.params_json,
        provider: task.provider,
        chain_progress: snapshot?.chainProgress ?? null,
        input_snapshot_json: snapshot,
      },
    })
  } catch (err) {
    console.error('[get-task] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
      { status: 500 }
    )
  }
}
