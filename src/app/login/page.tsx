'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function LoginInner() {
  const searchParams = useSearchParams()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const err = searchParams.get('error')
    if (err) {
      const map: Record<string, string> = {
        missing_code: '授权失败，请重试',
        invalid_state: '授权状态无效，请重试',
        exchange_failed: '飞书授权失败',
        missing_email: '飞书账号未绑定邮箱，请联系管理员',
        user_suspended: '账号已被停用',
        auth_failed: '飞书登录失败',
        feishu_init_failed: '飞书登录初始化失败',
      }
      setError(map[err] || '登录失败')
    }
  }, [searchParams])

  function feishuLogin() {
    setLoading(true)
    window.location.href = '/api/auth/feishu/login'
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4"
      style={{ background: 'var(--background)' }}
    >
      <div className="w-full flex flex-col items-center" style={{ maxWidth: 360 }}>
        {/* Logo & brand */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-sm"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-center" style={{ color: 'var(--foreground)' }}>
          电商生图工作台
        </h1>
        <p className="text-sm mt-1.5 mb-7 text-center" style={{ color: 'var(--muted)' }}>
          使用飞书账号登录
        </p>

        {/* Card */}
        <div
          className="w-full rounded-xl p-7 shadow-sm flex flex-col items-center"
          style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
        >
          {error && (
            <div
              className="w-full mb-5 px-3 py-2.5 rounded-lg text-sm text-center"
              style={{ background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca' }}
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={feishuLogin}
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
            style={{ background: 'var(--primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.6 7.4c0-.7.4-1.3 1.1-1.5l6-2c.8-.3 1.7-.3 2.5 0l6 2c.7.2 1.1.8 1.1 1.5v9.2c0 .7-.4 1.3-1.1 1.5l-6 2c-.8.3-1.7.3-2.5 0l-6-2c-.7-.2-1.1-.8-1.1-1.5V7.4z" />
            </svg>
            {loading ? '跳转中...' : '飞书一键登录'}
          </button>

          <p className="text-xs text-center mt-5" style={{ color: 'var(--muted)' }}>
            请使用企业飞书账号授权登录
          </p>
        </div>

        <p className="text-xs text-center mt-6" style={{ color: 'var(--muted)' }}>
          © 连咖啡 · 电商技术组
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen w-full flex items-center justify-center"
          style={{ background: 'var(--background)' }}
        >
          <div className="text-sm" style={{ color: 'var(--muted)' }}>加载中...</div>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  )
}
