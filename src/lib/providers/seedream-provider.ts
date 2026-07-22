// Seedream 5.0 Pro (火山方舟 Ark) Provider
//
// 环境变量:
//   GENERATION_PROVIDER       = "seedream"
//   SEEDREAM_ENDPOINT         = https://ark.cn-beijing.volces.com/api/v3
//   SEEDREAM_API_KEY          = ark-...
//   SEEDREAM_MODEL            = doubao-seedream-5-0-pro-260628
//   SEEDREAM_MAX_COUNT        = 4   (一次最多候选数)
//
// 核心能力:
//   - multiRegionEdit: 原生多 bbox 一次调用（P1 主链路），N 个区域 23 秒内返回
//   - generate/edit/createImages: 复用 OpenAI 兼容协议（ARK 兼容 /images/generations）
//
// 重要约束（来自对照实测）:
//   - bbox 坐标归一化到 0~999
//   - prompt 用 <bbox>x1 y1 x2 y2</bbox> 标记位置，编号图1/图2/...
//   - image 数组传 base64 data url（ARK 可能访问不到我们的 TOS 签名 URL）
//   - 同步返回，无需轮询

import type {
  GenerationProvider,
  GenerateParams,
  EditParams,
  GenerateResult,
  CancelResult,
  ProviderImage,
  ProviderError,
  TaskStatusResult,
} from '@/lib/types/provider'

// ---- 配置读取 ----

