// D6 §5 — Worker 轮询模型 + 任务执行
import { prisma } from '@/lib/db/prisma'
import { Prisma } from "@prisma/client"
import { getProvider } from '@/lib/providers/registry'
import { initProviders } from '@/lib/providers'
import { putObject } from '@/lib/tos/tos-client'
import { ERROR_MESSAGE_SAFE } from '@/lib/types/provider'
import type { ProviderErrorCode, ProviderImage } from '@/lib/types/provider'
import { runP0QualityCheck } from '@/lib/quality/p0-check'
import { runPartialRepaintChain, type ChainRegion } from '@/lib/worker/partial-repaint-chain'
import { runSeedreamMultiRegion } from '@/lib/worker/seedream-multiregion'
import { SeedreamProvider } from '@/lib/providers/seedream-provider'
import { getSignedUrl } from '@/lib/tos/tos-client'

const POLL_INTERVAL_MS = 5000        // 轮询间隔
const TASK_TIMEOUT_MS = 10 * 60_000  // 10 分钟超时
const WORKER_ID = `worker-${process.pid}-${Date.now()}`

let running = false
let timer: ReturnType<typeof setInterval> | null = null

// ---- 日志辅助 ----
function log(msg: string) {
  console.log(`[worker:${WORKER_ID}] ${msg}`)
}

// ---- 安全错误脱敏 ----
function getSafeErrorMessage(code: string | null): string {
  if (!code) return ERROR_MESSAGE_SAFE.unknown
  return ERROR_MESSAGE_SAFE[code as ProviderErrorCode] ?? ERROR_MESSAGE_SAFE.unknown
}

// ---- 下载图片 (provider URL → Buffer) ----
async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status} ${url}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ---- 上传图片到 TOS 并创建 asset ----
async function uploadToTosAndCreateAsset(
  imageData: { url?: string; base64?: string; width: number; height: number },
  ownerId: string,
  filename: string
) {
  let buffer: Buffer
  let mimeType = 'image/png'

  if (imageData.base64) {
    buffer = Buffer.from(imageData.base64, 'base64')
  } else if (imageData.url) {
    buffer = await downloadImage(imageData.url)
    // 尝试从 URL 推断 mime type
    if (imageData.url.includes('.jpg') || imageData.url.includes('.jpeg')) {
      mimeType = 'image/jpeg'
    } else if (imageData.url.includes('.webp')) {
      mimeType = 'image/webp'
    }
  } else {
    throw new Error('No image data (url or base64)')
  }

  const crypto = await import('crypto')
  const checksum = `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`

  const date = new Date()
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const tosKey = `assets/${ownerId}/${yyyymm}/${Date.now()}-${filename}`

  await putObject(tosKey, buffer, mimeType)

  const asset = await prisma.asset.create({
    data: {
      type: 'generated_image',
      filename,
      mime_type: mimeType,
      size_bytes: BigInt(buffer.length),
      width: imageData.width,
      height: imageData.height,
      checksum,
      visibility: 'private',
      tos_bucket: process.env.TOS_BUCKET || '',
      tos_key: tosKey,
      owner_id: ownerId,
    },
  })

  return asset
}

