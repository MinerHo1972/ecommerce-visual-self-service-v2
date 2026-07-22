/**
 * Render Engine — S5b product-grade
 * Supports: rotation, focusArea, opacity, contain/cover, quality checks, render_meta
 */
import {
  createCanvas,
  loadImage,
  type SKRSContext2D,
} from '@napi-rs/canvas'
import type {
  LayerTemplateConfig,
  Layer,
  TextStyle,
  QualityCheckResult,
  TextOverflow,
  QualityIssue,
  RenderResult,
  RenderMeta,
  FontRegisterResult,
} from '@/lib/types/template'
import { ensureRenderFonts, getEffectiveFontFamily } from './fonts'

// ─── Text utilities ───

function measureTextWidth(text: string, style: TextStyle, ctx: SKRSContext2D): number {
  ctx.font = buildFontString(style)
  const metrics = ctx.measureText(text)
  if (style.letterSpacing) {
    return metrics.width + style.letterSpacing * text.length
  }
  return metrics.width
}

function buildFontString(style: TextStyle): string {
  const weight = style.fontWeight || 'normal'
  return `${weight} ${style.fontSize}px "${style.fontFamily}"`
}

/**
 * Check if text overflows its slot (S5b §3.3)
 */
export function checkTextOverflow(
  text: string,
  style: TextStyle,
  slotWidth: number,
  slotHeight: number,
  ctx: SKRSContext2D
): TextOverflow | null {
  const textWidth = measureTextWidth(text, style, ctx)
  const lineHeight = (style.lineHeight || 1.2) * style.fontSize
  const lines = wrapText(ctx, text, slotWidth, style)
  const neededLines = lines.length
  const maxLines = Math.floor(slotHeight / lineHeight)

  const overflowPx = Math.max(0, Math.ceil(textWidth - slotWidth * maxLines))

  if (neededLines <= maxLines) {
    return null // No overflow
  }

  const overflowLines = neededLines - maxLines

  return {
    type: 'text_overflow',
    layerId: '', // filled by caller
    layerName: '', // filled by caller
    actualWidth: Math.ceil(textWidth),
    slotWidth: Math.round(slotWidth),
    neededLines,
    maxLines,
    overflowPx,
    message: `文字需要 ${neededLines} 行，区域仅能容纳 ${maxLines} 行（超出 ${overflowLines} 行），单行宽度 ${Math.ceil(textWidth)}px > 区域宽度 ${Math.round(slotWidth)}px`,
  }
}

/**
 * Wrap text into lines that fit within maxWidth.
 * Handles CJK + latin mixed text (S5b §4.4).
 */
