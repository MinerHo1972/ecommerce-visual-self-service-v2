import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/api-auth'
import { getSignedUrl } from '@/lib/tos/tos-client'
import type { CreateTaskInput } from '@/lib/types/generation'

// ---- 生成 task_no ----
async function generateTaskNo(): Promise<string> {
  const date = new Date()
  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const suffix = String(date.getTime()).slice(-6)
  return `TASK-${yyyymmdd}-${suffix}`
}

// POST /api/generation/tasks — 创建生图/改图任务
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = (await req.json().catch(() => ({}))) as CreateTaskInput & {
      baseAssetId?: string
      regions?: Array<{
        id?: string
        index?: number
        instruction?: string
        bbox_norm?: { x1: number; y1: number; x2: number; y2: number }
        rect?: { x: number; y: number; width: number; height: number }
        referenceAssetId?: string
      }>
      model?: string
      n?: number
      size?: string
      prompt?: string
    }

    if (!body.task_type || !['generate', 'edit'].includes(body.task_type)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'task_type 必须是 generate 或 edit' } },
        { status: 400 }
      )
    }

    // 构建任务快照
    let inputSnapshot: Record<string, unknown> = {}
    let sourceGeneratedImageId: string | null = null
    let outerBaseImageUrl = ""
    let outerBaseAssetId: string | null = null
    let promptTemplateId: string | null = null
    let layerTemplateId: string | null = null
    let editInstructionText: string | null = null
    let inputAssetsJson: Record<string, unknown> = {}
    let variablesJson: Record<string, string> = {}

    if (body.task_type === 'generate') {
      // --- generate 类型 ---
      const productImageAssetId = body.input_assets?.product_image_asset_id

      let productImageUrl = ''
      if (productImageAssetId) {
        // 校验资产存在且属于当前用户
        const asset = await prisma.asset.findUnique({ where: { id: productImageAssetId } })
        if (!asset || asset.deleted_at) {
          return NextResponse.json(
            { error: { code: 'NOT_FOUND', message: '商品图资产不存在' } },
            { status: 404 }
          )
        }
        if (asset.owner_id !== auth.userId && auth.role !== 'admin' && asset.visibility !== 'public') {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '无权使用该资产' } },
            { status: 403 }
          )
        }
        productImageUrl = getSignedUrl(asset.tos_key, 600)
        inputAssetsJson = { product_image_asset_id: productImageAssetId }
      }

      // 加载 prompt template（如有）；也支持 body.prompt 直传（文生图/图生图）
      let promptText = (body.prompt as string) || ''
      if (body.prompt_template_id) {
        const pt = await prisma.promptTemplate.findUnique({ where: { id: body.prompt_template_id } })
        if (pt) {
          promptTemplateId = pt.id
          promptText = pt.prompt_text
        }
      }

      // 加载 layer template（如有）并构建快照
      let layerSnapshot: { configJson: Record<string, unknown>; width: number; height: number } | undefined
      if (body.layer_template_id) {
        const lt = await prisma.layerTemplate.findUnique({ where: { id: body.layer_template_id } })
        if (lt) {
          // operator 只能用 published
          if (auth.role === 'operator' && lt.status !== 'published') {
            return NextResponse.json(
              { error: { code: 'FORBIDDEN', message: '只能使用已发布的模板' } },
              { status: 403 }
            )
          }
          layerTemplateId = lt.id
          layerSnapshot = {
            configJson: lt.config_json as Record<string, unknown>,
            width: lt.width,
            height: lt.height,
          }
        }
      }

      variablesJson = body.variables || {}

      inputSnapshot = {
        productImageUrl,
        promptText,
        variables: variablesJson,
        layerSnapshot,
      }
    } else {
      // --- edit 类型 ---
      if (!body.edit_instruction_text) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'edit 类型必须提供 edit_instruction_text' } },
          { status: 400 }
        )
      }

      // P1 多区域编辑：允许以 base_asset_id（或 baseAssetId）作为原图来源
      const baseAssetId = body.base_asset_id || body.baseAssetId
      if (baseAssetId) {
        const asset = await prisma.asset.findUnique({ where: { id: baseAssetId } })
        if (!asset || asset.deleted_at) {
          return NextResponse.json(
            { error: { code: 'NOT_FOUND', message: '基础图资产不存在' } },
            { status: 404 }
          )
        }
        if (asset.owner_id !== auth.userId && auth.role !== 'admin' && asset.visibility !== 'public') {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '无权使用该基础图' } },
            { status: 403 }
          )
        }
        outerBaseImageUrl = getSignedUrl(asset.tos_key, 600)
        outerBaseAssetId = asset.id
        inputAssetsJson = { base_asset_id: asset.id }
      } else if (body.source_generated_image_id) {
        // 校验源图存在
        const sourceGi = await prisma.generatedImage.findUnique({
          where: { id: body.source_generated_image_id },
          include: { task: true },
        })
        if (!sourceGi || sourceGi.deleted_at) {
          return NextResponse.json(
            { error: { code: 'NOT_FOUND', message: '源图不存在' } },
            { status: 404 }
          )
        }
        // 权限校验
        if (sourceGi.task.user_id !== auth.userId && auth.role !== 'admin') {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '无权操作该图片' } },
            { status: 403 }
          )
        }

        sourceGeneratedImageId = sourceGi.id
      } else {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'edit 类型必须提供 source_generated_image_id 或 base_asset_id' } },
          { status: 400 }
        )
      }

      editInstructionText = body.edit_instruction_text

      if (outerBaseImageUrl) {
        inputSnapshot = { baseImageUrl: outerBaseImageUrl, editInstructionText }
      }
    }

    const taskNo = await generateTaskNo()

    // P1 多区域编辑：允许前端通过 params.provider 指定模型、params.regions 传入多区域、params.mode 标识 partial_repaint
    const paramsPayload = (body.params || {}) as Record<string, unknown>
    const providerOverride = typeof paramsPayload.provider === 'string'
      ? paramsPayload.provider
      : (typeof body.model === 'string' ? body.model : null)

    // P1: n / size 顶层参数透传到 params（候选数、输出尺寸）
    if (typeof body.n === 'number' && body.n > 0 && !paramsPayload.count) {
      paramsPayload.count = Math.max(1, Math.min(4, Math.round(body.n)))
    }
    if (typeof body.size === 'string' && !paramsPayload.size) {
      paramsPayload.size = body.size
    }

    // partial_repaint 区域校验与归一
    let validatedRegions: Array<Record<string, unknown>> | null = null
    if (body.task_type === 'edit' && paramsPayload.mode === 'partial_repaint') {
      const inRegions: unknown[] = Array.isArray(body.regions) ? body.regions : (Array.isArray(paramsPayload.regions) ? (paramsPayload.regions as unknown[]) : [])
      if (!inRegions || inRegions.length === 0) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'partial_repaint 必须提供至少 1 个区域' } },
          { status: 400 }
        )
      }
      if (inRegions.length > 8) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: '单次最多支持 8 个区域' } },
          { status: 400 }
        )
      }
      const v: Array<Record<string, unknown>> = []
      for (let i = 0; i < inRegions.length; i++) {
        const raw = inRegions[i]
        if (!raw || typeof raw !== 'object') {
          return NextResponse.json({ error: { code: 'INVALID_INPUT', message: `区域 ${i + 1} 格式错误` } }, { status: 400 })
        }
        const r = raw as Record<string, unknown>
        const instruction = (r.instruction || '').toString().trim()
        if (!instruction) {
          return NextResponse.json({ error: { code: 'INVALID_INPUT', message: `区域 ${i + 1} 指令不能为空` } }, { status: 400 })
        }
        let bbox: { x1: number; y1: number; x2: number; y2: number } | null = null
        if (r.bbox_norm && typeof r.bbox_norm === 'object') {
          const b = r.bbox_norm as Record<string, unknown>
          const x1 = Number(b.x1); const y1 = Number(b.y1); const x2 = Number(b.x2); const y2 = Number(b.y2)
          if ([x1, y1, x2, y2].every((n) => Number.isFinite(n)) && x1 >= 0 && y1 >= 0 && x2 <= 999 && y2 <= 999 && x2 > x1 && y2 > y1) {
            bbox = { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) }
          }
        }
        if (!bbox && r.rect && typeof r.rect === 'object') {
          const rect = r.rect as Record<string, unknown>
          const rx = Number(rect.x); const ry = Number(rect.y); const rw = Number(rect.width); const rh = Number(rect.height)
          if ([rx, ry, rw, rh].every((n) => Number.isFinite(n)) && rx >= 0 && ry >= 0 && rw > 0 && rh > 0 && rx + rw <= 1 && ry + rh <= 1) {
            bbox = {
              x1: Math.round(rx * 999),
              y1: Math.round(ry * 999),
              x2: Math.round((rx + rw) * 999),
              y2: Math.round((ry + rh) * 999),
            }
          }
        }
        if (!bbox) {
          return NextResponse.json({ error: { code: 'INVALID_INPUT', message: `区域 ${i + 1} 的 bbox 或 rect 坐标非法（需在 0~999 或 0~1 范围内）` } }, { status: 400 })
        }
        v.push({
          id: r.id || `r_${i}`,
          index: typeof r.index === 'number' ? r.index : i + 1,
          instruction,
          bbox_norm: bbox,
          // 兼容旧 worker：同时写 rect（0-1）
          rect: {
            x: bbox.x1 / 999,
            y: bbox.y1 / 999,
            width: (bbox.x2 - bbox.x1) / 999,
            height: (bbox.y2 - bbox.y1) / 999,
          },
          referenceAssetId: r.referenceAssetId || undefined,
        })
      }
      validatedRegions = v
      // 把校验归一后的 regions 写进 paramsPayload
      paramsPayload.regions = validatedRegions
    }

    // partial_repaint：把 baseAssetId/regions 透传到 input_snapshot 供 worker 使用
    if (body.task_type === 'edit' && paramsPayload.mode === 'partial_repaint' && validatedRegions) {
      inputSnapshot = {
        ...inputSnapshot,
        baseAssetId: outerBaseAssetId,
        regions: validatedRegions,
        size: paramsPayload.size,
        count: paramsPayload.count,
      }
      // 若前端提供 referenceAssetId，解析为 signed URL 注入 region（交给 worker 直接 fetch）
      if (outerBaseAssetId) {
        for (const r of validatedRegions) {
          const refId = r.referenceAssetId as string | undefined
          if (refId) {
            // eslint-disable-next-line no-await-in-loop
            const refAsset = await prisma.asset.findUnique({ where: { id: refId } })
            if (refAsset && !refAsset.deleted_at && (refAsset.owner_id === auth.userId || auth.role === 'admin' || refAsset.visibility === 'public')) {
              r.referenceImageUrl = getSignedUrl(refAsset.tos_key, 600)
              r.referenceTosKey = refAsset.tos_key
            }
          }
        }
      }
    }

    const task = await prisma.generationTask.create({
      data: {
        task_no: taskNo,
        task_type: body.task_type,
        status: 'pending',
        user_id: auth.userId,
        source_generated_image_id: sourceGeneratedImageId,
        prompt_template_id: promptTemplateId,
        layer_template_id: layerTemplateId,
        input_assets_json: inputAssetsJson as any,
        variables_json: variablesJson as any,
        params_json: paramsPayload as any,
        input_snapshot_json: inputSnapshot as any,
        edit_instruction_text: editInstructionText,
        attempt_count: 0,
        max_attempts: 3,
        provider: providerOverride || process.env.GENERATION_PROVIDER || 'openai-image',
      },
    })

    // 防止 unused 警告

    // 审计日志
    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'generation_task_created',
        target_type: 'generation_task',
        target_id: task.id,
        detail_json: { task_type: body.task_type, task_no: taskNo },
      },
    })

    return NextResponse.json(
      {
        data: {
          id: task.id,
          task_no: task.task_no,
          status: task.status,
          created_at: task.created_at,
        },
      },
      { status: 202 }
    )
  } catch (err) {
    console.error('[create-task] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '创建任务失败' } },
      { status: 500 }
    )
  }
}

// GET /api/generation/tasks — 获取当前用户任务列表
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || undefined
    const taskType = searchParams.get('task_type') || undefined
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || searchParams.get('page_size') || '20')

    const where: Record<string, unknown> = { user_id: auth.userId }
    if (status) where.status = status
    if (taskType) where.task_type = taskType

    const [items, total] = await Promise.all([
      prisma.generationTask.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          task_no: true,
          task_type: true,
          status: true,
          created_at: true,
          finished_at: true,
        },
      }),
      prisma.generationTask.count({ where }),
    ])

    return NextResponse.json({
      data: {
        items,
        total,
        page,
        pageSize,
      },
    })
  } catch (err) {
    console.error('[list-tasks] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '获取任务列表失败' } },
      { status: 500 }
    )
  }
}