// ---- 执行单个任务 ----
async function executeTask(task: {
  id: string
  task_type: string
  user_id: string
  input_assets_json: unknown
  variables_json: unknown
  params_json: unknown
  input_snapshot_json: unknown
  source_generated_image_id: string | null
  prompt_template_id: string | null
  layer_template_id: string | null
  edit_instruction_text: string | null
  attempt_count: number
  max_attempts: number
}) {
  log(`Executing task ${task.id} (type=${task.task_type}, attempt=${task.attempt_count})`)

  try {
    initProviders()
    const provider = getProvider()

    // 解析快照
    const snapshot = task.input_snapshot_json as Record<string, unknown>
    const paramsJson = (task.params_json || {}) as { count?: number; width?: number; height?: number }
    const count = paramsJson.count ?? (task.task_type === 'generate' ? 4 : 1)

    if (task.task_type === 'generate') {
      // --- generate 路径 ---
      const productImageUrl = (snapshot.productImageUrl as string) || ''
      const promptText = (snapshot.promptText as string) || ''
      const variables = (task.variables_json as Record<string, string>) || {}
      const layerSnapshot = snapshot.layerSnapshot as { configJson: Record<string, unknown>; width: number; height: number } | undefined

      const result = await provider.generate({
        productImageUrl,
        promptSnapshot: { promptText, variables },
        layerSnapshot,
        params: { count, width: paramsJson.width, height: paramsJson.height },
      })

      if (!result.success || !result.images || result.images.length === 0) {
        // 失败路径
        await handleTaskFailure(task, result.error)
        return
      }

      // Fix3: 回写 providerTaskId
      if (result.providerTaskId) {
        await prisma.generationTask.update({
          where: { id: task.id },
          data: { provider_task_id: result.providerTaskId },
        })
      }

      // Fix2: 竞态检查 — provider 返回后复查任务状态，若已取消则跳过写图
      const currentStatus = await prisma.generationTask.findUnique({
        where: { id: task.id },
        select: { status: true },
      })
      if (currentStatus?.status === 'canceled') {
        log(`Task ${task.id} was canceled during generation, skipping result write`)
        return
      }

      // 成功路径：下载图片 → 上传 TOS → 创建 generated_images
      const images = result.images
      const createdImages: { id: string }[] = []

      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        const filename = `generated-${task.id}-${i + 1}.png`
        const asset = await uploadToTosAndCreateAsset(
          { url: img.url, base64: img.base64, width: img.width, height: img.height },
          task.user_id,
          filename
        )

        const gi = await prisma.generatedImage.create({
          data: {
            task_id: task.id,
            asset_id: asset.id,
            root_generated_image_id: null, // 先 null，后续更新
            parent_generated_image_id: null,
            version_no: 1,
            variant_index: i + 1,
            is_selected: false,
            generation_params_json: task.params_json as object,
          },
        })
        createdImages.push(gi)

        // S9: 执行 P0 质检并写入 quality_check_json
        try {
          const snapshot = task.input_snapshot_json as Record<string, unknown>
          const layerSnapshot = snapshot.layerSnapshot as { configJson: Record<string, unknown>; width: number; height: number } | undefined
          const paramsJson = (task.params_json || {}) as { count?: number; width?: number; height?: number }
          
          // 获取 expectedSize
          let expectedSize: { width: number; height: number }
          if (layerSnapshot?.width && layerSnapshot?.height) {
            expectedSize = { width: layerSnapshot.width, height: layerSnapshot.height }
          } else {
            expectedSize = { width: paramsJson.width ?? 800, height: paramsJson.height ?? 800 }
          }
          
          const qualityCheck = await runP0QualityCheck({
            asset: { width: img.width, height: img.height },
            expectedSize,
            layerConfigJson: layerSnapshot?.configJson ?? null,
            variables: (task.variables_json as Record<string, string>) || null,
          })
          await prisma.generatedImage.update({
            where: { id: gi.id },
            data: { quality_check_json: qualityCheck as unknown as Prisma.InputJsonValue },
          })
        } catch (qcErr) {
          // 质检失败仅记录 warning，不影响任务成功
          await prisma.generatedImage.update({
            where: { id: gi.id },
            data: {
              quality_check_json: {
                passed: false,
                checked_at: new Date().toISOString(),
                dimension: { passed: false, expected: { width: 800, height: 800 }, actual: { width: img.width, height: img.height } },
                textOverflows: [],
                issues: [
                  {
                    type: 'render_warning',
                    severity: 'warning',
                    message: qcErr instanceof Error ? qcErr.message : String(qcErr),
                  },
                ],
              },
            },
          })
        }
      }

      // 更新 root_generated_image_id：所有指向第一张
      if (createdImages.length > 0) {
        const rootId = createdImages[0].id
        for (const img of createdImages) {
          await prisma.generatedImage.update({
            where: { id: img.id },
            data: { root_generated_image_id: rootId },
          })
        }
      }

    } else {
      // --- edit 路径：两种模式 ---
      //   1) plain edit: 单图 + instruction → 下一版（原有逻辑）
      //   2) partial_repaint: params.mode === 'partial_repaint' 时走串行链式编辑
      const editMode = (paramsJson as Record<string, unknown>).mode
      const isPartialRepaint = editMode === 'partial_repaint'

      if (isPartialRepaint) {
        await executePartialRepaint(task, paramsJson as Record<string, unknown>)
      } else {
        await executePlainEdit(task, paramsJson as Record<string, unknown>, count)
      }
    }

    // Fix2: 最终复查 — 写 succeeded 前再次确认未被取消
    const finalCheck = await prisma.generationTask.findUnique({
      where: { id: task.id },
      select: { status: true },
    })
    if (finalCheck?.status === 'canceled') {
      log(`Task ${task.id} was canceled before finalizing, discarding results`)
      return
    }

    // 更新任务状态为 succeeded
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'succeeded',
        finished_at: new Date(),
      },
    })

    // 写审计日志
    await prisma.auditLog.create({
      data: {
        actor_user_id: task.user_id,
        action: 'generation_succeeded',
        target_type: 'generation_task',
        target_id: task.id,
      },
    })

    log(`Task ${task.id} succeeded`)
  } catch (err) {
    log(`Task ${task.id} error: ${err instanceof Error ? err.message : String(err)}`)
    await handleTaskFailure(task, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
      retryable: false,
    })
  }
}

