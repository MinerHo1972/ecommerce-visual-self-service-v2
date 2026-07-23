// GET /api/admin/users — 列出所有用户（仅 admin）
// PATCH /api/admin/users/:id — 修改 role / status / name / password
// DELETE /api/admin/users/:id — 软删除（防把自己删了）
// POST /api/admin/users — 新建用户（账密登录，可选绑定飞书 open_id）
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/api-auth'
import prisma from '@/lib/db/prisma'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin'])
  if (auth instanceof NextResponse) return auth
  const users = await prisma.user.findMany({
    orderBy: { created_at: 'asc' },
    select: {
      id: true, name: true, email: true, role: true, status: true,
      feishu_open_id: true, avatar_url: true, created_at: true, updated_at: true,
    },
  })
  return NextResponse.json({ data: { items: users, total: users.length } })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin'])
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))
  const { name, email, password, role = 'operator', feishu_open_id } = body || {}
  if (!name || !email || !password) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '姓名、邮箱、密码必填' } }, { status: 400 })
  }
  if (!['operator', 'designer', 'admin'].includes(role)) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '角色非法' } }, { status: 400 })
  }
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    return NextResponse.json({ error: { code: 'CONFLICT', message: '邮箱已存在' } }, { status: 409 })
  }
  const password_hash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, email, password_hash, role, feishu_open_id: feishu_open_id || null },
    select: { id: true, name: true, email: true, role: true, status: true, created_at: true },
  })
  return NextResponse.json({ data: user })
}
