import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({
    data: null,
    message: '已退出',
  })

  response.cookies.set('token', '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  return response
}