// ---- plain edit 辅助（从主分支抽出，保持原有行为）----
async function executePlainEdit(
  task: {
    id: string
    user_id: string
    source_generated_image_id: string | null
    edit_instruction_text: string | null
    params_json: unknown
  },
  paramsJson: Record<string, unknown>,
  count: number,
) {
  const provider = getProvider()

  const sourceGi = await prisma.generatedImage.findUnique({
    where: { id: task.source_generated_image_id! },
    include: { asset: true },
  })
  if (!sourceGi || !sourceGi.asset) {
    throw new Error(`Source generated image not found: ${task.source_generated_image_id}`)
  }
  const sourceImageUrl = getSignedUrl(sourceGi.asset.tos_key, 300)

  const result = await provider.edit({
    sourceImageUrl,
    editInstructionText: task.edit_instruction_text || '',
    params: { count, width: paramsJson.width as number | undefined, height: paramsJson.height as number | undefined },
  })

  if (!result.success || !result.images || result.images.length === 0) {
    await handleTaskFailure(task as any, result.error)
    return
  }

  if (result.providerTaskId) {
    await prisma.generationTask.update({
      where: { id: task.id },
      data: { provider_task_id: result.providerTaskId },
    })
  }

  const currentStatus = await prisma.generationTask.findUnique({ where: { id: task.id }, select: { status: true } })
  if (currentStatus?.status === 'canceled') {
    log(`Task ${task.id} was canceled during edit, skipping result write`)
    return
  }

  const images = result.images
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const filename = `edited-${task.id}-${i + 1}.png`
    const asset = await uploadToTosAndCreateAsset(
      { url: img.url, base64: img.base64, width: img.width, height: img.height },
      task.user_id,
      filename,
    )

    const gi = await prisma.generatedImage.create({
      data: {
        task_id: task.id,
        asset_id: asset.id,
        root_generated_image_id: sourceGi.root_generated_image_id ?? sourceGi.id,
        parent_generated_image_id: sourceGi.id,
        version_no: sourceGi.version_no + 1,
        variant_index: i + 1,
        is_selected: false,
        edit_instruction_json: { text: task.edit_instruction_text },
        generation_params_json: task.params_json as object,
      },
    })

    try {
      const qualityCheck = await runP0QualityCheck({
        asset: { width: img.width, height: img.height },
        expectedSize: { width: sourceGi.asset.width ?? 800, height: sourceGi.asset.height ?? 800 },
        layerConfigJson: null,
        variables: null,
      })
      await prisma.generatedImage.update({
        where: { id: gi.id },
        data: { quality_check_json: qualityCheck as unknown as Prisma.InputJsonValue },
      })
    } catch (qcErr) {
      await prisma.generatedImage.update({
        where: { id: gi.id },
        data: {
          quality_check_json: {
            passed: false,
            checked_at: new Date().toISOString(),
            dimension: { passed: false, expected: { width: sourceGi.asset.width ?? img.width, height: sourceGi.asset.height ?? img.height }, actual: { width: img.width, height: img.height } },
            textOverflows: [],
            issues: [{ type: 'render_warning', severity: 'warning', message: qcErr instanceof Error ? qcErr.message : String(qcErr) }],
          },
        },
      })
    }
  }
}

