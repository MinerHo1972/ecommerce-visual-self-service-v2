// GET /api/assets
// 列表：返回「自己的」+「公开的」。admin 可通过 all=1 看全部。
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { requireAuth } from "@/lib/auth/api-auth"
import { AssetType, AssetVisibility, Prisma } from "@prisma/client"
import { resolveAssetDisplayName } from "@/lib/assets/display-name"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") as AssetType | null
    const visibility = searchParams.get("visibility") as AssetVisibility | null
    const scope = searchParams.get("scope") // "mine" | "public" | "private" | "all"（admin）
    const q = searchParams.get("q")?.trim().slice(0, 100) || ""
    const tag = searchParams.get("tag")?.trim() || ""
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)))

    const accessConditions: Prisma.AssetWhereInput[] = []
    if (scope === "mine") {
      accessConditions.push({ owner_id: auth.userId })
    } else if (scope === "public") {
      accessConditions.push({ visibility: "public" })
    } else if (scope === "private") {
      accessConditions.push({ owner_id: auth.userId, visibility: "private" })
    } else if (scope === "all" && auth.role === "admin") {
      // Admin can explicitly request the complete active asset library.
    } else if (!scope && auth.role === "admin") {
      // The shared asset manager defaults to the complete library for admins.
    } else {
      accessConditions.push({ OR: [{ owner_id: auth.userId }, { visibility: "public" }] })
    }

    const where: Prisma.AssetWhereInput = {
      deleted_at: null,
      ...(type ? { type } : {}),
      ...(visibility ? { visibility } : {}),
      ...(accessConditions.length ? { AND: accessConditions } : {}),
      ...(q
        ? {
            OR: [
              { display_name: { contains: q, mode: "insensitive" } },
              { filename: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tag ? { metadata_json: { path: ["tags"], array_contains: tag } } : {}),
    }

    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        select: {
          id: true,
          type: true,
          filename: true,
          display_name: true,
          width: true,
          height: true,
          visibility: true,
          thumb_tos_key: true,
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
          const { metadata_json: _m, thumb_tos_key, ...rest } = it
          return {
            ...rest,
            display_name: resolveAssetDisplayName(it.display_name, it.filename),
            has_thumb: !!thumb_tos_key,
            is_mine: it.owner_id === auth.userId,
            tags,
          }
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
