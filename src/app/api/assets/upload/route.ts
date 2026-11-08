import { NextRequest, NextResponse } from 'next/server'
import { AssetType } from '@prisma/client'
import crypto from 'crypto'
import { imageSize } from 'image-size'
import { prisma } from '@/lib/db/prisma'
import { putObject, buildTosKey } from '@/lib/tos/tos-client'
import { requireAuth } from '@/lib/auth/api-auth'
import { deriveAssetDisplayName, resolveAssetDisplayName } from '@/lib/assets/display-name'
import { createAndUploadThumb } from '@/lib/assets/thumbnail'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 20 * 1024 * 1024 // 20MB
const MIN_WIDTH = 200
const MIN_HEIGHT = 200

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    // Parse multipart
    const formData = await req.formData()
    const file = formData.get('file')
    const type = (formData.get('type') as string) || 'product_image'

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '缺少文件' } },
        { status: 400 }
      )
    }

    // Validate type field
    const validTypes = ['product_image', 'reference_image', 'template_material']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: `type 必须是 ${validTypes.join(', ')}` } },
        { status: 400 }
      )
    }

    // Validate MIME type
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '仅支持 image/jpeg, image/png, image/webp' } },
        { status: 400 }
      )
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '文件大小不能超过 20MB' } },
        { status: 400 }
      )
    }

    // Read buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Validate dimensions
    const dimensions = imageSize(new Uint8Array(buffer))
    const width = dimensions.width
    const height = dimensions.height

    if (!width || !height || width < MIN_WIDTH || height < MIN_HEIGHT) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: `图片尺寸不能小于 ${MIN_WIDTH}x${MIN_HEIGHT}` } },
        { status: 400 }
      )
    }

    // Calculate checksum
    const checksum = `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`

    // Build TOS key
    const tosKey = buildTosKey(auth.userId, file.name)

    // Upload to TOS
    await putObject(tosKey, buffer, file.type)

    // B 方案：同步生成 400px 缩略图。失败不阻断主图入库，thumb_tos_key 留空时前端回退原图。
    let thumbTosKey: string | null = null
    try {
      thumbTosKey = await createAndUploadThumb(buffer, tosKey)
    } catch (thumbErr) {
      console.error('[upload] thumbnail generation failed:', thumbErr)
    }

    // Write to database
    const asset = await prisma.asset.create({
      data: {
        type: type as AssetType,
        filename: file.name,
        display_name: deriveAssetDisplayName(file.name),
        mime_type: file.type,
        size_bytes: BigInt(buffer.length),
        width,
        height,
        checksum,
        visibility: 'private',
        tos_bucket: process.env.TOS_BUCKET || '',
        tos_key: tosKey,
        thumb_tos_key: thumbTosKey,
        owner_id: auth.userId,
      },
      include: { owner: { select: { name: true, avatar_url: true } } },
    })

    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'asset_uploaded',
        target_type: 'asset',
        target_id: asset.id,
        detail_json: {
          filename: asset.filename,
          display_name: asset.display_name,
          type: asset.type,
          size_bytes: Number(asset.size_bytes),
          checksum: asset.checksum,
        },
        ip: req.headers.get('x-forwarded-for') || null,
        user_agent: req.headers.get('user-agent') || null,
      },
    }).catch(() => {})

    return NextResponse.json(
      {
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
          is_mine: true,
          tags: [],
          created_at: asset.created_at,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[upload] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '上传失败' } },
      { status: 500 }
    )
  }
}
