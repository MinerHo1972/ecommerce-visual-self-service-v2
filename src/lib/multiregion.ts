// P1 多区域编辑：prompt 拼接与常量（前端辅助；服务端 seedream-provider 有独立构造器）
import type { RegionItem } from "@/components/MultiRegionPicker"
import type { RegionInstruction } from "@/components/RegionInstructionList"

// 重新导出，operator page 之前 import 这里
export type { RegionInstruction }

export interface MultiRegionPayload {
  id: string
  index: number
  instruction: string
  bbox_norm: { x1: number; y1: number; x2: number; y2: number }
  referenceAssetId?: string
}

/** 把 0-1 rect 归一为 0-999 bbox */
export function rectToBboxNorm(r: RegionItem["rect"]): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = Math.max(0, Math.min(999, Math.round(r.x * 999)))
  const y1 = Math.max(0, Math.min(999, Math.round(r.y * 999)))
  const x2 = Math.max(x1 + 1, Math.min(999, Math.round((r.x + r.width) * 999)))
  const y2 = Math.max(y1 + 1, Math.min(999, Math.round((r.y + r.height) * 999)))
  return { x1, y1, x2, y2 }
}

export function buildMultiRegionSubmitPayload(instructions: RegionInstruction[]): MultiRegionPayload[] {
  return instructions
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((r) => ({
      id: r.id,
      index: r.index,
      instruction: r.instruction.trim(),
      bbox_norm: r.bbox_norm ?? rectToBboxNorm(r.rect),
      referenceAssetId: r.referenceAssetId,
    }))
}

export function buildMultiRegionPrompt(regions: RegionInstruction[]): string {
  if (regions.length === 0) return ""
  const lines: string[] = ["请基于原图进行以下多区域编辑："]
  for (const r of regions) {
    const bbox = r.bbox_norm ?? rectToBboxNorm(r.rect)
    const instr = r.instruction.trim() || "（未填指令）"
    let suffix = ""
    if (r.referenceAssetId) suffix = "（使用参考图）"
    lines.push(`[区域${r.index} bbox=${bbox.x1},${bbox.y1},${bbox.x2},${bbox.y2}] ${instr}${suffix}`)
  }
  return lines.join("\n")
}
