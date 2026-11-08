import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSignedUrl } from "@/lib/tos/tos-client"
import { requireAuth } from "@/lib/auth/api-auth"
import { assetPreviewCacheControl, canReadAsset } from "@/lib/assets/access"

export const runtime = "nodejs"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const { imageId } = await params
    const gi = await prisma.generatedImage.findUnique({ where: { id: imageId }, include: { asset: true } })
    if (!gi?.asset?.tos_key || gi.deleted_at || gi.asset.deleted_at) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "生成图不存在" } },
        { status: 404 }
      )
    }
    if (!canReadAsset(auth, gi.asset)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "无权访问" } },
        { status: 403 }
      )
    }
    const signed = getSignedUrl(gi.asset.tos_key, 300)
    const r = await fetch(signed, { redirect: "follow" })
    if (!r.ok) return NextResponse.json({ error: "upstream error" }, { status: 502 })
    const buf = Buffer.from(await r.arrayBuffer())
    const ctype = r.headers.get("content-type") || "image/png"
    const filename = gi.asset.filename || `generated-${gi.id}.png`
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ctype,
        "Content-Length": String(buf.length),
        "Cache-Control": assetPreviewCacheControl(gi.asset.visibility),
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "err" }, { status: 500 })
  }
}
