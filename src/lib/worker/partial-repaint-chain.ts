// partial_repaint 串行链式编排
//
// 核心流程（单区域）：
//   1) 调 /api/image-crop 同构逻辑裁出区域图片（直接复用 @napi-rs/canvas）
//   2) 调 buildPartialRepaintPrompt 构造 prompt + urls（最多 3 张）
//   3) 调 createImages(provider) 传 prompt + urls + size + n
//   4) 返回结果图 URL（临时），由调用方负责下载→上传 TOS→落库
//
// 多区域：for 循环串行，每轮把上一轮结果图 URL 作为新的"父图"，再裁对应区域，再调模型。
//
// 进度回调：onProgress(step, total, label)，worker 可把"区域 k/N 处理中"写进任务 detail_json。

import { buildPartialRepaintPrompt, type PartialRepaintRect } from '@/lib/partial-repaint'
import { createImages } from '@/lib/providers/openai-image-provider'
import { putObject, getSignedUrl } from '@/lib/tos/tos-client'
import type { ProviderImage } from '@/lib/types/provider'

export interface ChainRegion {
  id: string
  index: number
  rect: PartialRepaintRect
  instruction: string
  /** 第 3 张参考图 URL（可选，目标物体/替换物参考） */
  referenceImageUrl?: string
  /** 参考图对应的 asset tos_key（可选，用于审计） */
  referenceTosKey?: string
}

export interface ChainInput {
  /** 初始父图 URL（signed URL 或公网 URL） */
  parentImageUrl: string
  /** 父图 tos_key（用于重新签 signed url） */
  parentTosKey?: string
  /** 父图尺寸 */
  width: number
  height: number
  /** 串行处理区域（N=1 本次必通；N>1 串行框架已搭） */
  regions: ChainRegion[]
  /** 候选数（每轮），默认 1 */
  n?: number
  ownerId: string
  /** 审计/日志 */
  parentImageId?: string
  onProgress?: (step: number, total: number, label: string) => void
}

export interface ChainStepResult {
  regionId: string
  regionIndex: number
  image: ProviderImage
  /** 本轮结果图上传到 TOS 后的 key */
  tosKey: string
  /** 本轮结果的 signed URL（作为下一轮父图） */
  signedUrl: string
}

export interface ChainOutput {
  steps: ChainStepResult[]
  /** 最终父图（最后一轮结果）的 signed URL */
  finalParentUrl: string
  /** 最终父图 tos_key */
  finalTosKey: string
  width: number
  height: number
}

// ---- 内部：服务端裁剪（复用 image-crop 逻辑，避免 HTTP 自调） ----

async function cropRegion(
  imageUrl: string,
  rect: PartialRepaintRect,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const upstream = await fetch(imageUrl)
  if (!upstream.ok) throw new Error(`crop: fetch parent image failed: HTTP ${upstream.status}`)
  const sourceBuffer = Buffer.from(await upstream.arrayBuffer())

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Image, createCanvas } = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')
  const img = new Image()
  img.src = sourceBuffer
  const srcW = img.width
  const srcH = img.height
  if (!srcW || !srcH) throw new Error('crop: cannot read image dimensions')

  const px = Math.max(0, Math.floor(rect.x * srcW))
  const py = Math.max(0, Math.floor(rect.y * srcH))
  const pw = Math.max(1, Math.min(srcW - px, Math.round(rect.width * srcW)))
  const ph = Math.max(1, Math.min(srcH - py, Math.round(rect.height * srcH)))

  const canvas = createCanvas(pw, ph)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph)
  const buffer = (await canvas.encode('png')) as Buffer
  return { buffer, width: pw, height: ph }
}

async function uploadCropAsReference(
  buffer: Buffer,
  ownerId: string,
  regionIndex: number,
): Promise<{ tosKey: string; signedUrl: string }> {
  const date = new Date()
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const tosKey = `references/${ownerId}/${yyyymm}/${Date.now()}-crop-region${regionIndex}.png`
  await putObject(tosKey, buffer, 'image/png')
  const signedUrl = getSignedUrl(tosKey, 3600)
  return { tosKey, signedUrl }
}

