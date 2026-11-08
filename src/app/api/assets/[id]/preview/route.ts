import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSignedUrl } from "@/lib/tos/tos-client"
import { requireAuth } from "@/lib/auth/api-auth"
import { assetPreviewCacheControl, canReadAsset } from "@/lib/assets/access"
import { getPreviewCache, setPreviewCache } from "@/lib/assets/preview-cache"

export const runtime = "nodejs"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const url = new URL(req.url)
    const variant = url.searchParams.get("variant") // "thumb" | null
    const wantDownload = url.searchParams.get("download") === "1"
    const cacheKey = variant === "thumb" ? `${id}:thumb` : id

    // LRU 命中：跳过 DB 与 TOS 回源。注意缓存命中仍要先过 requireAuth，
    // 未登录/越权在到达缓存前已被拦截。
    const cached = getPreviewCache(cacheKey)
    if (cached) {
      const headers: Record<string, string> = {
        "Content-Type": cached.contentType,
        "Content-Length": String(cached.buffer.length),
        "Cache-Control": "private, max-age=300",
        "X-Cache": "HIT",
      }
      if (wantDownload) {
        // 用 attachment 让浏览器真正触发下载（<a download> 在跨源/内联响应下不一定生效）
        // 缓存命中时没有 asset 上下文，先用通用名；MISS 路径会用真实文件名。
        headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent("image.png")}`
      }
      return new NextResponse(new Uint8Array(cached.buffer), { headers })
    }

    const directAsset = await prisma.asset.findUnique({ where: { id } })
    const generatedImage = directAsset
      ? null
      : await prisma.generatedImage.findUnique({ where: { id }, include: { asset: true } })
    const asset = directAsset || generatedImage?.asset

    if (!asset || asset.deleted_at || generatedImage?.deleted_at) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "资产不存在" } },
        { status: 404 }
      )
    }
    if (!canReadAsset(auth, asset)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "无权访问" } },
        { status: 403 }
      )
    }

    // B 方案：variant=thumb 且有缩略图时回源缩略图，否则原图。
    const useThumb = variant === "thumb" && asset.thumb_tos_key
    const sourceKey = useThumb ? asset.thumb_tos_key! : asset.tos_key
    const signed = getSignedUrl(sourceKey, 300)
    const r = await fetch(signed, { redirect: "follow" })
    if (!r.ok) return NextResponse.json({ error: "upstream error" }, { status: 502 })
    const buf = Buffer.from(await r.arrayBuffer())
    const ctype = r.headers.get("content-type") || (useThumb ? "image/jpeg" : "image/png")

    // 写入进程内 LRU（≤2MB 的图才缓存）
    setPreviewCache(cacheKey, buf, ctype)

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": ctype,
        "Content-Length": String(buf.length),
        "Cache-Control": assetPreviewCacheControl(asset.visibility),
        "X-Cache": "MISS",
        "Content-Disposition": wantDownload
          ? `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename || "image.png")}`
          : `inline; filename="${encodeURIComponent(asset.filename || "image.png")}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "err" }, { status: 500 })
  }
}
