import { NextRequest, NextResponse } from 'next/server'
import { renderTemplate } from '@/lib/render/engine'
import { prisma } from '@/lib/db/prisma'
import { getSignedUrl } from '@/lib/tos/tos-client'
import { requireRole } from '@/lib/auth/api-auth'
import { validateVariables } from '@/lib/templates/validate-template'

/**
 * POST /api/layer-templates/preview
 * Permission: admin, designer, operator (operator: active templates only)
 *
 * S5b changes:
 * - template_id is the productized main path
 * - config_json (Spike legacy) restricted to admin/designer + debug=true
 * - Returns render_meta with timing, output size, font status
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'designer', 'operator'])
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const { template_id, config_json, variables, product_image_asset_id, debug } = body

    let renderConfig: Record<string, unknown> | null = null
    let renderVariables: Record<string, unknown> = {}
    let varSchema: unknown = null
    let templateSource: 'db' | 'config_json' = 'db'

    // ── Mode A: template_id (main path) ──
    if (template_id) {
      const template = await prisma.layerTemplate.findUnique({ where: { id: template_id } })

      if (!template) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: '模板不存在' } }, { status: 404 })
      }

      // Operators can only preview published templates
      if (auth.role === 'operator' && template.status !== 'published') {
        return NextResponse.json({ error: { code: 'FORBIDDEN', message: '无权限预览此模板' } }, { status: 403 })
      }

      renderConfig = template.config_json as Record<string, unknown>
      varSchema = template.variable_definitions_json
      renderVariables = variables || {}
      templateSource = 'db'
    } else if (config_json) {
      // ── Mode B: config_json (Spike legacy — restricted) ──
      // S5b: Only admin/designer with debug=true can use this path
      if (auth.role === 'operator') {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Operator 不支持临时 config_json 预览，请使用 template_id' } },
          { status: 403 }
        )
      }
      if (!debug) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: '临时 config_json 预览需要 debug=true' } },
          { status: 403 }
        )
      }

      renderConfig = config_json
      renderVariables = variables || {}
      templateSource = 'config_json'
    } else {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: '需要提供 template_id 或 config_json' } },
        { status: 400 }
      )
    }

    // Validate config_json structure
    if (!renderConfig || !renderConfig.canvas || !renderConfig.layers) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'config_json 需包含 canvas 和 layers' } },
        { status: 400 }
      )
    }

    // product_image_asset_id is the productized asset input for the special productImage slot.
    // Keep other variables strict, but do not require callers to duplicate productImage in variables.
    if (product_image_asset_id && renderVariables.productImage === undefined) {
      renderVariables = { ...renderVariables, productImage: product_image_asset_id }
    }

    // Validate variables against schema
    if (varSchema) {
      const varCheck = validateVariables(renderVariables, varSchema)
      if (!varCheck.valid) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: varCheck.errors.join('; ') } },
          { status: 422 }
        )
      }
    }

    // Fetch product image from TOS if asset_id provided
    let productImageBuffer: Buffer | null = null
    if (product_image_asset_id) {
      const asset = await prisma.asset.findUnique({ where: { id: product_image_asset_id } })

      if (!asset || asset.deleted_at) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: '商品图资产不存在' } },
          { status: 404 }
        )
      }

      const url = getSignedUrl(asset.tos_key)
      const imgRes = await fetch(url)
      if (!imgRes.ok) {
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: '无法获取商品图' } },
          { status: 500 }
        )
      }
      productImageBuffer = Buffer.from(await imgRes.arrayBuffer())
    }

    // Render
    const result = await renderTemplate(
      renderConfig as any,
      renderVariables as Record<string, string>,
      productImageBuffer,
      {
        templateId: template_id,
        templateSource,
      }
    )

    const base64 = `data:image/png;base64,${result.imageBuffer.toString('base64')}`

    return NextResponse.json({
      data: {
        preview_url: base64,
        quality_check: result.qualityCheck,
        render_meta: result.renderMeta,
      },
    })
  } catch (err) {
    console.error('[preview] error:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '渲染失败' } },
      { status: 500 }
    )
  }
}
