'use client'

import { useState, useEffect, useCallback } from 'react'

type Role = 'operator' | 'designer' | 'admin'
type UserStatus = 'active' | 'suspended'

interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  feishu_open_id: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

const ROLE_LABEL: Record<Role, string> = { operator: '运营', designer: '设计师', admin: '管理员' }
const ROLE_COLOR: Record<Role, string> = { operator: '#0d9488', designer: '#6366f1', admin: '#dc2626' }

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString('zh-CN', { hour12: false }) } catch { return s }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [me, setMe] = useState<UserRow | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [edit, setEdit] = useState<UserRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2200)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const meRes = await fetch('/api/auth/me').then(r => r.json())
      const meData = meRes.data?.user
      if (meData) setMe({ ...meData, feishu_open_id: meData.feishu_open_id || null, avatar_url: meData.avatar_url || null, created_at: '', updated_at: '' })
      const res = await fetch('/api/admin/users').then(r => r.json())
      if (res.data?.items) setUsers(res.data.items)
      else showToast(res.error?.message || '加载失败', 'err')
    } catch (e: any) { showToast(e.message || '加载失败', 'err') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json())
      if (res.error) throw new Error(res.error.message)
      setUsers(list => list.map(u => u.id === id ? { ...u, ...res.data as UserRow } : u))
      showToast('已保存')
    } catch (e: any) { showToast(e.message || '操作失败', 'err') }
    finally { setBusy(false) }
  }

  async function toggleStatus(u: UserRow) {
    const next: UserStatus = u.status === 'active' ? 'suspended' : 'active'
    if (next === 'suspended' && u.id === me?.id) { showToast('不能停用自己', 'err'); return }
    await patch(u.id, { status: next })
  }

  async function onDelete(u: UserRow) {
    if (!confirm(`确认删除用户「${u.name}」？该操作不可撤销。`)) return
    if (u.id === me?.id) { showToast('不能删除自己', 'err'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' }).then(r => r.json())
      if (res.error) throw new Error(res.error.message)
      setUsers(list => list.filter(x => x.id !== u.id))
      showToast('已删除')
      load()
    } catch (e: any) { showToast(e.message || '删除失败', 'err') }
    finally { setBusy(false) }
  }

  async function onCreate(data: { name: string; email?: string; password: string; role: Role }) {
    setBusy(true)
    try {
      if (!data.email) throw new Error('邮箱必填')
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json())
      if (res.error) throw new Error(res.error.message)
      showToast('已创建')
      setCreating(false)
      load()
    } catch (e: any) { showToast(e.message || '创建失败', 'err') }
    finally { setBusy(false) }
  }

  const filtered = users.filter(u => {
    if (!q.trim()) return true
    const k = q.trim().toLowerCase()
    return u.name.toLowerCase().includes(k) || u.email.toLowerCase().includes(k) || (u.feishu_open_id || '').includes(k)
  })

  return (
    <div style={{ padding: 0 }}>
      <div className="evss-card" style={{ marginBottom: 16 }}>
        <div className="evss-toolbar">
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0f172a' }}>用户管理</h2>
          <div className="spacer" />
          <input type="search" placeholder="搜索姓名/邮箱/open_id…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="evss-btn" onClick={load}>🔄 刷新</button>
          <button className="evss-btn primary" onClick={() => setCreating(true)}>+ 新增用户</button>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>共 {users.length} 位用户{q && `，筛选 ${filtered.length} 位`}</div>
      </div>

      <div className="evss-card">
        {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>加载中…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="evss-table">
              <thead>
                <tr>
                  <th>用户</th><th>邮箱</th><th>角色</th><th>状态</th><th>登录方式</th><th>创建时间</th><th style={{ width: 240 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className={u.status === 'suspended' ? 'suspended' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                          : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#64748b', fontWeight: 600 }}>{u.name.slice(0, 1)}</div>
                        }
                        <div>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.name}{u.id === me?.id && <span style={{ marginLeft: 6, fontSize: 11, color: '#0d9488' }}>（我）</span>}</div>
                          {u.feishu_open_id && <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{u.feishu_open_id.slice(0, 24)}…</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{u.email}</td>
                    <td>
                      <select value={u.role} disabled={busy}
                        onChange={e => patch(u.id, { role: e.target.value as Role })}
                        className="evss-role-select"
                        style={{ color: ROLE_COLOR[u.role], borderColor: ROLE_COLOR[u.role] + '55' }}>
                        <option value="operator">运营</option>
                        <option value="designer">设计师</option>
                        <option value="admin">管理员</option>
                      </select>
                    </td>
                    <td>
                      <span className={`evss-status-pill ${u.status}`}>{u.status === 'active' ? '✓ 正常' : '⛔ 停用'}</span>
                    </td>
                    <td>
                      <span className="evss-method-pill">{u.feishu_open_id ? '飞书 OAuth' : '账密'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(u.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="evss-btn evss-btn-sm"
                          onClick={() => toggleStatus(u)}
                          disabled={busy || u.id === me?.id && u.status === 'suspended'}
                          style={u.status === 'active' ? { color: '#b45309' } : { color: '#0d9488' }}>
                          {u.status === 'active' ? '⛔ 停用' : '✓ 启用'}
                        </button>
                        <button className="evss-btn evss-btn-sm" onClick={() => setEdit(u)}>✎ 编辑</button>
                        <button className="evss-btn evss-btn-sm danger" onClick={() => onDelete(u)} disabled={busy || u.id === me?.id}>🗑 删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>没有用户</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <EditUserModal user={edit} onClose={() => setEdit(null)} onSave={async (data) => { await patch(edit.id, data); setEdit(null) }} busy={busy} />}
      {creating && <EditUserModal creating onClose={() => setCreating(false)} onSave={onCreate} busy={busy} />}

      {toast && (
        <div className={`evss-toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  )
}

function EditUserModal({ user, creating, onClose, onSave, busy }: {
  user?: UserRow
  creating?: boolean
  onClose: () => void
  onSave: (data: { name: string; email?: string; password: string; role: Role }) => void | Promise<void>
  busy: boolean
}) {
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(user?.role || 'operator')

  function submit() {
    if (!name.trim()) { alert('请输入姓名'); return }
    if (creating && !email.trim()) { alert('请输入邮箱'); return }
    if (creating && !password) { alert('请设置初始密码'); return }
    onSave({ name: name.trim(), email: creating ? email.trim() : undefined, password, role })
  }

  return (
    <div className="evss-modal-mask" onClick={onClose}>
      <div className="evss-modal" onClick={e => e.stopPropagation()}>
        <div className="evss-modal-head">
          <h3>{creating ? '新增用户' : `编辑用户 · ${user?.name}`}</h3>
          <button className="evss-icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="evss-modal-body">
          <label className="evss-field">
            <span>姓名</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="显示名" />
          </label>
          {creating && (
            <label className="evss-field">
              <span>邮箱（登录账号）</span>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="xxx@shop.local" />
            </label>
          )}
          <label className="evss-field">
            <span>{creating ? '初始密码' : '新密码（留空不修改）'}</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={creating ? '至少 6 位' : '留空则保持原密码'} />
          </label>
          <label className="evss-field">
            <span>角色</span>
            <select value={role} onChange={e => setRole(e.target.value as Role)}>
              <option value="operator">运营（operator）</option>
              <option value="designer">设计师（designer）</option>
              <option value="admin">管理员（admin）</option>
            </select>
          </label>
          {user?.feishu_open_id && (
            <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
              已绑定飞书 open_id：<code>{user.feishu_open_id}</code>
            </div>
          )}
        </div>
        <div className="evss-modal-foot">
          <button className="evss-btn" onClick={onClose}>取消</button>
          <button className="evss-btn primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
