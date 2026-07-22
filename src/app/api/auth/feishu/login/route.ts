// GET /api/auth/feishu/login
// 跳转到飞书 OAuth 授权页
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { buildAuthUrl } from "@/lib/auth/feishu"

export async function GET(req: NextRequest) {
  try {
    // 简单 state：随机值 + redirect_from（可选）
    const state = crypto.randomBytes(16).toString("hex")
    const from = new URL(req.url).searchParams.get("from") || "/operator"
    const statePayload = Buffer.from(JSON.stringify({ s: state, from })).toString("base64url")

    const url = buildAuthUrl(statePayload)

    // state 存在 cookie 供 callback 校验（10 分钟有效）
    const res = NextResponse.redirect(url)
    res.cookies.set("feishu_oauth_state", statePayload, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    })
    return res
  } catch (err) {
    console.error("[feishu login] error:", err)
    return NextResponse.redirect(
      new URL(`/login?error=feishu_init_failed`, req.url)
    )
  }
}
