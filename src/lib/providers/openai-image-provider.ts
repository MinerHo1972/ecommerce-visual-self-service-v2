// D6 §2 — 真实 Provider: gpt-image-2 (beikun / grsai 兼容)
//
// 环境变量:
//   GENERATION_PROVIDER       = "openai-image"
//   OPENAI_IMAGE_ENDPOINT     = https://beikun.xyz  (或 grsai base url)
//   OPENAI_IMAGE_MODEL        = gpt-image-2
//   OPENAI_IMAGE_API_KEY      = sk-...
//   OPENAI_IMAGE_MAX_COUNT    = 1  (单次最多候选数，默认 1；运营侧按 n 参数)
//   OPENAI_IMAGE_ASYNC_MODE   = "1" 使用 /v1/draw/completions + /v1/draw/result 异步轮询（grsai 专有）；
//                              "0" (默认, beikun) 使用 OpenAI 标准同步接口:
//                                  /v1/images/generations (纯文本), /v1/images/edits (multipart image[])
//
// 支持接口形态：
//   - generate: prompt + (可选 productImageUrl 作为 urls[0]) → 图
//   - edit:     sourceImageUrl + editInstructionText → 图
//   - createImages(req): { prompt, urls?: string[], size?: string, n?: number }  ← partial_repaint 专用
//
// 所有请求走 endpoint + Authorization: Bearer <key>，绝不硬编码。

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
  const endpoint = (process.env.OPENAI_IMAGE_ENDPOINT || '').replace(/\/+$/, '')
  const apiKey = process.env.OPENAI_IMAGE_API_KEY || ''
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'
  const maxCount = Math.max(1, parseInt(process.env.OPENAI_IMAGE_MAX_COUNT || '1', 10) || 1)
  const asyncMode = (process.env.OPENAI_IMAGE_ASYNC_MODE ?? '0') === '1'
  // 单次轮询：最多 5 分钟（gpt-image-2 通常 20~60s 完成）
  const pollIntervalMs = Math.max(1000, parseInt(process.env.OPENAI_IMAGE_POLL_INTERVAL_MS || '5000', 10) || 5000)
  const pollMaxAttempts = Math.max(1, parseInt(process.env.OPENAI_IMAGE_POLL_MAX_ATTEMPTS || '60', 10) || 60)
  return { endpoint, apiKey, model, maxCount, asyncMode, pollIntervalMs, pollMaxAttempts }
}

// ---- 公开的 partial_repaint 直调入口 ----

export interface CreateImagesRequest {
  prompt: string
  /** 多图参考（V1 partial_repaint: [父图, 裁片, 可选参考图]） */
  urls?: string[]
  /** 输出尺寸 "WxH"，例如 "800x800" */
  size?: string
  /** 候选数，受 OPENAI_IMAGE_MAX_COUNT 上限约束 */
  n?: number
}

export interface CreateImagesResponse {
  images: ProviderImage[]
  providerTaskId?: string
}

// ---- 工具 ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseSize(size: string | undefined, fallbackW = 800, fallbackH = 800): { w: number; h: number; aspectRatio: string } {
  if (size && /^\d+x\d+$/i.test(size)) {
    const [w, h] = size.split(/x/i).map((n) => parseInt(n, 10))
    return { w, h, aspectRatio: `${w}x${h}` }
  }
  return { w: fallbackW, h: fallbackH, aspectRatio: `${fallbackW}x${fallbackH}` }
}

function toProviderError(err: unknown, retryable = false): ProviderError {
  const msg = err instanceof Error ? err.message : String(err)
  // 常见可重试错误码关键字
  const rateLimit = /rate.?limit|429|too many/i.test(msg)
  const timeout = /timeout|timed? out|ECONNRESET|ETIMEDOUT/i.test(msg)
  return {
    code: rateLimit ? 'rate_limit' : timeout ? 'timeout' : 'provider_error',
    message: msg,
    retryable: retryable || rateLimit || timeout,
  }
}

// ---- 核心：异步 submit → poll（beikun / grsai 风格） ----

interface SubmitResp {
  data?: { id?: string }
  error?: { message?: string }
  // 同步模式下可能直接带 images / data 数组
  images?: Array<{ url?: string; b64_json?: string }>
  data_arr?: Array<{ url?: string; b64_json?: string }>
}

interface PollResp {
  data?: {
    status?: 'pending' | 'processing' | 'running' | 'succeeded' | 'failed'
    results?: Array<{ url?: string; b64_json?: string }>
    images?: Array<{ url?: string; b64_json?: string }>
    error?: string
  }
  error?: { message?: string }
}

