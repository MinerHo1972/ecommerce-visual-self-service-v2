import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, JWTPayload } from './jwt'

/**
 * Get the authenticated user from the request cookie.
 * Returns { payload, userId, role } or null.
 */
export async function getApiSession(req: NextRequest): Promise<{
  payload: JWTPayload
  userId: string
  role: string
} | null> {
  const token = req.cookies.get('token')?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return { payload, userId: payload.sub, role: payload.role }
}

/**
 * Require authentication. Returns the session or a 401 response.
 */
export async function requireAuth(req: NextRequest): Promise<
  { payload: JWTPayload; userId: string; role: string } | NextResponse
> {
  const session = await getApiSession(req)
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '未登录' } },
      { status: 401 }
    )
  }
  return session
}

/**
 * Require one of the specified roles. Returns the session or an error response.
 */
export async function requireRole(
  req: NextRequest,
  roles: string[]
): Promise<
  { payload: JWTPayload; userId: string; role: string } | NextResponse
> {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth
  if (!roles.includes(auth.role)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: '无权限执行此操作' } },
      { status: 403 }
    )
  }
  return auth
}
