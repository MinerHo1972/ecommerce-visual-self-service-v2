import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'
import { canReadAsset, canWriteAsset } from '@/lib/assets/access'
import { resolveAssetDisplayName, validateAssetDisplayName } from '@/lib/assets/display-name'
import { AssetVisibility, Prisma } from '@prisma/client'

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

    if (!canReadAsset(auth, asset)) {
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
        display_name: resolveAssetDisplayName(asset.display_name, asset.filename),
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '请求体必须是对象' } },
        { status: 400 }
      )
    }
    const input = body as Record<string, unknown>
    const supportedFields = ['visibility', 'display_name']
    const unknownFields = Object.keys(input).filter((key) => !supportedFields.includes(key))
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: `不支持字段：${unknownFields.join(', ')}` } },
        { status: 400 }
      )
    }
    if (!Object.prototype.hasOwnProperty.call(input, 'visibility') && !Object.prototype.hasOwnProperty.call(input, 'display_name')) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '至少提供 visibility 或 display_name' } },
        { status: 400 }
      )
    }

    let visibility: AssetVisibility | undefined
    if (Object.prototype.hasOwnProperty.call(input, 'visibility')) {
      if (typeof input.visibility !== 'string' || !['public', 'private'].includes(input.visibility)) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'visibility 必须是 public 或 private' } },
          { status: 400 }
        )
      }
      visibility = input.visibility as AssetVisibility
    }

    let displayName: string | undefined
    if (Object.prototype.hasOwnProperty.call(input, 'display_name')) {
      const validation = validateAssetDisplayName(input.display_name)
      if (!validation.ok) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: validation.message } },
          { status: 400 }
        )
      }
      displayName = validation.value
    }

    const asset = await prisma.asset.findUnique({ where: { id } })
    if (!asset || asset.deleted_at) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '资产不存在' } },
        { status: 404 }
      )
    }
    if (!canWriteAsset(auth, asset)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: '无权修改此资产' } },
        { status: 403 }
      )
    }

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        ...(visibility !== undefined ? { visibility } : {}),
        ...(displayName !== undefined ? { display_name: displayName } : {}),
      },
      select: { id: true, visibility: true, filename: true, display_name: true },
    })

    const auditEntries: Prisma.AuditLogCreateManyInput[] = []
    if (visibility !== undefined && visibility !== asset.visibility) {
      auditEntries.push({
        actor_user_id: auth.userId,
        action: 'asset_visibility_changed',
        target_type: 'asset',
        target_id: id,
        detail_json: { from: asset.visibility, to: visibility },
      })
    }
    const oldDisplayName = resolveAssetDisplayName(asset.display_name, asset.filename)
    if (displayName !== undefined && displayName !== oldDisplayName) {
      auditEntries.push({
        actor_user_id: auth.userId,
        action: 'asset_display_name_changed',
        target_type: 'asset',
        target_id: id,
        detail_json: { from: oldDisplayName, to: displayName, filename: asset.filename },
      })
    }
    if (auditEntries.length > 0) {
      await prisma.auditLog.createMany({ data: auditEntries }).catch(() => {})
    }

    return NextResponse.json({
      data: {
        ...updated,
        display_name: resolveAssetDisplayName(updated.display_name, updated.filename),
      },
    })
  } catch (err) {
    console.error('[asset patch] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '更新失败' } },
      { status: 500 }
    )
  }
}
