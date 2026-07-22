import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'
import { AssetVisibility } from '@prisma/client'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: { owner: { select: { name: true, avatar_url: true } } },
    })

    if (!asset || asset.deleted_at) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '资产不存在' } },
        { status: 404 }
      )
    }

    // Owner / admin / public 可见
    if (asset.owner_id !== auth.userId && auth.role !== 'admin' && asset.visibility !== 'public') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权访问' } },
        { status: 403 }
      )
    }

    return NextResponse.json({
      data: {
        id: asset.id,
        type: asset.type,
        filename: asset.filename,
        mime_type: asset.mime_type,
        size_bytes: Number(asset.size_bytes),
        width: asset.width,
        height: asset.height,
        checksum: asset.checksum,
        visibility: asset.visibility,
        owner_id: asset.owner_id,
        owner: asset.owner,
        is_mine: asset.owner_id === auth.userId,
        metadata_json: asset.metadata_json,
        created_at: asset.created_at,
      },
    })
  } catch (err) {
    console.error('[asset get] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const asset = await prisma.asset.findUnique({ where: { id } })

    if (!asset || asset.deleted_at) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '资产不存在' } },
        { status: 404 }
      )
    }

    // 仅 owner / admin 可删
    if (asset.owner_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权删除' } },
        { status: 403 }
      )
    }

    await prisma.asset.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        deleted_by: auth.userId,
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'asset_deleted',
        target_type: 'asset',
        target_id: id,
        detail_json: { filename: asset.filename, tos_key: asset.tos_key },
        ip: req.headers.get('x-forwarded-for') || null,
        user_agent: req.headers.get('user-agent') || null,
      },
    }).catch(() => {})

    return NextResponse.json({ data: null, message: '已删除' })
  } catch (err) {
    console.error('[asset delete] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { visibility } = body as { visibility?: AssetVisibility }

    if (!visibility || !['public', 'private'].includes(visibility)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'visibility 必须是 public 或 private' } },
        { status: 400 }
      )
    }

    const asset = await prisma.asset.findUnique({ where: { id } })
    if (!asset || asset.deleted_at) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '资产不存在' } },
        { status: 404 }
      )
    }
    if (asset.owner_id !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权修改此资产' } },
        { status: 403 }
      )
    }

    const updated = await prisma.asset.update({
      where: { id },
      data: { visibility },
      select: { id: true, visibility: true },
    })

    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'asset_visibility_changed',
        target_type: 'asset',
        target_id: id,
        detail_json: { from: asset.visibility, to: visibility },
      },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[asset patch] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '更新失败' } },
      { status: 500 }
    )
  }
}
