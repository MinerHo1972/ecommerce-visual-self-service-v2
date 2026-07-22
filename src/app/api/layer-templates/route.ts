import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { TemplateStatus } from '@prisma/client'
import { requireRole } from '@/lib/auth/api-auth'
import { validateConfigJson, validateVariablesSchema, validateSlotConsistency } from '@/lib/templates/validate-template'

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'designer'])
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const { name, description, config_json, variables_schema } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'name 必填 (1-80字符)' } }, { status: 400 })
    }
    if (name.length > 80) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'name 最大 80 字符' } }, { status: 400 })
    }
    if (!config_json) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'config_json 必填' } }, { status: 400 })
    }
    if (!variables_schema) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'variables_schema 必填' } }, { status: 400 })
    }

    const configCheck = validateConfigJson(config_json)
    if (!configCheck.valid) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: configCheck.errors.join('; ') } }, { status: 422 })
    }
    const varSchemaCheck = validateVariablesSchema(variables_schema)
    if (!varSchemaCheck.valid) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: varSchemaCheck.errors.join('; ') } }, { status: 422 })
    }
    const slotCheck = validateSlotConsistency(config_json, variables_schema)
    if (!slotCheck.valid) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: slotCheck.errors.join('; ') } }, { status: 422 })
    }

    const canvas = config_json.canvas || {}
    const width = canvas.width || 800
    const height = canvas.height || 800

    const template = await prisma.layerTemplate.create({
      data: {
        name: name.trim(),
        description: description || null,
        scene: body.scene || 'main',
        platform: body.platform || 'tmall',
        width,
        height,
        config_json,
        variable_definitions_json: variables_schema,
        status: 'draft',
        created_by: auth.userId,
      },
    })

    await prisma.auditLog.create({
      data: {
        actor_user_id: auth.userId,
        action: 'layer_template_created',
        target_type: 'layer_template',
        target_id: template.id,
        detail_json: { name: template.name },
      },
    })

    return NextResponse.json({
      data: { id: template.id, name: template.name, status: 'draft', created_at: template.created_at },
    }, { status: 201 })
  } catch (err) {
    console.error('[layer-templates create] error:', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'designer', 'operator'])
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '20', 10)))

    let statusFilter: TemplateStatus[] | undefined
    const statusParam = searchParams.get('status')

    if (auth.role === 'operator') {
      statusFilter = ['published' as TemplateStatus]
    } else if (statusParam) {
      const dbStatus = statusParam === 'active' ? 'published' : statusParam
      statusFilter = [dbStatus as TemplateStatus]
    }

    const where = {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    }

    const [items, total] = await Promise.all([
      prisma.layerTemplate.findMany({
        where,
        select: { id: true, name: true, description: true, status: true, width: true, height: true, created_at: true, updated_at: true },
        orderBy: { updated_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.layerTemplate.count({ where }),
    ])

    const mappedItems = items.map((t) => ({ ...t, status: t.status === 'published' ? 'active' : t.status }))

    return NextResponse.json({
      data: { items: mappedItems, pagination: { page, page_size: pageSize, total } },
    })
  } catch (err) {
    console.error('[layer-templates list] error:', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, { status: 500 })
  }
}
