// Provider 初始化入口
import { registerProvider } from './registry'
import { MockGenerationProvider } from './mock-provider'
import { OpenAIImageProvider } from './openai-image-provider'
import { SeedreamProvider } from './seedream-provider'

let initialized = false

export function initProviders() {
  if (initialized) return
  // mock provider 仅在显式 GENERATION_PROVIDER=mock 时启用（保留以便本地/测试）
  registerProvider('mock', new MockGenerationProvider())
  // beikun / grsai 兼容的 gpt-image-2 provider（兜底/串行降级用）
  registerProvider('openai-image', new OpenAIImageProvider())
  // 火山方舟 Seedream 5.0 Pro（P1 主链路：原生多 bbox 一次调用）
  registerProvider('seedream', new SeedreamProvider())
  initialized = true
}

/** 当前 provider 是否为 seedream */
export function isSeedreamActive(): boolean {
  return (process.env.GENERATION_PROVIDER || 'openai-image') === 'seedream'
}