function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  style: TextStyle
): string[] {
  ctx.font = buildFontString(style)
  const letterSpacing = style.letterSpacing || 0
  const lines: string[] = []
  let currentLine = ''

  for (const char of text) {
    const testLine = currentLine + char
    const testWidth = ctx.measureText(testLine).width + letterSpacing * testLine.length

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = char
    } else {
      currentLine = testLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * Draw text into a layer slot with wrapping and alignment.
 */
function drawText(
  ctx: SKRSContext2D,
  text: string,
  style: TextStyle,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.save()

  const effectiveStyle = { ...style }
  if (!effectiveStyle.fontFamily || effectiveStyle.fontFamily === 'NotoSansSC') {
    const fontCheck = ensureRenderFonts()
    if (fontCheck.ok) {
      effectiveStyle.fontFamily = fontCheck.family
    } else {
      effectiveStyle.fontFamily = getEffectiveFontFamily()
    }
  }

  const lineHeight = (effectiveStyle.lineHeight || 1.2) * effectiveStyle.fontSize
  ctx.font = buildFontString(effectiveStyle)
  ctx.fillStyle = effectiveStyle.color
  ctx.textBaseline = 'top'

  const lines = wrapText(ctx, text, width, effectiveStyle)
  const maxLines = Math.floor(height / lineHeight)
  const visibleLines = lines.slice(0, maxLines)

  // Vertical alignment: center
  const totalHeight = visibleLines.length * lineHeight
  const startY = y + (height - totalHeight) / 2

  for (let i = 0; i < visibleLines.length; i++) {
    const lineY = startY + i * lineHeight
    let lineX = x

    if (effectiveStyle.align === 'center') {
      const lineWidth = measureTextWidth(visibleLines[i], effectiveStyle, ctx)
      lineX = x + (width - lineWidth) / 2
    } else if (effectiveStyle.align === 'right') {
      const lineWidth = measureTextWidth(visibleLines[i], effectiveStyle, ctx)
      lineX = x + width - lineWidth
    }

    if (effectiveStyle.letterSpacing) {
      drawTextWithSpacing(ctx, visibleLines[i], lineX, lineY, effectiveStyle.letterSpacing, effectiveStyle)
    } else {
      ctx.fillText(visibleLines[i], lineX, lineY)
    }
  }

  ctx.restore()
}

function drawTextWithSpacing(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  style: TextStyle
) {
  ctx.font = buildFontString(style)
  let cursorX = x
  for (const char of text) {
    ctx.fillText(char, cursorX, y)
    cursorX += ctx.measureText(char).width + spacing
  }
}

// ─── Image fitting (S5b §4.3) ───

interface FitParams {
  x: number
  y: number
  width: number
  height: number
  fitMode?: 'contain' | 'cover'
  focusArea?: { x: number; y: number; w: number; h: number }
}

async function drawImageInSlot(
  ctx: SKRSContext2D,
  imageBuffer: Buffer,
  params: FitParams
) {
  const { x, y, width: slotWidth, height: slotHeight, fitMode = 'contain', focusArea } = params
  const img = await loadImage(imageBuffer)
  const imgRatio = img.width / img.height
  const slotRatio = slotWidth / slotHeight

  let drawWidth: number
  let drawHeight: number
  let drawX: number
  let drawY: number

  if (fitMode === 'contain') {
    if (imgRatio > slotRatio) {
      drawWidth = slotWidth
      drawHeight = slotWidth / imgRatio
    } else {
      drawHeight = slotHeight
      drawWidth = slotHeight * imgRatio
    }
    drawX = x + (slotWidth - drawWidth) / 2
    drawY = y + (slotHeight - drawHeight) / 2
  } else {
    // cover
    if (imgRatio > slotRatio) {
      drawHeight = slotHeight
      drawWidth = slotHeight * imgRatio
    } else {
      drawWidth = slotWidth
      drawHeight = slotWidth / imgRatio
    }

    if (focusArea) {
      // focusArea is normalized 0-1 on the *source* image
      // We want the focus center to map to the slot center
      const focusCenterX = focusArea.x + focusArea.w / 2 // 0-1
      const focusCenterY = focusArea.y + focusArea.h / 2

      // Map focus center from source space to draw space
      // Source center should map to slot center
      const sourceCenterDrawX = x + slotWidth / 2
      const sourceCenterDrawY = y + slotHeight / 2

      // The full image is drawn at (0,0) to (drawWidth, drawHeight) relative to (drawX, drawY)
      // Focus center in draw space:
      drawX = sourceCenterDrawX - focusCenterX * drawWidth
      drawY = sourceCenterDrawY - focusCenterY * drawHeight
    } else {
      drawX = x - (drawWidth - slotWidth) / 2
      drawY = y - (drawHeight - slotHeight) / 2
    }
  }

  // Clip to slot area
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, slotWidth, slotHeight)
  ctx.clip()
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
  ctx.restore()
}

// ─── Main render function ───

export async function renderTemplate(
  config: LayerTemplateConfig,
  variables: Record<string, string>,
  productImageBuffer: Buffer | null,
  options?: {
    templateId?: string
    templateSource?: 'db' | 'config_json'
    assets?: Record<string, Buffer>
  }
): Promise<RenderResult> {
  const startTime = Date.now()
  const { canvas: canvasConfig, layers } = config

  // Ensure fonts registered
  const fontResult = ensureRenderFonts()

  const canvas = createCanvas(canvasConfig.width, canvasConfig.height)
  const ctx = canvas.getContext('2d')

  // Fill background
  ctx.fillStyle = canvasConfig.background || '#FFFFFF'
  ctx.fillRect(0, 0, canvasConfig.width, canvasConfig.height)

  // Sort layers by zIndex (stable sort)
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex)

  const overflows: TextOverflow[] = []
  const issues: QualityIssue[] = []

  for (const layer of sortedLayers) {
    // Layer out of canvas detection
    if (
      layer.x + layer.width < 0 ||
      layer.y + layer.height < 0 ||
      layer.x > canvasConfig.width ||
      layer.y > canvasConfig.height
    ) {
      issues.push({
        type: 'layer_out_of_canvas',
        layerId: layer.id,
        layerName: layer.name,
        severity: 'warning',
        message: `图层 "${layer.name}" 完全在画布范围外`,
      })
    }

    // Set opacity
    const originalAlpha = ctx.globalAlpha
    if (layer.opacity !== undefined && layer.opacity < 1) {
      ctx.globalAlpha = layer.opacity
    } else {
      ctx.globalAlpha = 1
    }

    // Apply rotation via transform (S5b §4.5)
    const hasRotation = layer.rotation !== undefined && layer.rotation !== 0
    if (hasRotation) {
      const cx = layer.x + layer.width / 2
      const cy = layer.y + layer.height / 2
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(((layer.rotation as number) * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }

    try {
      switch (layer.type) {
        case 'background': {
          if (layer.fill) {
            ctx.fillStyle = layer.fill
            ctx.fillRect(layer.x, layer.y, layer.width, layer.height)
          }
          break
        }

        case 'product': {
          if (layer.type === 'product') {
            if (!productImageBuffer) {
              issues.push({
                type: 'missing_asset',
                layerId: layer.id,
                layerName: layer.name,
                severity: 'warning',
                message: `商品图层 "${layer.name}" 没有可用的商品图`,
              })
            } else {
              await drawImageInSlot(ctx, productImageBuffer, {
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height,
                fitMode: layer.fitMode || 'contain',
                focusArea: layer.focusArea,
              })
            }
          }
          break
        }

        case 'logo':
        case 'decoration': {
          // Try to get asset buffer from assets map
          if (layer.slot && options?.assets) {
            const assetKey = variables[layer.slot.inputKey]
            if (assetKey && options.assets[assetKey]) {
              await drawImageInSlot(ctx, options.assets[assetKey], {
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height,
                fitMode: layer.fitMode || 'contain',
                focusArea: layer.focusArea,
              })
            } else {
              // No image buffer available — draw fill if specified, otherwise note
              if (layer.fill) {
                ctx.fillStyle = layer.fill
                ctx.fillRect(layer.x, layer.y, layer.width, layer.height)
              }
              if (layer.slot?.required) {
                issues.push({
                  type: 'missing_asset',
                  layerId: layer.id,
                  layerName: layer.name,
                  severity: 'warning',
                  message: `图层 "${layer.name}" 需要 asset "${layer.slot.inputKey}" 但未提供`,
                })
              }
            }
          } else if (layer.fill) {
            // Decoration with fill (e.g. colored rectangle)
            ctx.fillStyle = layer.fill
            ctx.fillRect(layer.x, layer.y, layer.width, layer.height)
          }
          break
        }

        case 'text': {
          if (layer.slot && layer.style) {
            const effectiveStyle: TextStyle = {
              ...layer.style,
              fontFamily: layer.style.fontFamily || getEffectiveFontFamily(),
            }

            const text = variables[layer.slot.inputKey] || ''

            if (text) {
              drawText(
                ctx,
                text,
                effectiveStyle,
                layer.x,
                layer.y,
                layer.width,
                layer.height
              )

              // Check overflow
              const overflow = checkTextOverflow(
                text,
                effectiveStyle,
                layer.width,
                layer.height,
                ctx
              )
              if (overflow) {
                overflow.layerId = layer.id
                overflow.layerName = layer.name
                overflows.push(overflow)
              }
            }
          } else if (!layer.slot && layer.style) {
            issues.push({
              type: 'render_warning',
              layerId: layer.id,
              layerName: layer.name,
              severity: 'warning',
              message: `文字图层 "${layer.name}" 没有 slot，无法获取文本内容`,
            })
          }
          break
        }

        default: {
          issues.push({
            type: 'unsupported_layer',
            layerId: layer.id,
            layerName: layer.name,
            severity: 'warning',
            message: `不支持的图层类型: ${layer.type}`,
          })
        }
      }
    } catch (err) {
      issues.push({
        type: 'render_warning',
        layerId: layer.id,
        layerName: layer.name,
        severity: 'error',
        message: `图层 "${layer.name}" 渲染失败: ${(err as Error).message}`,
      })
    }

    // Restore rotation transform
    if (hasRotation) {
      ctx.restore()
    }

    // Restore opacity
    ctx.globalAlpha = originalAlpha
  }

  const imageBuffer = canvas.toBuffer('image/png')

  // Determine passed status
  const hasErrors = issues.some(i => i.severity === 'error')
  const passed = overflows.length === 0 && !hasErrors

  const qualityCheck: QualityCheckResult = {
    passed,
    overflows,
    issues,
  }

  // Check font availability
  if (!fontResult.ok) {
    qualityCheck.issues.push({
      type: 'font_unavailable',
      severity: 'error',
      message: fontResult.error || '字体注册失败',
    })
    qualityCheck.passed = false
  }

  const durationMs = Date.now() - startTime

  const renderMeta: RenderMeta = {
    template_id: options?.templateId,
    template_source: options?.templateSource || 'config_json',
    duration_ms: durationMs,
    output_bytes: imageBuffer.length,
    canvas: { width: canvasConfig.width, height: canvasConfig.height },
    font: {
      ok: fontResult.ok,
      family: fontResult.family,
      loadedFrom: fontResult.loadedFrom,
      error: fontResult.error,
    },
  }

  return { imageBuffer, qualityCheck, renderMeta }
}
