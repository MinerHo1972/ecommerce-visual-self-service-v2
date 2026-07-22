// POST /api/assets/batch
// 批量操作：delete / set_visibility / add_tags / remove_tags
// 权限：每条 asset 仅 owner 或 admin 可操作
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { requireAuth } from "@/lib/auth/api-auth"
import { AssetVisibility } from "@prisma/client"

type Action =
  | { action: "delete"; ids: string[] }
  | { action: "set_visibility"; ids: string[]; visibility: AssetVisibility }
  | { action: "add_tags"; ids: string[]; tags: string[] }
  | { action: "remove_tags"; ids: string[]; tags: string[] }

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const body = (await req.json().catch(() => ({}))) as Action
    if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "ids 不能为空" } },
        { status: 400 }
      )
    }
    if (body.ids.length > 200) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "单次批量操作不得超过 200 条" } },
        { status: 400 }
      )
    }

    // 加载目标资产并校验权限
    const assets = await prisma.asset.findMany({
      where: { id: { in: body.ids }, deleted_at: null },
      select: { id: true, owner_id: true, filename: true, tos_key: true, metadata_json: true },
    })
    const foundIds = new Set(assets.map((a) => a.id))
    const missing = body.ids.filter((id) => !foundIds.has(id))
    const notAllowed = assets
      .filter((a) => a.owner_id !== auth.userId && auth.role !== "admin")
      .map((a) => a.id)

    if (notAllowed.length > 0) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: `无权操作 ${notAllowed.length} 条资产`, notAllowed } },
        { status: 403 }
      )
    }

    const touchIds = assets.map((a) => a.id)

    if (body.action === "delete") {
      await prisma.asset.updateMany({
        where: { id: { in: touchIds } },
        data: { deleted_at: new Date(), deleted_by: auth.userId },
      })
      await prisma.auditLog.create({
        data: {
          actor_user_id: auth.userId,
          action: "asset_batch_deleted",
          target_type: "asset",
          target_id: touchIds[0],
          detail_json: { count: touchIds.length, ids: touchIds, missing },
          ip: req.headers.get("x-forwarded-for") || null,
          user_agent: req.headers.get("user-agent") || null,
        },
      }).catch(() => {})
    } else if (body.action === "set_visibility") {
      const v = body.visibility
      if (v !== "public" && v !== "private") {
        return NextResponse.json(
          { error: { code: "INVALID_INPUT", message: "visibility 非法" } },
          { status: 400 }
        )
      }
      await prisma.asset.updateMany({
        where: { id: { in: touchIds } },
        data: { visibility: v },
      })
      await prisma.auditLog.create({
        data: {
          actor_user_id: auth.userId,
          action: "asset_batch_visibility",
          target_type: "asset",
          target_id: touchIds[0],
          detail_json: { count: touchIds.length, visibility: v, missing },
          ip: req.headers.get("x-forwarded-for") || null,
          user_agent: req.headers.get("user-agent") || null,
        },
      }).catch(() => {})
    } else if (body.action === "add_tags" || body.action === "remove_tags") {
      const tagsRaw = (body.tags || [])
        .map((t: string) => String(t).trim())
        .filter(Boolean)
      if (tagsRaw.length === 0) {
        return NextResponse.json(
          { error: { code: "INVALID_INPUT", message: "tags 不能为空" } },
          { status: 400 }
        )
      }
      const toAdd = body.action === "add_tags"
      for (const a of assets) {
        const meta = (a.metadata_json && typeof a.metadata_json === "object"
          ? (a.metadata_json as Record<string, unknown>)
          : {}) as Record<string, unknown>
        const cur = Array.isArray(meta.tags)
          ? (meta.tags as unknown[]).filter((x) => typeof x === "string") as string[]
          : []
        let next: string[]
        if (toAdd) {
          const set = new Set(cur)
          tagsRaw.forEach((t) => set.add(t))
          next = Array.from(set)
        } else {
          const rm = new Set(tagsRaw)
          next = cur.filter((t) => !rm.has(t))
        }
        await prisma.asset.update({
          where: { id: a.id },
          data: { metadata_json: { ...meta, tags: next } },
        })
      }
      await prisma.auditLog.create({
        data: {
          actor_user_id: auth.userId,
          action: toAdd ? "asset_batch_add_tags" : "asset_batch_remove_tags",
          target_type: "asset",
          target_id: touchIds[0],
          detail_json: { count: touchIds.length, tags: tagsRaw, missing },
          ip: req.headers.get("x-forwarded-for") || null,
          user_agent: req.headers.get("user-agent") || null,
        },
      }).catch(() => {})
    } else {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "action 非法" } },
        { status: 400 }
      )
    }

    return NextResponse.json({ data: { affected: touchIds.length, missing } })
  } catch (err) {
    console.error("[assets batch] error:", err)
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    )
  }
}
