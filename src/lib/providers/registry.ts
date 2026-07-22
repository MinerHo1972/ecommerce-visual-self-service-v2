// D6 §6 — Provider 注册与切换
import type { GenerationProvider } from '@/lib/types/provider'

const providers: Record<string, GenerationProvider> = {}

export function registerProvider(name: string, provider: GenerationProvider) {
  providers[name] = provider
}

export function getProvider(): GenerationProvider {
  // P1: 优先 GENERATION_PROVIDER；线上建议 seedream；openai-image（beikun gpt-image-2）作为兜底
  const name = process.env.GENERATION_PROVIDER || 'openai-image'
  const provider = providers[name]
  if (!provider) {
    throw new Error(`Unknown generation provider: ${name}`)
  }
  return provider
}

/** 显式拿 Seedream provider（worker 降级判断用） */
export function getSeedreamProvider(): GenerationProvider | null {
  return providers['seedream'] || null
}

/** 显式拿 openai-image（gpt-image-2） provider（worker 降级用） */
export function getOpenAIImageProvider(): GenerationProvider | null {
  return providers['openai-image'] || null
}
