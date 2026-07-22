/**
 * 飞书 OAuth 客户端（P1 权限系统）
 * 直接对齐 gift-purchase-web 线上验证过的实现，避免重新踩协议坑。
 *
 * 授权端点：GET https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=...&redirect_uri=...&state=...
 * 换 token：POST https://open.feishu.cn/open-apis/authen/v1/oidc/access_token
 *           Header: Authorization: Bearer <app_access_token>
 *           Body: { grant_type: "authorization_code", code }
 * 拿 app_access_token：POST https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal
 *                      Body: { app_id, app_secret }
 * 用户信息：GET https://open.feishu.cn/open-apis/authen/v1/user_info
 *           Header: Authorization: Bearer <access_token>  (来自换 token 返回的 access_token 字段)
 */

const FEISHU_HOST = "https://open.feishu.cn/open-apis"

export interface FeishuTokenResp {
  access_token: string
  refresh_token?: string
  expires_in: number
  name?: string
  en_name?: string
  avatar_url?: string
  avatar_thumb?: string
  avatar_middle?: string
  avatar_big?: string
  open_id: string
  union_id?: string
  email?: string
  user_id?: string
  mobile?: string
}

export interface FeishuUserInfo {
  open_id: string
  union_id?: string
  name: string
  avatar_url?: string
  email?: string
  enterprise_email?: string
}

let appTokenCache: { token: string; expireAt: number } | null = null

async function getAppAccessToken(): Promise<string> {
  const now = Date.now()
  if (appTokenCache && appTokenCache.expireAt - now > 60_000) {
    return appTokenCache.token
  }
  const resp = await fetch(`${FEISHU_HOST}/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID!,
      app_secret: process.env.FEISHU_APP_SECRET!,
    }),
  })
  const json = await resp.json()
  if (json.code !== 0) {
    throw new Error(`feishu app_access_token failed: ${json.code} ${json.msg}`)
  }
  console.log("[feishu app_access_token] code=", json.code, "expire=", json.expire)
  appTokenCache = {
    token: json.app_access_token,
    expireAt: now + (json.expire || 7200) * 1000,
  }
  return appTokenCache.token
}

/**
 * 用授权码换 access_token（/authen/v1/oidc/access_token + Bearer app_access_token）
 * 返回只含 access_token，用户信息需再调 getUserInfo。
 */
export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const appAccessToken = await getAppAccessToken()
  const resp = await fetch(`${FEISHU_HOST}/authen/v1/oidc/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
    }),
  })
  const json = await resp.json()
  console.log("[feishu oidc/access_token] resp.code=", json.code, "scope=", json.data?.scope)
  if (json.code !== 0) {
    throw new Error(`feishu token exchange failed: code=${json.code} msg=${json.msg}`)
  }
  return json.data
}

/**
 * 用 user_access_token 拉用户信息
 */
export async function getUserInfo(userAccessToken: string): Promise<FeishuUserInfo> {
  const resp = await fetch(`${FEISHU_HOST}/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  })
  const json = await resp.json()
  console.log("[feishu user_info] code=", json.code, "data keys=", json.data ? Object.keys(json.data) : null)
  if (json.code !== 0) {
    throw new Error(`feishu user_info failed: ${json.code} ${json.msg}`)
  }
  const d = json.data
  return {
    open_id: d.open_id,
    union_id: d.union_id,
    name: d.name,
    avatar_url: d.avatar_url || d.avatar_thumb || undefined,
    email: d.email,
    enterprise_email: d.enterprise_email,
  }
}

/**
 * 生成授权跳转 URL
 * 注意：必须带 scope=contact:user.base:readonly，否则 user_info 拿不到姓名/邮箱
 */
export function buildAuthUrl(state: string): string {
  const redirectUri = process.env.FEISHU_REDIRECT_URI!
  const appId = process.env.FEISHU_APP_ID!
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: "contact:user.base:readonly",
  })
  return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`
}
