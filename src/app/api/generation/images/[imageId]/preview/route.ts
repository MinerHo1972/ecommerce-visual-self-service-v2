import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSignedUrl } from "@/lib/tos/tos-client"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params
    const gi = await prisma.generatedImage.findUnique({ where: { id: imageId }, include: { asset: true } })
    if (!gi?.asset?.tos_key) return NextResponse.json({ error: "not found" }, { status: 404 })
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
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "err" }, { status: 500 })
  }
}
