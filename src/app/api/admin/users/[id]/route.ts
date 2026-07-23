import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/api-auth'
import prisma from '@/lib/db/prisma'
import bcrypt from 'bcryptjs'

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, ['admin'])
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { name, role, status, password } = body || {}
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name)
  if (role !== undefined) {
    if (!['operator', 'designer', 'admin'].includes(role)) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '角色非法' } }, { status: 400 })
    }
    data.role = role
  }
  if (status !== undefined) {
    if (!['active', 'suspended'].includes(status)) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '状态非法' } }, { status: 400 })
    }
    data.status = status
  }
  if (password) {
    data.password_hash = await bcrypt.hash(String(password), 10)
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '无更新字段' } }, { status: 400 })
  }
  const updated = await prisma.user.update({ where: { id }, data })
  return NextResponse.json({
    data: {
      id: updated.id, name: updated.name, email: updated.email,
      role: updated.role, status: updated.status, updated_at: updated.updated_at,
    },
  })
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireRole(req, ['admin'])
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  // 禁止删除自己
  if (id === auth.userId) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: '不能删除自己的账号' } }, { status: 403 })
  }
  // 硬删除（数据量小，真删；关联资产/任务保留 owner_id）
  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ data: { id, deleted: true } })
}
