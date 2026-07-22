import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSignedUrl } from "@/lib/tos/tos-client"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    let tosKey: string | null = null
    let filename = "image.png"
    const a = await prisma.asset.findUnique({ where: { id } })
    if (a) { tosKey = a.tos_key; filename = a.filename || "image.png" }
    else {
      const gi = await prisma.generatedImage.findUnique({ where: { id }, include: { asset: true } })
      if (gi?.asset) { tosKey = gi.asset.tos_key; filename = gi.asset.filename || `generated-${gi.id}.png` }
    }
    if (!tosKey) return NextResponse.json({ error: "not found" }, { status: 404 })

    const signed = getSignedUrl(tosKey, 300)
    const r = await fetch(signed, { redirect: "follow" })
    if (!r.ok) return NextResponse.json({ error: "upstream error" }, { status: 502 })
    const buf = Buffer.from(await r.arrayBuffer())
    const ctype = r.headers.get("content-type") || "image/png"
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
