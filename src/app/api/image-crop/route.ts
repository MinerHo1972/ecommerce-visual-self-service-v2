// D7 §? — 服务端图片裁剪（规避浏览器 CORS）
//
// POST /api/image-crop
// Body:
//   imageUrl: string                        // 完整父图 URL（可以是 TOS signed URL 或任意公网 URL）
//   region: { x, y, width, height }         // 归一化 0-1 坐标（与前端 MultiRegionPicker 输出对齐）
//   sourceName?: string                     // 可选：用于命名裁片
// Response:
//   { image: { url, width, height, tos_key } }  // url 为 TOS 预签名 URL（1h），tos_key 可用于后续直接生成新签名
//
// 实现：服务端 fetch 图片 → @napi-rs/canvas 解码 → 按 region 像素裁剪 → PNG 编码 → 上传 TOS。

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/api-auth'
import { putObject, getSignedUrl } from '@/lib/tos/tos-client'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = await req.json().catch(() => ({}))
    const { imageUrl, region, sourceName } = body as {
      imageUrl?: string
      region?: { x: number; y: number; width: number; height: number }
      sourceName?: string
    }

    if (!imageUrl || !region) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'imageUrl 与 region 必填' } },
        { status: 400 },
      )
    }
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      if (typeof region[k] !== 'number' || Number.isNaN(region[k])) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: `region.${k} 必须是数字` } },
          { status: 400 },
        )
      }
    }

    // 1. 服务端下载原图（绕过浏览器 CORS）
    const upstream = await fetch(imageUrl)
    if (!upstream.ok) {
      return NextResponse.json(
        { error: { code: 'UPSTREAM_ERROR', message: `拉取原图失败: HTTP ${upstream.status}` } },
        { status: 502 },
      )
    }
    const sourceBuffer = Buffer.from(await upstream.arrayBuffer())

    // 2. @napi-rs/canvas 解码
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image, createCanvas } = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')
    const img = new Image()
    img.src = sourceBuffer
    const srcW = img.width
    const srcH = img.height
    if (!srcW || !srcH) {
      return NextResponse.json(
        { error: { code: 'IMAGE_ERROR', message: '无法读取图片尺寸' } },
        { status: 500 },
      )
    }

    // 3. 归一化 → 像素坐标
    const px = Math.max(0, Math.floor(region.x * srcW))
    const py = Math.max(0, Math.floor(region.y * srcH))
    const pw = Math.max(1, Math.min(srcW - px, Math.round(region.width * srcW)))
    const ph = Math.max(1, Math.min(srcH - py, Math.round(region.height * srcH)))

    // 4. 裁剪
    const canvas = createCanvas(pw, ph)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph)
    const croppedBuffer = (await canvas.encode('png')) as Buffer

    // 5. 上传 TOS
    const date = new Date()
    const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
    const safeName = (sourceName || 'repaint-crop').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64)
    const tosKey = `references/${auth.userId}/${yyyymm}/${Date.now()}-${safeName}.png`
    await putObject(tosKey, croppedBuffer, 'image/png')

    const signedUrl = getSignedUrl(tosKey, 3600)

    return NextResponse.json({
      data: {
        image: {
          url: signedUrl,
          tos_key: tosKey,
          width: pw,
          height: ph,
        },
      },
    })
  } catch (err) {
    console.error('[image-crop] error:', err)
    return NextResponse.json(
      { error: { code: 'CROP_ERROR', message: err instanceof Error ? err.message : '图片裁剪失败' } },
      { status: 500 },
    )
  }
}
