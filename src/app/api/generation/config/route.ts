// GET /api/generation/config — 前端读可用模型/候选数上限等配置（不暴露密钥）
import { NextResponse } from 'next/server'

export async function GET() {
  const provider = (process.env.GENERATION_PROVIDER || 'openai-image') as 'seedream' | 'openai-image' | string
  const maxCount = Math.max(1, parseInt(process.env.SEEDREAM_MAX_COUNT || '4', 10) || 4)

  const models: Array<{ value: string; label: string; defaultN: number; maxN: number; backend: 'seedream' | 'chain-fallback' }> = []
  if (provider === 'seedream') {
    models.push({ value: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro（多区域一次出图，20-30s）', defaultN: 2, maxN: maxCount, backend: 'seedream' })
  }
  models.push({ value: 'openai-image', label: 'gpt-image-2 串行链式（兜底，按区域逐张 ~50s/张）', defaultN: 1, maxN: 1, backend: 'chain-fallback' })

  return NextResponse.json({
    data: {
      provider,
      models,
      sizes: [
        { value: '1K', label: '1K（1024，快）' },
        { value: '2K', label: '2K（2048，高清）' },
      ],
      maxRegions: 8,
    },
  })
}
