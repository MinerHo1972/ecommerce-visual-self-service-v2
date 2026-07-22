// D6 生成服务抽象契约 — Provider 接口定义

/** 所有生成服务 provider 必须实现的接口 */
export interface GenerationProvider {
  name: string

  /** 模板 + 变量 + 商品图 → 候选图 */
  generate(params: GenerateParams): Promise<GenerateResult>

  /** 基于已有图 + 文字指令 → 下一版 */
  edit(params: EditParams): Promise<GenerateResult>

  /** 取消任务（provider 支持时调用） */
  cancel(providerTaskId: string): Promise<CancelResult>

  /** 查询异步任务状态（provider 支持时调用） */
  getTaskStatus?(providerTaskId: string): Promise<TaskStatusResult>
}

// ---- 生成参数 ----

export interface GenerateParams {
  /** 商品图访问 URL（signed URL，provider 可下载） */
  productImageUrl: string
  /** Prompt 模板快照 */
  promptSnapshot: {
    promptText: string
    variables: Record<string, string>
  }
  /** 图层模板快照（可选，部分 provider 可能不需要） */
  layerSnapshot?: {
    configJson: Record<string, unknown>
    width: number
    height: number
  }
  /** 生成参数 */
  params: {
    count: number             // 生成候选图数量，默认 4
    width?: number            // 输出宽度
    height?: number           // 输出高度
    [key: string]: unknown    // provider 特定参数
  }
}

export interface EditParams {
  /** 源图访问 URL */
  sourceImageUrl: string
  /** 改图指令，直接透传，不做意图解析 */
  editInstructionText: string
  /** 生成参数 */
  params: {
    count?: number            // edit 默认 1
    width?: number
    height?: number
    [key: string]: unknown
  }
}

// ---- 生成结果 ----

export interface GenerateResult {
  success: boolean
  /** 成功时返回候选图 */
  images?: ProviderImage[]
  /** provider 侧任务 ID（用于异步轮询/取消） */
  providerTaskId?: string
  /** 失败时的错误信息 */
  error?: ProviderError
}

export interface ProviderImage {
  /** 图片 URL（provider 临时 URL，需下载后转存 TOS） */
  url: string
  /** 或 base64（二选一） */
  base64?: string
  width: number
  height: number
}

export interface ProviderError {
  code: ProviderErrorCode
  message: string             // 原始错误信息（仅服务端日志，不返回前端）
  retryable: boolean
}

export type ProviderErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'invalid_input'
  | 'provider_error'
  | 'unknown'

// ---- 取消结果 ----

export interface CancelResult {
  success: boolean
  /** provider 是否真正支持取消 */
  supported: boolean
}

// ---- 状态查询结果 ----

export interface TaskStatusResult {
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  images?: ProviderImage[]
  error?: ProviderError
}

// ---- 错误脱敏映射表 (D6 §3.1) ----

export const ERROR_MESSAGE_SAFE: Record<ProviderErrorCode, string> = {
  timeout: '生成超时，请重试',
  rate_limit: '请求过于频繁，请稍后重试',
  invalid_input: '输入参数有误，请检查后重试',
  provider_error: '生成服务暂时不可用，请稍后重试',
  unknown: '生成失败，请联系管理员',
}
