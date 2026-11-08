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
    <div className="login-page">
      <main className="login-shell">
        <div className="login-card">
          <div className="login-brand" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </div>

          <h1 className="login-title">电商生图工作台</h1>
          <p className="login-subtitle">使用飞书账号登录</p>

          {error && (
            <div className="login-error" role="alert">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={feishuLogin}
            disabled={loading}
            aria-busy={loading}
            className="login-button"
          >
            {loading ? (
              <span className="login-spinner" aria-hidden="true" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4.6 7.4c0-.7.4-1.3 1.1-1.5l6-2c.8-.3 1.7-.3 2.5 0l6 2c.7.2 1.1.8 1.1 1.5v9.2c0 .7-.4 1.3-1.1 1.5l-6 2c-.8.3-1.7.3-2.5 0l-6-2c-.7-.2-1.1-.8-1.1-1.5V7.4z" />
              </svg>
            )}
            <span>{loading ? '跳转中…' : '飞书一键登录'}</span>
          </button>

          <p className="login-hint">请使用企业飞书账号授权登录</p>
        </div>

        <footer className="login-footer">
          <span>© 连咖啡 · 电商技术组</span>
          <span className="login-footer-dot" aria-hidden="true">·</span>
          <span>遇到问题请联系管理员</span>
        </footer>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <main className="login-shell">
            <div className="login-card login-card-loading" role="status" aria-live="polite">
              <div className="login-loading-mark" aria-hidden="true" />
              <p className="login-loading-text">正在加载…</p>
            </div>
          </main>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  )
}
