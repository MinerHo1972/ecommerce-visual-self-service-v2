'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface UserInfo {
  id: string
  name: string
  email: string
  role: string
}

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.data?.user) {
          setUser(data.data.user)
        } else {
          router.push('/login')
        }
      })
  }, [router])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">加载中...</div>
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">电商生图工作台 <span className="muted font-normal">— 管理员</span></h1>
            <span className="eyebrow">V2 · P0 精装版</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm muted">欢迎，{user.name}（管理员）</span>
            <button onClick={handleLogout} className="button">退出登录</button>
          </div>
        </div>
      </header>
      <main className="page">
        <div className="panel">
          <div className="panel-head"><h2 className="panel-title">管理工作台</h2></div>
          <div className="p-6 muted">
            <p>管理工作台首页（S3 占位）。后续将接入用户管理、系统配置、用量统计等功能。</p>
          </div>
        </div>
      </main>
    </div>
  )
}
