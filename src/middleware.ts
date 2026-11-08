import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/health']

// Route prefix -> roles allowed to access
// admin 可以访问全部业务页面；operator/designer 只能访问自己的页面
const ROLE_ROUTES: Record<string, string[]> = {
  '/assets': ['operator', 'designer', 'admin'],
  '/operator': ['operator', 'admin'],
  '/designer': ['designer', 'admin'],
  '/admin': ['admin'],
}

function roleHome(role: string): string {
  // admin 默认进入运营工作台（后续可切 /admin 做配置管理）
  if (role === 'admin') return '/operator'
  return `/${role}`
}

function clearTokenAndRedirect(url: string, req: NextRequest) {
  const res = NextResponse.redirect(new URL(url, req.url))
  res.cookies.set('token', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
  return res
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // / 根路径：已登录按角色回首页，未登录去登录页
  if (pathname === '/') {
    const token = req.cookies.get('token')?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) {
        return NextResponse.redirect(new URL(roleHome(payload.role), req.url))
      }
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // /login always cleans stale cookie; if cookie is valid send user to role home
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    const token = req.cookies.get('token')?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) {
        return NextResponse.redirect(new URL(roleHome(payload.role), req.url))
      }
      const res = NextResponse.next()
      res.cookies.set('token', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      })
      return res
    }
    return NextResponse.next()
  }

  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) {
    return NextResponse.next()
  }

  // Allow auth API routes
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  // Check if this is a protected page route
  const matched = Object.entries(ROLE_ROUTES).find(([prefix]) =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  )

  if (matched) {
    const [prefix, allowed] = matched
    const token = req.cookies.get('token')?.value

    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return clearTokenAndRedirect('/login', req)
    }

    if (!allowed.includes(payload.role)) {
      // 权限不足，回到自己的首页
      return NextResponse.redirect(new URL(roleHome(payload.role), req.url))
    }

    return NextResponse.next()
  }

  // API routes (other than auth and health) require auth token
  if (pathname.startsWith('/api/')) {
    const token = req.cookies.get('token')?.value
    if (!token) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '未登录' } },
        { status: 401 }
      )
    }
    const payload = await verifyToken(token)
    if (!payload) {
      const res = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Token 无效' } },
        { status: 401 }
      )
      res.cookies.set('token', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      })
      return res
    }
    // admin API 全放行；其它角色按前缀控制（后续扩展）
    if (payload.role !== 'admin') {
      const apiMatched = Object.entries(ROLE_ROUTES).find(([prefix]) =>
        pathname.startsWith(`/api${prefix}`)
      )
      if (apiMatched) {
        const allowed = apiMatched[1]
        if (!allowed.includes(payload.role)) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '权限不足' } },
            { status: 403 }
          )
        }
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