async function submitAsync(
  cfg: ReturnType<typeof readConfig>,
  prompt: string,
  urls: string[],
  aspectRatio: string,
  n: number,
): Promise<string> {
  const url = `${cfg.endpoint}/v1/draw/completions`
  const body: Record<string, unknown> = {
    model: cfg.model,
    prompt,
    aspectRatio,
    n,
    webHook: '-1', // 强制异步：立即返回 task id
  }
  if (urls.length > 0) body.urls = urls

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`openai-image submit HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = (await res.json()) as SubmitResp
  const taskId = json.data?.id
  if (!taskId) throw new Error(`openai-image: submit 未返回 task id: ${JSON.stringify(json).slice(0, 300)}`)
  return taskId
}

async function pollAsync(
  cfg: ReturnType<typeof readConfig>,
  taskId: string,
): Promise<Array<{ url?: string; b64_json?: string }>> {
  const url = `${cfg.endpoint}/v1/draw/result`
  let lastStatus = 'not-started'
  for (let i = 0; i < cfg.pollMaxAttempts; i++) {
    await sleep(cfg.pollIntervalMs)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ id: taskId }),
    })
    if (!res.ok) {
      lastStatus = `http ${res.status}`
      continue
    }
    const json = (await res.json()) as PollResp
    const data = json.data
    if (!data) {
      lastStatus = `no-data: ${JSON.stringify(json).slice(0, 200)}`
      continue
    }
    lastStatus = data.status || 'unknown'
    if (data.status === 'succeeded') {
      const results = data.results || data.images || []
      if (results.length > 0) return results
      throw new Error(`openai-image: task ${taskId} succeeded but no images`)
    }
    if (data.status === 'failed') {
      throw new Error(`openai-image generation failed: ${data.error || 'unknown'}`)
    }
    // pending / processing / running → 继续轮询
  }
  throw new Error(`openai-image poll timeout for task ${taskId}; last status: ${lastStatus}`)
}

/** 统一入口：提交 + 轮询 → 图片列表 */
async function callGptImage2(
  prompt: string,
  urls: string[],
  size: string,
  n: number,
): Promise<{ images: Array<{ url?: string; b64_json?: string }>; taskId?: string }> {
  const cfg = readConfig()
  if (!cfg.endpoint) throw new Error('OPENAI_IMAGE_ENDPOINT not configured')
  if (!cfg.apiKey) throw new Error('OPENAI_IMAGE_API_KEY not configured')

  const clampedN = Math.max(1, Math.min(n, cfg.maxCount))
  const { aspectRatio } = parseSize(size)

  if (cfg.asyncMode) {
    const taskId = await submitAsync(cfg, prompt, urls.filter(Boolean), aspectRatio, clampedN)
    const results = await pollAsync(cfg, taskId)
    return { images: results, taskId }
  }

  // ---- 同步模式：beikun 走标准 OpenAI gpt-image-2 接口 ----
  // - 无参考图: POST /v1/images/generations  JSON body
  // - 有参考图: POST /v1/images/edits         multipart/form-data, image[] 传图片文件, prompt 描述要求
  if (urls.length === 0) {
    // 纯文生图
    const syncUrl = `${cfg.endpoint}/v1/images/generations`
    const res = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        prompt,
        n: clampedN,
        size: aspectRatio,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`openai-image generations HTTP ${res.status}: ${text.slice(0, 500)}`)
    }
    const json = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> }
    return { images: json.data || [] }
  }

  // 多图参考 (partial_repaint): 先把 urls 下载为 Buffer, 再用 multipart 作为 image[] 上传
  const syncUrl = `${cfg.endpoint}/v1/images/edits`
  const form = new FormData()
  form.append('model', cfg.model)
  form.append('prompt', prompt)
  form.append('n', String(clampedN))
  form.append('size', aspectRatio)
  const validUrls = urls.filter(Boolean)
  // 下载每张图并附加
  const imageBuffers: Array<{ buf: Buffer; ctype: string; idx: number }> = []
  for (let i = 0; i < validUrls.length; i++) {
    const u = validUrls[i]
    let buf: Buffer
    let ctype = 'image/png'
    if (u.startsWith('data:')) {
      // data URL
      const semi = u.indexOf(';')
      const comma = u.indexOf(',')
      ctype = u.slice(5, semi) || 'image/png'
      const b64 = u.slice(comma + 1)
      buf = Buffer.from(b64, 'base64')
    } else {
      const r = await fetch(u)
      if (!r.ok) throw new Error(`openai-image: failed to fetch reference image[${i}] HTTP ${r.status}`)
      const ab = await r.arrayBuffer()
      buf = Buffer.from(ab)
      const ct = r.headers.get('content-type')
      if (ct) ctype = ct.split(';')[0]
    }
    // 推断文件扩展名
    const ext = ctype.includes('jpeg') || ctype.includes('jpg') ? 'jpg' : 'png'
    imageBuffers.push({ buf, ctype, idx: i })
    form.append('image[]', new Blob([new Uint8Array(buf)], { type: ctype }), `ref_${i}.${ext}`)
  }
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`openai-image edits HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> }
  return { images: json.data || [] }
}

