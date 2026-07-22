// Seedream 多 bbox 一次调用编排（P1 主链路）
//
// 对应 V1 partial_repaint_chain.ts 的多区域串行版本；本文件实现"一次调用出全图"。
// 失败时由调用方（generation-worker）判断是否降级到串行链。

import { SeedreamProvider, normBbox01To999, type SeedreamRegion } from '@/lib/providers/seedream-provider'
import type { ProviderImage } from '@/lib/types/provider'

export interface SeedreamMultiRegionInput {
  parentImageUrl: string
  width: number
  height: number
  /** 前端传入的 regions：坐标是 0-1 归一化，worker 内部转 0-999 */
  regions: Array<{
    id: string
    index: number
    /** 0-1 坐标，兼容旧 rect 字段：{x,y,width,height} */
    rect: { x: number; y: number; width: number; height: number }
    /** 或新版 bbox_norm：{x1,y1,x2,y2} 0-999 */
    bbox_norm?: { x1: number; y1: number; x2: number; y2: number }
    instruction: string
    referenceImageUrl?: string
  }>
  /** 候选数（1~4） */
  n?: number
  /** "1K" / "2K" / "WxH"，未传则根据宽高自动判断 */
  size?: string
  onProgress?: (phase: 'preparing' | 'generating' | 'uploading', pct: number, label: string) => void
}

export interface SeedreamMultiRegionOutput {
  images: ProviderImage[]
  backend: 'seedream'
  size: string
  width: number
  height: number
}

function resolveSize(input: SeedreamMultiRegionInput): string {
  if (input.size) return input.size
  const maxDim = Math.max(input.width, input.height)
  if (maxDim >= 1536) return '2K'
  return '1K'
}

function toSeedreamRegions(input: SeedreamMultiRegionInput): SeedreamRegion[] {
  return input.regions
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((r) => {
      let bbox: { x1: number; y1: number; x2: number; y2: number }
      if (r.bbox_norm && r.bbox_norm.x1 >= 0 && r.bbox_norm.x2 > r.bbox_norm.x1) {
        // 已经是 0-999
        const clamp = (v: number) => Math.max(0, Math.min(999, Math.round(v)))
        bbox = {
          x1: clamp(r.bbox_norm.x1),
          y1: clamp(r.bbox_norm.y1),
          x2: clamp(r.bbox_norm.x2),
          y2: clamp(r.bbox_norm.y2),
        }
      } else {
        bbox = normBbox01To999(r.rect)
      }
      return {
        instruction: r.instruction,
        bbox,
        referenceImageUrl: r.referenceImageUrl,
      }
    })
}

export async function runSeedreamMultiRegion(
  provider: SeedreamProvider,
  input: SeedreamMultiRegionInput,
): Promise<SeedreamMultiRegionOutput> {
  if (input.regions.length === 0) throw new Error('seedream multiRegion: regions 不能为空')

  const size = resolveSize(input)
  const n = Math.max(1, Math.min(input.n ?? 2, 4))

  input.onProgress?.('preparing', 10, '准备图片与 prompt')
  const seedreamRegions = toSeedreamRegions(input)

  input.onProgress?.('generating', 30, 'Seedream 多区域一次性生成中（预计 20-30 秒）')

  const result = await provider.multiRegionEdit({
    parentImageUrl: input.parentImageUrl,
    regions: seedreamRegions,
    size,
    n,
  })

  input.onProgress?.('uploading', 90, '回传与上传中')

  return {
    images: result.images,
    backend: 'seedream',
    size,
    width: input.width,
    height: input.height,
  }
}
