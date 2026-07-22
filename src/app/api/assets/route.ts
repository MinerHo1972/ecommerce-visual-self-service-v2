// GET /api/assets
// 列表：返回「自己的」+「公开的」。admin 可通过 all=1 看全部。
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { requireAuth } from "@/lib/auth/api-auth"
import { AssetType, AssetVisibility } from "@prisma/client"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") as AssetType | null
    const visibility = searchParams.get("visibility") as AssetVisibility | null
    const scope = searchParams.get("scope") // "mine" | "public" | "private" | "all"（admin）
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)))

    const where: Record<string, unknown> = {
      deleted_at: null,
      ...(type ? { type } : {}),
      ...(visibility ? { visibility } : {}),
    }

    if (scope === "mine") {
      where.owner_id = auth.userId
    } else if (scope === "public") {
      where.visibility = "public"
    } else if (scope === "private") {
      // 我自己的私有资产
      where.owner_id = auth.userId
      where.visibility = "private"
    } else if (scope === "all" && auth.role === "admin") {
      // admin 看全部：不追加 owner/visibility 条件
    } else {
      // 默认 all（非 admin）：我的 + 公开的
      where.OR = [
        { owner_id: auth.userId },
        { visibility: "public" },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        select: {
          id: true,
          type: true,
          filename: true,
          width: true,
          height: true,
          visibility: true,
          owner_id: true,
          owner: { select: { name: true, avatar_url: true } },
          metadata_json: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.asset.count({ where }),
    ])

    return NextResponse.json({
      data: {
        items: items.map((it) => {
          const meta = (it.metadata_json && typeof it.metadata_json === "object"
            ? (it.metadata_json as Record<string, unknown>)
            : {}) as Record<string, unknown>
          const tags = Array.isArray(meta.tags)
            ? (meta.tags as unknown[]).filter((x) => typeof x === "string") as string[]
            : []
          const { metadata_json: _m, ...rest } = it
          return { ...rest, is_mine: it.owner_id === auth.userId, tags }
        }),
        total,
        page,
        pageSize,
      },
    })
  } catch (err) {
    console.error("[assets list] error:", err)
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    )
  }
}
