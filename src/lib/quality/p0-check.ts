/**
 * P0 Quality Check Module — S9
 * Dimensions compliance + text overflow pre-check
 */
import { createCanvas } from '@napi-rs/canvas'
import { checkTextOverflow } from '@/lib/render/engine'
import { ensureRenderFonts } from '@/lib/render/fonts'
import type { LayerTemplateConfig, Layer, TextStyle, TextOverflow } from '@/lib/types/template'

// --- Types ---

export interface P0QualityCheckIssue {
  type: 'size_mismatch' | 'text_overflow' | 'render_warning' | 'font_unavailable' | 'missing_asset'
  severity: 'warning' | 'error'
  layerId?: string
  layerName?: string
  message: string
}

export interface P0QualityCheckResult {
  passed: boolean
  checked_at: string
  dimension: {
    passed: boolean
    expected: { width: number; height: number }
    actual: { width: number; height: number }
    message?: string
  }
  textOverflows: Array<{
    layerId: string
    layerName: string
    neededLines: number
    maxLines: number
    overflowPx: number
    message: string
  }>
  issues: P0QualityCheckIssue[]
}

export interface P0CheckInput {
  asset: { width: number; height: number }
  expectedSize: { width: number; height: number }
  layerConfigJson?: Record<string, unknown> | null
  variables?: Record<string, string> | null
}

// --- Helper Functions ---

function getTextOverflowFromLayer(
  layer: Layer,
  variables: Record<string, string>,
  ctx: any // SKRSContext2D
): TextOverflow | null {
  if (layer.type !== 'text' || !layer.style || !layer.slot) return null
  const text = variables[layer.slot.inputKey] || ''
  if (!text) return null
  const overflow = checkTextOverflow(text, layer.style, layer.width, layer.height, ctx)
  if (overflow) {
    return { ...overflow, layerId: layer.id, layerName: layer.name }
  }
  return null
}

// --- Main Function ---

export async function runP0QualityCheck(input: P0CheckInput): Promise<P0QualityCheckResult> {
  const checked_at = new Date().toISOString()
  const issues: P0QualityCheckIssue[] = []
  const textOverflows: Array<{
    layerId: string; layerName: string; neededLines: number; maxLines: number; overflowPx: number; message: string
  }> = []

  // 1. Dimension Check
  const { asset, expectedSize } = input
  const dimensionPassed = asset.width === expectedSize.width && asset.height === expectedSize.height
  const dimensionResult: P0QualityCheckResult['dimension'] = {
    passed: dimensionPassed,
    expected: expectedSize,
    actual: asset,
    message: dimensionPassed ? undefined : `图片尺寸 ${asset.width}x${asset.height} 与模板 ${expectedSize.width}x${expectedSize.height} 不一致`
  }

  if (!dimensionPassed) {
    issues.push({
      type: 'size_mismatch',
      severity: 'error',
      message: dimensionResult.message!
    })
  }

  // 2. Text Overflow Pre-check (if layerConfigJson and variables are provided)
  if (input.layerConfigJson && input.variables) {
    try {
      // Ensure fonts are registered first
      ensureRenderFonts()

      // Create a dummy canvas for text measurement
      const canvas = createCanvas(1, 1)
      const ctx = canvas.getContext('2d')

      const config = input.layerConfigJson as unknown as LayerTemplateConfig
      if (config.layers && Array.isArray(config.layers)) {
        for (const layer of config.layers) {
          const overflow = getTextOverflowFromLayer(layer, input.variables, ctx)
          if (overflow) {
            textOverflows.push({
              layerId: overflow.layerId,
              layerName: overflow.layerName,
              neededLines: overflow.neededLines,
              maxLines: overflow.maxLines,
              overflowPx: overflow.overflowPx,
              message: overflow.message
            })
            issues.push({
              type: 'text_overflow',
              severity: 'error',
              layerId: overflow.layerId,
              layerName: overflow.layerName,
              message: overflow.message
            })
          }
        }
      }
    } catch (err) {
      issues.push({
        type: 'render_warning',
        severity: 'warning',
        message: `文字越界预检失败: ${(err as Error).message}`
      })
    }
  }

  // Determine overall passed
  const hasErrorIssues = issues.some(i => i.severity === 'error')
  const passed = dimensionPassed && textOverflows.length === 0 && !hasErrorIssues

  return {
    passed,
    checked_at,
    dimension: dimensionResult,
    textOverflows,
    issues
  }
}