async function downloadAsBuffer(img: ProviderImage): Promise<{ buffer: Buffer; mime: string }> {
  let buffer: Buffer
  let mime = 'image/png'
  if (img.base64) {
    buffer = Buffer.from(img.base64, 'base64')
  } else if (img.url) {
    const res = await fetch(img.url)
    if (!res.ok) throw new Error(`download result failed: HTTP ${res.status}`)
    buffer = Buffer.from(await res.arrayBuffer())
    if (/\.jpe?g(\?|$)/i.test(img.url)) mime = 'image/jpeg'
    else if (/\.webp(\?|$)/i.test(img.url)) mime = 'image/webp'
  } else {
    throw new Error('provider image has neither url nor base64')
  }
  return { buffer, mime }
}

async function uploadResult(
  buffer: Buffer,
  mime: string,
  ownerId: string,
  step: number,
): Promise<{ tosKey: string; signedUrl: string }> {
  const date = new Date()
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
  const tosKey = `partial-repaint/${ownerId}/${yyyymm}/${Date.now()}-step${step}.${ext}`
  await putObject(tosKey, buffer, mime)
  const signedUrl = getSignedUrl(tosKey, 3600)
  return { tosKey, signedUrl }
}

// ---- 主入口 ----

export async function runPartialRepaintChain(input: ChainInput): Promise<ChainOutput> {
  const total = input.regions.length
  if (total === 0) throw new Error('partial_repaint chain: regions 不能为空')

  // 每轮我们需要一张"可被 provider fetch 的父图 URL"。初始用 signed URL；
  // 每轮结束后把新结果图上传 TOS 并签新的 URL 供下一轮使用。
  let currentParentUrl = input.parentImageUrl
  let currentParentTosKey = input.parentTosKey
  const size = `${input.width}x${input.height}`
  const n = input.n ?? 1

  const steps: ChainStepResult[] = []

  for (let i = 0; i < total; i++) {
    const region = input.regions[i]
    input.onProgress?.(i + 1, total, `区域 ${region.index}/${total} 裁剪中`)

    // 1) 裁剪区域图
    const cropped = await cropRegion(currentParentUrl, region.rect)
    const cropUpload = await uploadCropAsReference(cropped.buffer, input.ownerId, region.index)

    input.onProgress?.(i + 1, total, `区域 ${region.index}/${total} 生成中`)

    // 2) 构造 prompt
    const { prompt, urls } = buildPartialRepaintPrompt({
      parentImageUrl: currentParentUrl,
      cropImageUrl: cropUpload.signedUrl,
      referenceImageUrl: region.referenceImageUrl,
      region: region.rect,
      instruction: region.instruction,
      size,
      parentImageId: input.parentImageId,
      cropName: `region-${region.index}`,
      referenceName: region.referenceImageUrl ? `ref-${region.index}` : undefined,
    })

    // 3) 调 provider
    const resp = await createImages({ prompt, urls, size, n })
    const first = resp.images[0]
    if (!first) throw new Error(`partial_repaint step ${i + 1}: provider returned no images`)

    // 4) 下载结果 → 上传 TOS
    input.onProgress?.(i + 1, total, `区域 ${region.index}/${total} 回传中`)
    const dl = await downloadAsBuffer(first)
    const up = await uploadResult(dl.buffer, dl.mime, input.ownerId, i + 1)

    steps.push({
      regionId: region.id,
      regionIndex: region.index,
      image: first,
      tosKey: up.tosKey,
      signedUrl: up.signedUrl,
    })

    // 把本轮结果作为下一轮父图
    currentParentUrl = up.signedUrl
    currentParentTosKey = up.tosKey
  }

  return {
    steps,
    finalParentUrl: currentParentUrl,
    finalTosKey: currentParentTosKey!,
    width: input.width,
    height: input.height,
  }
}