// ---- partial_repaint 链式编辑辅助 ----
interface PartialRepaintRegionPayload {
  id: string
  index: number
  /** 0-1 归一化 rect（旧字段，向后兼容） */
  rect?: { x: number; y: number; width: number; height: number }
  /** 0-999 归一化 bbox（P1 新字段，优先使用） */
  bbox_norm?: { x1: number; y1: number; x2: number; y2: number }
  instruction: string
  /** 第 3 张参考图（asset tos_key 或 signed url，二选一） */
  referenceTosKey?: string
  referenceAssetId?: string
  referenceImageUrl?: string
}

async function executePartialRepaint(
  task: {
    id: string
    user_id: string
    source_generated_image_id: string | null
    edit_instruction_text: string | null
    params_json: unknown
    input_snapshot_json: unknown
  },
  paramsJson: Record<string, unknown>,
) {
  // 解析 regions：优先从 paramsJson.regions 取；input_snapshot.regions 兜底
  const rawRegions = (paramsJson.regions as PartialRepaintRegionPayload[] | undefined)
    ?? ((task.input_snapshot_json as Record<string, unknown>)?.regions as PartialRepaintRegionPayload[] | undefined)
    ?? []
  if (!Array.isArray(rawRegions) || rawRegions.length === 0) {
    throw new Error('partial_repaint: params.regions 不能为空')
  }

  // 基础父图来源：base_asset_id 优先，否则用 source_generated_image_id
  const snapshot = task.input_snapshot_json as Record<string, unknown>
  const baseAssetId = (snapshot.baseAssetId as string | undefined) ?? (snapshot.base_asset_id as string | undefined)

  let parentWidth = 800
  let parentHeight = 800
  let parentImageUrl = ''
  let parentTosKey: string | undefined
  let rootGi: { id: string; root_generated_image_id: string | null; version_no: number } | null = null

  if (baseAssetId) {
    const asset = await prisma.asset.findUnique({ where: { id: baseAssetId } })
    if (!asset) throw new Error(`partial_repaint: base asset not found: ${baseAssetId}`)
    parentTosKey = asset.tos_key
    parentImageUrl = getSignedUrl(asset.tos_key, 600)
    parentWidth = asset.width ?? 800
    parentHeight = asset.height ?? 800
  } else if (task.source_generated_image_id) {
    const sourceGi = await prisma.generatedImage.findUnique({
      where: { id: task.source_generated_image_id },
      include: { asset: true },
    })
    if (!sourceGi || !sourceGi.asset) throw new Error(`partial_repaint: source image not found: ${task.source_generated_image_id}`)
    parentTosKey = sourceGi.asset.tos_key
    parentImageUrl = getSignedUrl(sourceGi.asset.tos_key, 600)
    parentWidth = sourceGi.asset.width ?? 800
    parentHeight = sourceGi.asset.height ?? 800
    rootGi = { id: sourceGi.id, root_generated_image_id: sourceGi.root_generated_image_id, version_no: sourceGi.version_no }
  } else {
    throw new Error('partial_repaint: 必须提供 base_asset_id 或 source_generated_image_id')
  }

  // 候选数 n（Seedream 可 >1，chain fallback 默认 1）
  const nCandidates = Math.max(1, Math.min(4, Number(paramsJson.count) || (paramsJson.n ? Number(paramsJson.n) : 1)))
  const sizeArg = (typeof paramsJson.size === 'string' ? paramsJson.size : undefined)

  // 更新任务 detail_json 的统一入口
  const updateProgress = async (progress: Record<string, unknown>) => {
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        input_snapshot_json: {
          ...(snapshot as object),
          ...progress,
          updatedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    })
  }

  // ---- 决定后端链路：seedream（主） vs chain-fallback（串行降级） ----
  const providerName = process.env.GENERATION_PROVIDER || 'openai-image'
  const allowFallback = (process.env.SEEDREAM_FALLBACK_TO_CHAIN ?? '1') !== '0'
  const useSeedream = providerName === 'seedream'

  let backend: 'seedream' | 'chain-fallback' = useSeedream ? 'seedream' : 'chain-fallback'
  let backendNote = ''

  // 准备给 Seedream 的区域列表（含 bbox_norm 字段优先，否则从 rect 0-1 转）
  const preparedRegions = rawRegions.map((r, i) => {
    const index = typeof r.index === 'number' ? r.index : i + 1
    const referenceImageUrl = r.referenceImageUrl
      ?? (r.referenceTosKey ? getSignedUrl(r.referenceTosKey, 600) : undefined)
    let bbox_norm: { x1: number; y1: number; x2: number; y2: number } | undefined
    const anyR = r as PartialRepaintRegionPayload & { bbox_norm?: { x1: number; y1: number; x2: number; y2: number } }
    if (anyR.bbox_norm && Number.isFinite(anyR.bbox_norm.x1)) {
      bbox_norm = {
        x1: Number(anyR.bbox_norm.x1),
        y1: Number(anyR.bbox_norm.y1),
        x2: Number(anyR.bbox_norm.x2),
        y2: Number(anyR.bbox_norm.y2),
      }
    }
    return {
      id: r.id || `r_${i}`,
      index,
      rect: {
        x: Number(r.rect?.x ?? 0),
        y: Number(r.rect?.y ?? 0),
        width: Number(r.rect?.width ?? 0),
        height: Number(r.rect?.height ?? 0),
      },
      bbox_norm,
      instruction: r.instruction || task.edit_instruction_text || '修复框选区域',
      referenceImageUrl,
      referenceTosKey: r.referenceTosKey,
    }
  })

  // ---- Seedream 路径 ----
  if (useSeedream) {
    await updateProgress({ chainProgress: { step: 0, total: 1, label: '准备 Seedream 多区域一次性生成', backend: 'seedream' } })
    try {
      const seedreamResult = await runSeedreamMultiRegion(new SeedreamProvider(), {
        parentImageUrl,
        width: parentWidth,
        height: parentHeight,
        regions: preparedRegions,
        n: nCandidates,
        size: sizeArg,
        onProgress: (phase, _pct, label) => {
          log(`[seedream-mr:${task.id}] ${phase}: ${label}`)
          updateProgress({ chainProgress: { step: 1, total: 1, label, phase, backend: 'seedream' } }).catch((e) => log(`progress err: ${e?.message || e}`))
        },
      })

      // 竞态检查
      const currentStatus = await prisma.generationTask.findUnique({ where: { id: task.id }, select: { status: true } })
      if (currentStatus?.status === 'canceled') {
        log(`Task ${task.id} canceled during seedream generation, discarding`)
        return
      }

      // 上传 N 张候选到 TOS 并落库
      const createdGiIds: string[] = []
      for (let i = 0; i < seedreamResult.images.length; i++) {
        const img = seedreamResult.images[i]
        const filename = `seedream-mr-${task.id}-${i + 1}.png`
        const asset = await uploadToTosAndCreateAsset(
          { url: img.url, base64: img.base64, width: img.width, height: img.height },
          task.user_id,
          filename,
        )
        const gi = await prisma.generatedImage.create({
          data: {
            task_id: task.id,
            asset_id: asset.id,
            root_generated_image_id: rootGi?.root_generated_image_id ?? rootGi?.id ?? null,
            parent_generated_image_id: rootGi?.id ?? null,
            version_no: (rootGi?.version_no ?? 0) + 1,
            variant_index: i + 1,
            is_selected: false,
            edit_instruction_json: {
              mode: 'partial_repaint',
              backend: 'seedream',
              regions: preparedRegions.map((r) => ({ id: r.id, index: r.index, bbox_norm: r.bbox_norm, instruction: r.instruction })),
            } as unknown as Prisma.InputJsonValue,
            generation_params_json: { ...(paramsJson as object), backend: 'seedream' } as unknown as Prisma.InputJsonValue,
          },
        })
        createdGiIds.push(gi.id)
      }

      // root 指向第一张
      if (createdGiIds.length > 0) {
        const rootId = createdGiIds[0]
        await prisma.generatedImage.updateMany({
          where: { id: { in: createdGiIds }, root_generated_image_id: null },
          data: { root_generated_image_id: rootId },
        })
      }

      // P0 质检（基于每张候选的尺寸）
      for (const giId of createdGiIds) {
        try {
          const gi = await prisma.generatedImage.findUnique({ where: { id: giId }, include: { asset: true } })
          if (!gi?.asset) continue
          const qualityCheck = await runP0QualityCheck({
            asset: { width: gi.asset.width ?? parentWidth, height: gi.asset.height ?? parentHeight },
            expectedSize: { width: parentWidth, height: parentHeight },
            layerConfigJson: null,
            variables: null,
          })
          await prisma.generatedImage.update({
            where: { id: gi.id },
            data: { quality_check_json: qualityCheck as unknown as Prisma.InputJsonValue },
          })
        } catch (qcErr) {
          await prisma.generatedImage.update({
            where: { id: giId },
            data: {
              quality_check_json: {
                passed: false,
                checked_at: new Date().toISOString(),
                dimension: { passed: false, expected: { width: parentWidth, height: parentHeight }, actual: { width: parentWidth, height: parentHeight } },
                textOverflows: [],
                issues: [{ type: 'render_warning', severity: 'warning', message: qcErr instanceof Error ? qcErr.message : String(qcErr) }],
              } as unknown as Prisma.InputJsonValue,
            },
          })
        }
      }

      await updateProgress({ chainProgress: { step: 1, total: 1, label: '完成', backend: 'seedream' } })
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`[seedream-mr:${task.id}] failed: ${msg}`)
      backendNote = `Seedream 调用失败（${msg.slice(0, 120)}）`
      if (!allowFallback) {
        throw err
      }
      // 降级到串行链
      backend = 'chain-fallback'
      await updateProgress({ chainProgress: { step: 0, total: preparedRegions.length, label: `Seedream 失败，降级到串行链式编辑（${preparedRegions.length} 个区域）`, backend: 'chain-fallback', note: backendNote } })
    }
  }

  // ---- chain-fallback 路径（串行链式，原有逻辑，保留单区域/多区域串行） ----
  // 规范化 chain regions（用 0-1 rect）
  const chainRegions: ChainRegion[] = preparedRegions.map((r) => ({
    id: r.id,
    index: r.index,
    rect: r.rect,
    instruction: r.instruction,
    referenceTosKey: r.referenceTosKey,
    referenceImageUrl: r.referenceImageUrl,
  }))

  await updateProgress({ chainProgress: { step: 0, total: chainRegions.length, label: '准备开始', backend: 'chain-fallback' } })

  const chain = await runPartialRepaintChain({
    parentImageUrl,
    parentTosKey,
    width: parentWidth,
    height: parentHeight,
    regions: chainRegions,
    n: 1, // chain 路径每步只取 1 张（串行每步 n=1）
    ownerId: task.user_id,
    parentImageId: rootGi?.id ?? baseAssetId,
    onProgress: (step, total, label) => {
      log(`[partial_repaint:${task.id}] step ${step}/${total}: ${label}`)
      updateProgress({ chainProgress: { step, total, label, backend: 'chain-fallback', note: backendNote } }).catch((e) => log(`progress update failed: ${e?.message || e}`))
    },
  })

  // 竞态检查
  const currentStatus = await prisma.generationTask.findUnique({ where: { id: task.id }, select: { status: true } })
  if (currentStatus?.status === 'canceled') {
    log(`Task ${task.id} canceled during partial_repaint, discarding`)
    return
  }

  const finalSignedUrl = chain.finalParentUrl
  const finalBuffer = await (async () => {
    const res = await fetch(finalSignedUrl)
    if (!res.ok) throw new Error(`download final result failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  })()

  const filename = `partial-repaint-${task.id}-final.png`
  const finalAsset = await uploadToTosAndCreateAsset(
    { base64: finalBuffer.toString('base64'), width: chain.width, height: chain.height },
    task.user_id,
    filename,
  )

  const parentGiId = rootGi?.id ?? null
  const rootGiId = rootGi?.root_generated_image_id ?? rootGi?.id ?? null
  const versionNo = (rootGi?.version_no ?? 0) + 1

  const gi = await prisma.generatedImage.create({
    data: {
      task_id: task.id,
      asset_id: finalAsset.id,
      root_generated_image_id: rootGiId,
      parent_generated_image_id: parentGiId,
      version_no: versionNo,
      variant_index: 1,
      is_selected: false,
      edit_instruction_json: {
        mode: 'partial_repaint',
        backend: 'chain-fallback',
        note: backendNote || undefined,
        regions: chainRegions.map((r) => ({ id: r.id, index: r.index, rect: r.rect, instruction: r.instruction })),
        chainSteps: chain.steps.map((s) => ({ regionId: s.regionId, regionIndex: s.regionIndex, tosKey: s.tosKey })),
      } as unknown as Prisma.InputJsonValue,
      generation_params_json: { ...(paramsJson as object), backend: 'chain-fallback' } as unknown as Prisma.InputJsonValue,
    },
  })

  // P0 质检（基于最终图尺寸）
  try {
    const qualityCheck = await runP0QualityCheck({
      asset: { width: chain.width, height: chain.height },
      expectedSize: { width: parentWidth, height: parentHeight },
      layerConfigJson: null,
      variables: null,
    })
    await prisma.generatedImage.update({
      where: { id: gi.id },
      data: { quality_check_json: qualityCheck as unknown as Prisma.InputJsonValue },
    })
  } catch (qcErr) {
    await prisma.generatedImage.update({
      where: { id: gi.id },
      data: {
        quality_check_json: {
          passed: false,
          checked_at: new Date().toISOString(),
          dimension: { passed: false, expected: { width: parentWidth, height: parentHeight }, actual: { width: chain.width, height: chain.height } },
          textOverflows: [],
          issues: [{ type: 'render_warning', severity: 'warning', message: qcErr instanceof Error ? qcErr.message : String(qcErr) }],
        } as unknown as Prisma.InputJsonValue,
      },
    })
  }
}



// ---- 失败处理 ----
async function handleTaskFailure(
  task: { id: string; user_id: string; attempt_count: number; max_attempts: number },
  error: { code: string; message: string; retryable: boolean } | undefined
) {
  const errorCode = error?.code ?? 'unknown'
  const safeMessage = getSafeErrorMessage(errorCode)
  const retryable = error?.retryable ?? false

  if (retryable && task.attempt_count < task.max_attempts) {
    // 重新排队
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'pending',
        locked_at: null,
        locked_by: null,
        error_code: errorCode,
        error_message_safe: safeMessage,
      },
    })
    log(`Task ${task.id} retry queued (attempt ${task.attempt_count}/${task.max_attempts})`)
  } else {
    // 最终失败
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        finished_at: new Date(),
        error_code: errorCode,
        error_message_safe: safeMessage,
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_user_id: task.user_id,
        action: 'generation_failed',
        target_type: 'generation_task',
        target_id: task.id,
        detail_json: { error_code: errorCode },
      },
    })

    log(`Task ${task.id} failed: ${errorCode}`)
  }
}

// ---- 单次轮询 ----
export async function pollOnce() {
  if (running) return
  running = true

  try {
    // 1. 回收超时任务
    await prisma.$executeRaw`
      UPDATE generation_tasks
      SET status = 'pending', locked_at = NULL, locked_by = NULL
      WHERE status = 'running'
        AND started_at < NOW() - INTERVAL '10 minutes'
    `

    // 2. 领取一个 pending 任务 (FOR UPDATE SKIP LOCKED)
    const claimed = await prisma.$queryRaw<Array<{
      id: string
      task_type: string
      user_id: string
      input_assets_json: unknown
      variables_json: unknown
      params_json: unknown
      input_snapshot_json: unknown
      source_generated_image_id: string | null
      prompt_template_id: string | null
      layer_template_id: string | null
      edit_instruction_text: string | null
      attempt_count: number
      max_attempts: number
    }>>`
      UPDATE generation_tasks
      SET status = 'running',
          started_at = NOW(),
          locked_at = NOW(),
          locked_by = ${WORKER_ID},
          attempt_count = attempt_count + 1
      WHERE id = (
        SELECT id FROM generation_tasks
        WHERE status = 'pending'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `

    if (claimed.length === 0) return

    await executeTask(claimed[0])
  } catch (err) {
    log(`pollOnce error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    running = false
  }
}

// ---- 启动 worker 主循环 ----
export function startWorkerLoop() {
  initProviders()
  log(`Worker started (POLL_INTERVAL=${POLL_INTERVAL_MS}ms, TASK_TIMEOUT=${TASK_TIMEOUT_MS}ms)`)

  // 立即执行一次
  pollOnce()

  timer = setInterval(pollOnce, POLL_INTERVAL_MS)

  // 优雅退出
  process.on('SIGINT', () => {
    log('Received SIGINT, shutting down...')
    if (timer) clearInterval(timer)
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down...')
    if (timer) clearInterval(timer)
    process.exit(0)
  })
}
