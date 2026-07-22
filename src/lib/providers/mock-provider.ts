// D6 §2 — Mock Provider 实现
import type {
  GenerationProvider,
  GenerateParams,
  EditParams,
  GenerateResult,
  CancelResult,
  ProviderImage,
} from '@/lib/types/provider'

export class MockGenerationProvider implements GenerationProvider {
  name = 'mock'

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const count = params.params.count ?? 4
    // 模拟网络延迟
    await this.simulateDelay(2000, 5000)

    const images: ProviderImage[] = Array.from({ length: count }, (_, i) => ({
      url: `https://picsum.photos/seed/mock-${Date.now()}-${i}/${params.params.width ?? 800}/${params.params.height ?? 800}`,
      width: params.params.width ?? 800,
      height: params.params.height ?? 800,
    }))

    return {
      success: true,
      images,
      providerTaskId: `mock-${Date.now()}`,
    }
  }

  async edit(params: EditParams): Promise<GenerateResult> {
    const count = params.params.count ?? 1
    await this.simulateDelay(2000, 5000)

    const images: ProviderImage[] = Array.from({ length: count }, (_, i) => ({
      url: `https://picsum.photos/seed/mock-edit-${Date.now()}-${i}/800/800`,
      width: 800,
      height: 800,
    }))

    return {
      success: true,
      images,
      providerTaskId: `mock-edit-${Date.now()}`,
    }
  }

  async cancel(_providerTaskId: string): Promise<CancelResult> {
    return { success: true, supported: true }
  }

  private simulateDelay(min: number, max: number): Promise<void> {
    const ms = min + Math.random() * (max - min)
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
