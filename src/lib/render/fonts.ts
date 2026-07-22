/**
 * Font registration for Canvas rendering (S5b §3)
 * Registers Noto Sans SC / Noto Sans CJK for Chinese text support.
 */
import { GlobalFonts } from '@napi-rs/canvas'
import { existsSync } from 'fs'
import { join } from 'path'
import type { FontRegisterResult } from '@/lib/types/template'

// Candidate font file paths, in priority order
const FONT_CANDIDATES = [
  // 1. Project-bundled fonts
  join(process.cwd(), 'assets/fonts/NotoSansSC-Regular.ttf'),
  join(process.cwd(), 'assets/fonts/NotoSansSC-Regular.otf'),
  join(process.cwd(), 'assets/fonts/NotoSansCJK-Regular.ttc'),
  // 2. ECS system fonts (installed via apt-get install fonts-noto-cjk)
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
]

const FONT_FAMILY = 'NotoSansSC'

let cachedResult: FontRegisterResult | null = null

/**
 * Ensure render fonts are registered.
 * Idempotent — registers on first call, returns cached result afterwards.
 */
export function ensureRenderFonts(): FontRegisterResult {
  if (cachedResult) return cachedResult

  // Check if font family already registered (e.g. by system)
  if (GlobalFonts.has(FONT_FAMILY)) {
    cachedResult = {
      ok: true,
      family: FONT_FAMILY,
      loadedFrom: 'pre-registered',
    }
    return cachedResult
  }

  // Try each candidate path
  for (const fontPath of FONT_CANDIDATES) {
    if (!existsSync(fontPath)) continue

    try {
      const success = GlobalFonts.registerFromPath(fontPath, FONT_FAMILY)
      if (success) {
        cachedResult = {
          ok: true,
          family: FONT_FAMILY,
          loadedFrom: fontPath,
        }
        return cachedResult
      }
    } catch {
      // try next candidate
    }
  }

  // Try system Noto Sans CJK family name directly
  if (GlobalFonts.has('Noto Sans CJK SC')) {
    cachedResult = {
      ok: true,
      family: 'Noto Sans CJK SC',
      loadedFrom: 'system',
    }
    return cachedResult
  }

  cachedResult = {
    ok: false,
    family: FONT_FAMILY,
    error: '未找到 Noto Sans SC / Noto Sans CJK 字体，请安装 fonts-noto-cjk 或放置字体文件到 assets/fonts/',
  }
  return cachedResult
}

/**
 * Get the effective font family for rendering.
 * Falls back to system Noto Sans CJK SC if our custom registration failed.
 */
export function getEffectiveFontFamily(): string {
  const result = ensureRenderFonts()
  if (result.ok) return result.family
  // Last resort fallback
  return 'sans-serif'
}