function resultToProviderImages(
  raw: Array<{ url?: string; b64_json?: string }>,
  w: number,
  h: number,
): ProviderImage[] {
  const out: ProviderImage[] = []
  for (const r of raw) {
    if (r.url) {
      out.push({ url: r.url, width: w, height: h })
    } else if (r.b64_json) {
      out.push({ url: 'data:image/png;base64,' + r.b64_json, width: w, height: h })
    }
  }
  return out
}

// ---- Provider 实现 ----

export class OpenAIImageProvider implements GenerationProvider {
  name = 'openai-image'

  async generate(params: GenerateParams): Promise<GenerateResult> {
    try {
      const width = params.params.width ?? 800
      const height = params.params.height ?? 800
      const size = `${width}x${height}`
      const n = params.params.count ?? 4

      // 把商品图作为参考图（如果有）。prompt 模板 + 变量拼接。
      const promptText = params.promptSnapshot.promptText || ''
      const vars = params.promptSnapshot.variables || {}
      const varLines = Object.keys(vars).length > 0
        ? '\n变量:\n' + Object.entries(vars).map(([k, v]) => `- ${k}: ${v}`).join('\n')
        : ''
      const prompt = `${promptText}${varLines}`.trim() || '电商商品主图'

      const urls: string[] = params.productImageUrl ? [params.productImageUrl] : []

      const { images, taskId } = await callGptImage2(prompt, urls, size, n)
      const providerImages = resultToProviderImages(images, width, height)

      if (providerImages.length === 0) {
        return { success: false, error: { code: 'provider_error', message: 'openai-image 返回空结果', retryable: true } }
      }
      return { success: true, images: providerImages, providerTaskId: taskId }
    } catch (err) {
      return { success: false, error: toProviderError(err, true) }
    }
  }

  async edit(params: EditParams): Promise<GenerateResult> {
    try {
      const width = params.params.width ?? 800
      const height = params.params.height ?? 800
      const size = `${width}x${height}`
      const n = params.params.count ?? 1
      const instruction = params.editInstructionText || '请对图进行编辑优化'

      // edit 透传：源图作为 urls[0]，prompt 是文字指令
      const prompt = instruction
      const urls: string[] = params.sourceImageUrl ? [params.sourceImageUrl] : []

      const { images, taskId } = await callGptImage2(prompt, urls, size, n)
      const providerImages = resultToProviderImages(images, width, height)

      if (providerImages.length === 0) {
        return { success: false, error: { code: 'provider_error', message: 'openai-image edit 返回空结果', retryable: true } }
      }
      return { success: true, images: providerImages, providerTaskId: taskId }
    } catch (err) {
      return { success: false, error: toProviderError(err, true) }
    }
  }

  async cancel(_providerTaskId: string): Promise<CancelResult> {
    // beikun/grsai 当前未暴露取消接口；标记 supported=false 让 worker 走本地忽略
    return { success: true, supported: false }
  }

  async getTaskStatus(providerTaskId: string): Promise<TaskStatusResult> {
    try {
      const cfg = readConfig()
      if (!cfg.asyncMode) return { status: 'succeeded' }
      const res = await fetch(`${cfg.endpoint}/v1/draw/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ id: providerTaskId }),
      })
      if (!res.ok) return { status: 'running' }
      const json = (await res.json()) as PollResp
      const status = json.data?.status
      if (status === 'succeeded') {
        const w = 800
        const h = 800
        const images = resultToProviderImages(json.data?.results || json.data?.images || [], w, h)
        return { status: 'succeeded', images }
      }
      if (status === 'failed') {
        return { status: 'failed', error: { code: 'provider_error', message: json.data?.error || 'failed', retryable: false } }
      }
      return { status: 'running' }
    } catch {
      return { status: 'running' }
    }
  }
}

// ---- partial_repaint / 多区域链式专用：单次 createImages ----

/**
 * 给 worker 内部调用的通用入口。prompt+urls+size+n，返回 ProviderImage 列表。
 * 与 generate/edit 不同的是：这里允许传任意数量的参考图（V1 partial_repaint 用 3 张）。
 */
export async function createImages(req: CreateImagesRequest): Promise<CreateImagesResponse> {
  const { w, h } = parseSize(req.size)
  const { images, taskId } = await callGptImage2(
    req.prompt,
    (req.urls || []).filter(Boolean),
    req.size || `${w}x${h}`,
    req.n ?? 1,
  )
  const providerImages = resultToProviderImages(images, w, h)
  if (providerImages.length === 0) {
    throw new Error('openai-image createImages 返回空结果')
  }
  return { images: providerImages, providerTaskId: taskId }
}