function readConfig() {
  const endpoint = (process.env.SEEDREAM_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')
  const apiKey = process.env.SEEDREAM_API_KEY || ''
  const model = process.env.SEEDREAM_MODEL || 'doubao-seedream-5-0-pro-260628'
  const maxCount = Math.max(1, parseInt(process.env.SEEDREAM_MAX_COUNT || '4', 10) || 4)
  return { endpoint, apiKey, model, maxCount }
}

// ---- 公共类型 ----

export interface SeedreamBbox {
  /** 归一化 0~999 坐标 */
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface SeedreamRegion {
  instruction: string
  bbox: SeedreamBbox
  /** 可选参考图 URL（公网/TOS signed），会随 parent 一起转 base64 作为 image[1..N] */
  referenceImageUrl?: string
}

export interface MultiRegionEditParams {
  /** 父图（底图）URL，会下载转 base64 作为 image[0] */
  parentImageUrl: string
  /** 多区域（按数组顺序编号 1..N） */
  regions: SeedreamRegion[]
  /** 输出尺寸："1K" / "2K" / "WxH" */
  size?: string
  /** 候选数，1~maxCount */
  n?: number
}

// ---- 工具方法 ----

function toProviderError(err: unknown, retryable = false): ProviderError {
  const msg = err instanceof Error ? err.message : String(err)
  const rateLimit = /rate.?limit|429|too many|quota/i.test(msg)
  const timeout = /timeout|timed? out|ECONNRESET|ETIMEDOUT|abort/i.test(msg)
  return {
    code: rateLimit ? 'rate_limit' : timeout ? 'timeout' : 'provider_error',
    message: msg,
    retryable: retryable || rateLimit || timeout,
  }
}

/** 下载 URL 并转 base64 data url；直接支持 data: 开头的 URL 透传 */
export async function downloadToDataUrl(url: string): Promise<string> {
  if (!url) throw new Error('downloadToDataUrl: empty url')
  if (url.startsWith('data:')) return url
  const res = await fetch(url)
  if (!res.ok) throw new Error(`downloadToDataUrl: HTTP ${res.status} for ${url.slice(0, 120)}`)
  const ab = await res.arrayBuffer()
  const ctype = res.headers.get('content-type')?.split(';')[0]?.trim() || guessMimeFromUrl(url)
  const b64 = Buffer.from(ab).toString('base64')
  return `data:${ctype};base64,${b64}`
}

function guessMimeFromUrl(url: string): string {
  if (/\.jpe?g(\?|$)/i.test(url)) return 'image/jpeg'
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp'
  if (/\.gif(\?|$)/i.test(url)) return 'image/gif'
  return 'image/png'
}

/** 把 0-1 归一化 bbox 转成 0-999 整数（Seedream 约定） */
export function normBbox01To999(rect: { x: number; y: number; width: number; height: number }): SeedreamBbox {
  const clamp = (v: number) => Math.max(0, Math.min(999, Math.round(v * 999)))
  const x1 = clamp(rect.x)
  const y1 = clamp(rect.y)
  const x2 = clamp(rect.x + rect.width)
  const y2 = clamp(rect.y + rect.height)
  return { x1, y1: y1, x2: Math.max(x1 + 1, x2), y2: Math.max(y1 + 1, y2) }
}

/** 构造多 bbox prompt（参考对照实测脚本 prompt 写法） */
export function buildMultiRegionPrompt(regions: SeedreamRegion[]): string {
  const n = regions.length
  if (n === 0) return ''

  const header = n === 1
    ? '请对图1按以下指令精确修改，bbox 以外的所有区域必须完全保持原样，不得改动、移动或重绘：'
    : `图片中有 ${n} 个 bbox 区域，分别按编号修改。bbox 以外的所有区域必须完全保持原样，不得改动、移动或重绘：`

  const lines: string[] = [header, '']
  for (let i = 0; i < n; i++) {
    const r = regions[i]
    const { x1, y1, x2, y2 } = r.bbox
    lines.push(`${i + 1}. 图${i + 1 === 1 ? '1' : '1'} <bbox>${x1} ${y1} ${x2} ${y2}</bbox> ${r.instruction.trim()}`)
  }
  lines.push('')
  lines.push('最终输出不得显示任何 bbox 框线、编号或辅助标记，不得重绘整张图；只修改上述 bbox 内的内容。')
  return lines.join('\n')
}

/** size 归一：接受 "1K" / "2K" / "1024x1024" / "2048x2048"，输出 ARK 接受的 size 字符串 */
function normalizeSize(size: string | undefined): string {
  if (!size) return '1K'
  const s = size.trim()
  if (/^(1K|2K)$/i.test(s)) return s.toUpperCase()
  if (/^\d+x\d+$/i.test(s)) {
    const [w, h] = s.split(/x/i).map((n) => parseInt(n, 10))
    // ARK 推荐用 1K/2K 关键字；若尺寸接近 2048 则用 2K
    if (w >= 1536 || h >= 1536) return '2K'
    return '1K'
  }
  return '1K'
}

function parseSizeDims(size: string | undefined, fallback = 1024): { w: number; h: number } {
  if (size && /^\d+x\d+$/i.test(size)) {
    const [w, h] = size.split(/x/i).map((n) => parseInt(n, 10))
    return { w, h }
  }
  if (/^2K$/i.test(size || '')) return { w: 2048, h: 2048 }
  return { w: fallback, h: fallback }
}

// ---- 核心：多 bbox 一次调用 ----

async function callSeedreamGenerations(body: Record<string, unknown>): Promise<Array<{ url?: string; b64_json?: string }>> {
  const cfg = readConfig()
  if (!cfg.apiKey) throw new Error('SEEDREAM_API_KEY not configured')
  const url = `${cfg.endpoint}/images/generations`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180_000) // 3 分钟超时（实测 ~23s）
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`seedream HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }>; error?: { message?: string } }
  if (json.error) throw new Error(`seedream error: ${json.error.message || JSON.stringify(json.error)}`)
  return json.data || []
}

/** 对外暴露的主链路方法 */
export async function multiRegionEdit(params: MultiRegionEditParams): Promise<{ images: ProviderImage[] }> {
  const cfg = readConfig()
  if (params.regions.length === 0) throw new Error('seedream multiRegionEdit: regions 不能为空')

  const size = normalizeSize(params.size)
  const n = Math.max(1, Math.min(params.n ?? 1, cfg.maxCount))

  // 1) 下载父图 → base64
  const parentDataUrl = await downloadToDataUrl(params.parentImageUrl)

  // 2) 参考图去重 + 下载 → base64（按出现顺序追加）
  const seen = new Set<string>([params.parentImageUrl])
  const refDataUrls: string[] = []
  for (const r of params.regions) {
    if (r.referenceImageUrl && !seen.has(r.referenceImageUrl)) {
      seen.add(r.referenceImageUrl)
      // eslint-disable-next-line no-await-in-loop
      refDataUrls.push(await downloadToDataUrl(r.referenceImageUrl))
    }
  }

  const imageArray: string[] = [parentDataUrl, ...refDataUrls]

  // 3) 构造 prompt
  const prompt = buildMultiRegionPrompt(params.regions)

  // 4) POST
  const raw = await callSeedreamGenerations({
    model: cfg.model,
    prompt,
    size,
    n,
    response_format: 'url',
    output_format: 'png',
    watermark: false,
    image: imageArray,
  })

  const dims = parseSizeDims(size)
  const images: ProviderImage[] = []
  for (const r of raw) {
    if (r.url) images.push({ url: r.url, width: dims.w, height: dims.h })
    else if (r.b64_json) images.push({ url: `data:image/png;base64,${r.b64_json}`, width: dims.w, height: dims.h })
  }
  if (images.length === 0) throw new Error('seedream multiRegionEdit: 返回空结果')
  return { images }
}

// ---- generate/edit：走标准 OpenAI 兼容协议（仅透传文字 + 可选单图参考） ----

async function callSeedreamOpenAICompat(
  prompt: string,
  referenceUrl: string | undefined,
  size: string,
  n: number,
): Promise<{ images: ProviderImage[] }> {
  const cfg = readConfig()
  const dims = parseSizeDims(size)
  const imageArray: string[] = []
  if (referenceUrl) imageArray.push(await downloadToDataUrl(referenceUrl))
  const raw = await callSeedreamGenerations({
    model: cfg.model,
    prompt,
    size: normalizeSize(size),
    n,
    response_format: 'url',
    output_format: 'png',
    watermark: false,
    ...(imageArray.length > 0 ? { image: imageArray } : {}),
  })
  const images: ProviderImage[] = []
  for (const r of raw) {
    if (r.url) images.push({ url: r.url, width: dims.w, height: dims.h })
    else if (r.b64_json) images.push({ url: `data:image/png;base64,${r.b64_json}`, width: dims.w, height: dims.h })
  }
  return { images }
}

// ---- Provider 实现 ----

export class SeedreamProvider implements GenerationProvider {
  name = 'seedream'

  async generate(params: GenerateParams): Promise<GenerateResult> {
    try {
      const width = params.params.width ?? 1024
      const height = params.params.height ?? 1024
      const size = `${width}x${height}`
      const n = Math.max(1, Math.min(params.params.count ?? 4, readConfig().maxCount))
      const promptText = params.promptSnapshot.promptText || '电商商品主图'
      const vars = params.promptSnapshot.variables || {}
      const varLines = Object.keys(vars).length > 0
        ? '\n变量:\n' + Object.entries(vars).map(([k, v]) => `- ${k}: ${v}`).join('\n')
        : ''
      const prompt = `${promptText}${varLines}`.trim()
      const ref = params.productImageUrl || undefined
      const { images } = await callSeedreamOpenAICompat(prompt, ref, size, n)
      if (images.length === 0) return { success: false, error: { code: 'provider_error', message: 'seedream 返回空结果', retryable: true } }
      return { success: true, images }
    } catch (err) {
      return { success: false, error: toProviderError(err, true) }
    }
  }

  async edit(params: EditParams): Promise<GenerateResult> {
    try {
      const width = params.params.width ?? 1024
      const height = params.params.height ?? 1024
      const size = `${width}x${height}`
      const n = Math.max(1, Math.min(params.params.count ?? 1, readConfig().maxCount))
      const prompt = params.editInstructionText || '请对图进行编辑优化'
      const ref = params.sourceImageUrl || undefined
      const { images } = await callSeedreamOpenAICompat(prompt, ref, size, n)
      if (images.length === 0) return { success: false, error: { code: 'provider_error', message: 'seedream edit 返回空结果', retryable: true } }
      return { success: true, images }
    } catch (err) {
      return { success: false, error: toProviderError(err, true) }
    }
  }

  async cancel(_providerTaskId: string): Promise<CancelResult> {
    // Seedream 同步返回，无取消语义
    return { success: true, supported: false }
  }

  async getTaskStatus(_providerTaskId: string): Promise<TaskStatusResult> {
    return { status: 'succeeded' }
  }

  // ---- 专有能力（worker 通过类型断言调用） ----
  async multiRegionEdit(params: MultiRegionEditParams): Promise<{ images: ProviderImage[] }> {
    return multiRegionEdit(params)
  }
}

/** createImages（openai-image-provider 同名方法的 seedream 版本，供兼容调用） */
export async function createImages(req: { prompt: string; urls?: string[]; size?: string; n?: number }): Promise<{ images: ProviderImage[] }> {
  const ref = (req.urls || []).filter(Boolean)[0]
  return callSeedreamOpenAICompat(req.prompt, ref, req.size || '1K', req.n ?? 1)
}
