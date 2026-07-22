import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/api-auth'
import { validateConfigJson, validateVariablesSchema, validateSlotConsistency } from '@/lib/templates/validate-template'

/**
 * GET /api/layer-templates/:id — Template detail
 * Permission: admin, designer, operator (operator: active only)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'designer', 'operator'])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const template = await prisma.layerTemplate.findUnique({ where: { id } })

    if (!template) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: '模板不存在' } }, { status: 404 })
    }

    // Operators can only view published templates
    if (auth.role === 'operator' && template.status !== 'published') {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: '模板不存在' } }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        id: template.id,
        name: template.name,
        description: template.description,
        status: template.status === 'published' ? 'active' : template.status,
        config_json: template.config_json,
        variables_schema: template.variable_definitions_json,
        width: template.width,
        height: template.height,
        created_at: template.created_at,
        updated_at: template.updated_at,
      },
    })
  } catch (err) {
    console.error('[layer-templates detail] error:', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, { status: 500 })
  }
}

/**
 * PATCH /api/layer-templates/:id — Update template
 * Permission: admin, designer
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'designer'])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const template = await prisma.layerTemplate.findUnique({ where: { id } })

    if (!template) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: '模板不存在' } }, { status: 404 })
    }

    const body = await req.json()
    const updates: Record<string, unknown> = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 80) {
        return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'name 必须是 1-80 字符' } }, { status: 400 })
      }
      updates.name = body.name.trim()
    }
    if (body.description !== undefined) {
      updates.description = body.description || null
    }

    // Handle config_json update
    if (body.config_json !== undefined) {
      const configCheck = validateConfigJson(body.config_json)
      if (!configCheck.valid) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: configCheck.errors.join('; ') } }, { status: 422 })
      }
      updates.config_json = body.config_json
      const canvas = body.config_json.canvas || {}
      if (canvas.width) updates.width = canvas.width
      if (canvas.height) updates.height = canvas.height
    }

    // Handle variables_schema update
    if (body.variables_schema !== undefined) {
      const varCheck = validateVariablesSchema(body.variables_schema)
      if (!varCheck.valid) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: varCheck.errors.join('; ') } }, { status: 422 })
      }
      updates.variable_definitions_json = body.variables_schema
    }

    // If both config and schema updated, check slot consistency
    const finalConfig = body.config_json ?? template.config_json
    const finalVarSchema = body.variables_schema ?? template.variable_definitions_json
    if (body.config_json !== undefined || body.variables_schema !== undefined) {
      const slotCheck = validateSlotConsistency(finalConfig, finalVarSchema)
      if (!slotCheck.valid) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: slotCheck.errors.join('; ') } }, { status: 422 })
      }
    }

    // Handle status update
    if (body.status !== undefined) {
      // Map API status to DB status
      let dbStatus = body.status
      if (body.status === 'active') dbStatus = 'published'

      if (template.status === 'archived' && body.status === 'draft') {
        // Allow restoring from archived to draft
      } else if (template.status === 'archived' && body.status !== 'draft') {
        return NextResponse.json({ error: { code: 'INVALID_INPUT', message: '已归档模板只能恢复为 draft' } }, { status: 400 })
      }

      // If setting to published (active), must pass full validation
      if (dbStatus === 'published') {
        const fullConfigCheck = validateConfigJson(finalConfig)
        const fullVarCheck = validateVariablesSchema(finalVarSchema)
        const fullSlotCheck = validateSlotConsistency(finalConfig, finalVarSchema)
        if (!fullConfigCheck.valid || !fullVarCheck.valid || !fullSlotCheck.valid) {
          const allErrors = [...fullConfigCheck.errors, ...fullVarCheck.errors, ...fullSlotCheck.errors]
          return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: `发布前校验失败: ${allErrors.join('; ')}` } }, { status: 422 })
        }
      }

      updates.status = dbStatus
    }

    const updated = await prisma.layerTemplate.update({
      where: { id },
      data: updates,
    })

    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'layer_template_updated',
        target_type: 'layer_template',
        target_id: id,
        detail_json: { fields: Object.keys(updates) },
      },
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        name: updated.name,
        status: updated.status === 'published' ? 'active' : updated.status,
        updated_at: updated.updated_at,
      },
    })
  } catch (err) {
    console.error('[layer-templates update] error:', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, { status: 500 })
  }
}

/**
 * DELETE /api/layer-templates/:id — Archive (soft delete)
 * Permission: admin, designer
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'designer'])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const template = await prisma.layerTemplate.findUnique({ where: { id } })

    if (!template) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: '模板不存在' } }, { status: 404 })
    }

    await prisma.layerTemplate.update({
      where: { id },
      data: { status: 'archived' },
    })

    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'layer_template_archived',
        target_type: 'layer_template',
        target_id: id,
        detail_json: { name: template.name },
      },
    })

    return NextResponse.json({ data: { id, status: 'archived' } })
  } catch (err) {
    console.error('[layer-templates delete] error:', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, { status: 500 })
  }
}
