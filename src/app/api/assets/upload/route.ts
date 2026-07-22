import { NextRequest, NextResponse } from 'next/server'
import { AssetType } from '@prisma/client'
import crypto from 'crypto'
import { imageSize } from 'image-size'
import { prisma } from '@/lib/db/prisma'
import { putObject, buildTosKey } from '@/lib/tos/tos-client'
import { verifyToken } from '@/lib/auth/jwt'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 20 * 1024 * 1024 // 20MB
const MIN_WIDTH = 200
const MIN_HEIGHT = 200

export async function POST(req: NextRequest) {
  try {
    // Auth
    const token = req.cookies.get('token')?.value
    if (!token) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '未登录' } },
        { status: 401 }
      )
    }
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Token 无效' } },
        { status: 401 }
      )
    }

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
    const tosKey = buildTosKey(payload.sub, file.name)

    // Upload to TOS
    await putObject(tosKey, buffer, file.type)

    // Write to database
    const asset = await prisma.asset.create({
      data: {
        type: type as AssetType,
        filename: file.name,
        mime_type: file.type,
        size_bytes: BigInt(buffer.length),
        width,
        height,
        checksum,
        visibility: 'private',
        tos_bucket: process.env.TOS_BUCKET || '',
        tos_key: tosKey,
        owner_id: payload.sub,
      },
    })

    return NextResponse.json(
      {
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
