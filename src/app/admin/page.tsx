'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import UsersPage from './users/page'

interface UserInfo {
  id: string
  name: string
  email: string
  role: string
  avatar_url?: string | null
}

type Nav = 'users' | 'system' | 'stats'

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [nav, setNav] = useState<Nav>('users')

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.data?.user) setUser(data.data.user)
        else router.push('/login')
      })
  }, [router])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (!user) return <div style={{ padding: '20px', maxWidth: 1280, margin: '0 auto' }}><div className="evss-card" style={{ padding: 32, color: '#94a3b8', textAlign: 'center' }}>加载中…</div></div>

  return (
    <div style={{ padding: '20px', maxWidth: 1280, margin: '0 auto' }}>
      <div className="evss-admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="evss-logo-badge" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}>V2</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0f172a' }}>电商生图工作台</h2>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>管理控制台 · admin</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/operator" className="evss-link">← 返回工作台</a>
          {user.avatar_url && <img src={user.avatar_url} style={{ width: 32, height: 32, borderRadius: '50%' }} alt="" />}
          <span style={{ fontSize: 13, color: '#475569' }}>{user.name}</span>
          <button className="evss-btn evss-btn-sm" onClick={handleLogout}>退出</button>
        </div>
      </div>

      <div className="evss-admin-layout">
        <aside className="evss-admin-side">
          <div className="evss-side-title">系统管理</div>
          <button className={`evss-side-item ${nav === 'users' ? 'active' : ''}`} onClick={() => setNav('users')}>👥 用户管理</button>
          <button className={`evss-side-item ${nav === 'system' ? 'active' : ''}`} disabled onClick={() => setNav('system')}>⚙️ 系统配置</button>
          <button className={`evss-side-item ${nav === 'stats' ? 'active' : ''}`} disabled onClick={() => setNav('stats')}>📊 用量统计</button>
          <div className="evss-side-hint">配置/统计模块后续开放</div>
        </aside>
        <main className="evss-admin-main">
          {nav === 'users' && <UsersPage />}
          {nav === 'system' && <div className="evss-card" style={{ padding: 32, color: '#94a3b8' }}>系统配置（建设中）</div>}
          {nav === 'stats' && <div className="evss-card" style={{ padding: 32, color: '#94a3b8' }}>用量统计（建设中）</div>}
        </main>
      </div>
    </div>
  )
}
