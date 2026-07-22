// GET /api/auth/feishu/callback
// 飞书 OAuth 回调：换 token → 拉用户信息 → 建/找用户 → 发 JWT cookie
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { signToken } from "@/lib/auth/jwt"
import { exchangeCode, getUserInfo } from "@/lib/auth/feishu"

const ALLOWED_FEISHU_DOMAINS = ["@lianchi.shop", "@shop.local"]

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const stateParam = url.searchParams.get("state") || ""
  const cookieState = req.cookies.get("feishu_oauth_state")?.value || ""

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`

  const fail = (msg: string) => {
    const res = NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent(msg)}`)
    res.cookies.set("feishu_oauth_state", "", { path: "/", maxAge: 0 })
    return res
  }

  if (!code) return fail("missing_code")
  if (stateParam !== cookieState) return fail("invalid_state")

  try {
    // 1. 换 access_token（只返回 token，不含用户信息）
    const token = await exchangeCode(code)
    if (!token.access_token) return fail("exchange_failed")

    // 2. 用 access_token 拉用户信息（open_id/name/avatar/email）
    const info = await getUserInfo(token.access_token)
    if (!info.open_id) return fail("missing_open_id")

    // 3. 邮箱白名单校验（dev 阶段放宽）
    const email = info.enterprise_email || info.email || ""
    if (ALLOWED_FEISHU_DOMAINS.length > 0 && email) {
      const ok = ALLOWED_FEISHU_DOMAINS.some((d) => email.endsWith(d))
      if (!ok) {
        console.warn(`[feishu login] email ${email} not in allowed domains, allowing for dev`)
      }
    }
    const accountEmail = email || `feishu_${info.open_id}@shop.local`

    // 4. upsert 用户：按 feishu_open_id 找
    let user = await prisma.user.findUnique({ where: { feishu_open_id: info.open_id } })
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email: accountEmail } })
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            feishu_open_id: info.open_id,
            feishu_union_id: info.union_id,
            avatar_url: info.avatar_url || byEmail.avatar_url,
            name: byEmail.name || info.name,
          },
        })
      } else {
        user = await prisma.user.create({
          data: {
            name: info.name || `飞书用户_${info.open_id.slice(-6)}`,
            email: accountEmail,
            password_hash: `__feishu__${info.open_id}`,
            role: "operator",
            status: "active",
            feishu_open_id: info.open_id,
            feishu_union_id: info.union_id,
            avatar_url: info.avatar_url || null,
          },
        })
      }
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          avatar_url: info.avatar_url || user.avatar_url,
          name: info.name || user.name,
        },
      })
    }

    if (user.status !== "active") return fail("user_suspended")

    // 5. 发 JWT cookie
    const jwtToken = await signToken({
      sub: user.id,
      role: user.role,
      email: user.email,
    })

    let from = user.role === "admin" ? "/operator" : "/" + user.role
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString())
      if (parsed.from && typeof parsed.from === "string" && parsed.from.startsWith("/")) {
        from = parsed.from
      }
    } catch {}

    const res = NextResponse.redirect(`${baseUrl}${from}`)
    res.cookies.set("token", jwtToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: baseUrl.startsWith("https"),
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    })
    res.cookies.set("feishu_oauth_state", "", { path: "/", maxAge: 0 })

    await prisma.auditLog.create({
      data: {
        actor_user_id: user.id,
        action: "login_feishu",
        target_type: "auth",
        target_id: user.id,
        detail_json: { feishu_open_id: info.open_id, email: accountEmail, name: info.name },
        ip: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      },
    }).catch(() => {})

    console.log(`[feishu login] success: ${info.name} (${info.open_id}) → ${user.role} → ${from}`)
    return res
  } catch (err) {
    console.error("[feishu callback] error:", err)
    return fail("auth_failed")
  }
}
