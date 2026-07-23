"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { ImagePreviewModal } from "@/components/ImagePreviewModal"
import { MultiRegionPicker, type RegionItem } from "@/components/MultiRegionPicker"
import { RegionInstructionList, type RegionInstruction } from "@/components/RegionInstructionList"
import { buildMultiRegionSubmitPayload, rectToBboxNorm } from "@/lib/multiregion"

// ============ Types ============
type TabKey = "workbench" | "gallery"
type GalleryFilter = "all" | "template" | "upload" | "generated"
type ScopeFilter = "all" | "mine" | "public" | "private"

interface AssetItem {
  id: string
  type: string
  filename: string
  width: number | null
  height: number | null
  created_at: string
  visibility?: "public" | "private"
  owner_id?: string
  owner?: { name?: string; avatar_url?: string | null }
  is_mine?: boolean
  tags?: string[]
}

interface MeUser {
  id: string
  name: string
  email: string
  role: string
  avatar_url?: string | null
}

interface GenImage {
  id: string
  version_no: number
  variant_index: number
  is_selected: boolean
  preview_url: string
  parent_generated_image_id: string | null
}

type ResultState =
  | { kind: "empty" }
  | { kind: "loading"; progress: number; hint: string }
  | { kind: "error"; message: string; canRetry: boolean }
  | { kind: "done"; images: GenImage[]; activeIdx: number; taskId: string }

// ============ Helpers ============
const TOKEN_KEY = "evss_token"
const LAST_N_KEY = "evss_last_n"

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {})
  return fetch(url, { ...init, headers, credentials: "include" })
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return iso }
}

// ============ Login ============
function LoginScreen({ onLogin }: { onLogin: (role: string) => void }) {
  const [email, setEmail] = useState("operator@shop.local")
  const [password, setPassword] = useState("operator123")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setErr("")
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error?.message || "登录失败")
      // token 通过 HttpOnly Set-Cookie 下发，不在 body 里
      const meRes = await fetch("/api/auth/me", { credentials: "include" })
      if (!meRes.ok) throw new Error("登录后校验失败，请稍后重试")
      const me = await meRes.json()
      localStorage.setItem(TOKEN_KEY, "1") // 仅作为"已登录"标记
      onLogin(me.data?.role || j.data?.user?.role || "operator")
    } catch (e: any) { setErr(e.message || "登录失败") }
    finally { setLoading(false) }
  }

  return (
    <div className="evss-login-wrap">
      <form className="evss-login-card" onSubmit={submit}>
        <div className="evss-login-brand">
          <div className="evss-brand-mark">EV</div>
          <div>
            <div className="evss-brand-title">电商视觉</div>
            <div className="evss-brand-subtitle">VISUAL WORKBENCH</div>
          </div>
        </div>
        <h2>登录工作台</h2>
        <p className="sub">使用账号登录，开始商品图多区域生成</p>
        {err && <div className="err">{err}</div>}
        <input className="field" type="email" placeholder="邮箱" value={email}
          onChange={e => setEmail(e.target.value)} required />
        <input className="field" type="password" placeholder="密码" value={password}
          onChange={e => setPassword(e.target.value)} required />
        <button type="submit" className="evss-btn primary" disabled={loading}>
          {loading ? "登录中…" : "登 录"}
        </button>
      </form>
    </div>
  )
}

// ============ Main App ============
export default function OperatorPage() {
  const [me, setMe] = useState<MeUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>("workbench")
  const [asideOpen, setAsideOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null)

  // auth boot
  useEffect(() => {
    authFetch("/api/auth/me").then(async r => {
      if (r.ok) { const j = await r.json(); setMe(j.data?.user || null) }
    }).catch(() => {}).finally(() => setBooting(false))
  }, [])

  const showToast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2800)
  }, [])

  const handleLogout = async () => {
    try { await authFetch("/api/auth/logout", { method: "POST" }) } catch {}
    localStorage.removeItem(TOKEN_KEY)
    setMe(null)
    // 跳转到统一登录页（含飞书按钮）
    window.location.href = "/login"
  }

  if (booting) {
    return <div className="evss-login-wrap"><div className="evss-spinner" /></div>
  }
  if (!me) {
    // 未登录：跳转到 /login 看飞书按钮（不渲染内嵌登录表单）
    if (typeof window !== "undefined") window.location.href = "/login"
    return <div className="evss-login-wrap"><div className="evss-spinner" /></div>
  }
  const role = me.role

  return (
    <div className="evss-console">
      {/* === 左栏 === */}
      <aside className="evss-sidebar">
        <div className="evss-brand">
          <div className="evss-brand-mark">EV</div>
          <div>
            <div className="evss-brand-title">电商视觉</div>
            <div className="evss-brand-subtitle">VISUAL WORKBENCH</div>
          </div>
        </div>
        <nav className="evss-nav">
          <button className={`evss-nav-item ${activeTab === "workbench" ? "active" : ""}`}
            onClick={() => { setActiveTab("workbench"); setAsideOpen(false) }}>
            <span className="nav-icon">🎨</span><span>工作台</span>
          </button>
          <button className={`evss-nav-item ${activeTab === "gallery" ? "active" : ""}`}
            onClick={() => { setActiveTab("gallery"); setAsideOpen(false) }}>
            <span className="nav-icon">🖼️</span><span>图库</span>
          </button>
        </nav>
        <div className="evss-sidebar-footer">
          {role === "admin" && (
            <a href="/admin" className="evss-nav-item evss-nav-admin" style={{ textDecoration: "none", color: "inherit", justifyContent: "flex-start" }}>
              <span className="nav-icon">⚙️</span><span>管理后台</span>
            </a>
          )}
          <button className="evss-logout" onClick={handleLogout}>退出登录</button>
        </div>
      </aside>

      {/* === 主区 === */}
      <main className="evss-main">
        <div className="evss-topbar">
          <div>
            <div className="evss-eyebrow">OPERATOR WORKBENCH</div>
            <h1>{activeTab === "workbench" ? "商品视觉工作台" : "图库资产"}</h1>
            <p>{activeTab === "workbench"
              ? "选图 → 圈选区域 → 填指令 → 生图 → 继续修改或下载"
              : "管理底图、模板、上传素材和历史生成图"}</p>
          </div>
          <div className="evss-topbar-actions">
            <span className="evss-pill"><span className="dot" />内测可用</span>
            <span className="evss-user-chip" title={me.email}>
              {me.avatar_url
                ? <img src={me.avatar_url} alt="" className="evss-avatar" />
                : <span className="evss-avatar evss-avatar-fallback">{(me.name || "U").slice(0, 1)}</span>}
              <span className="evss-user-name">{me.name || (role === "operator" ? "运营" : role)}</span>
            </span>
            <button className="evss-link-btn" onClick={() => setAsideOpen(v => !v)} title="切换结果面板">
              {asideOpen ? "隐藏结果" : "显示结果"}
            </button>
          </div>
        </div>

        <div className="evss-body">
          <div className="evss-content">
            {activeTab === "workbench" ? (
              <Workbench onToast={showToast} />
            ) : (
              <Gallery role={role} onPickBase={(asset) => {
                // 跨 tab 选底图：把 url 一起带过去
                window.dispatchEvent(new CustomEvent("evss:pick-base", { detail: asset }))
                setActiveTab("workbench")
                showToast("已选作底图", "ok")
              }} onToast={showToast} />
            )}
          </div>
          <aside className={`evss-aside ${asideOpen ? "evss-aside-open" : ""}`}>
            <ResultPanel onToast={showToast} />
          </aside>
        </div>
        {asideOpen && <div className="evss-aside-backdrop" onClick={() => setAsideOpen(false)} />}
      </main>

      {toast && <div className={`evss-toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  )
}

// ============ Global store (simple module-level pub/sub) ============
type StoreState = {
  result: ResultState
  lastSubmit: {
    baseAssetId?: string
    baseImageId?: string
    baseUrl: string
    baseFilename: string
    n: number
    regions: RegionInstruction[]
  } | null
  recent: Array<{ id: string; url: string; filename: string; isGenerated?: boolean }>
  activePreview: { url: string; alt: string } | null
}
const storeListeners = new Set<() => void>()
const store: StoreState = {
  result: { kind: "empty" },
  lastSubmit: null,
  recent: [],
  activePreview: null,
}
function notifyStore() { storeListeners.forEach(l => l()) }
function setStore(patch: Partial<StoreState>) {
  Object.assign(store, patch)
  notifyStore()
}
function useStore<T>(selector: (s: StoreState) => T): T {
  const [, setTick] = useState(0)
  useEffect(() => {
    const l = () => setTick(n => n + 1)
    storeListeners.add(l)
    return () => { storeListeners.delete(l) }
  }, [])
  return selector(store)
}

// ============ Workbench ============
function Workbench({ onToast }: { onToast: (m: string, k?: "ok" | "err") => void }) {
  const [mode, setMode] = useState<"edit" | "generate">("edit")

  return (
    <>
      <div className="evss-mode-tabs">
        <button className={`evss-mode-tab ${mode === "edit" ? "active" : ""}`} onClick={() => setMode("edit")}>
          <span className="nav-icon">✏️</span><span>改图</span>
          <small>选底图 → 圈区域 → 局部重绘</small>
        </button>
        <button className={`evss-mode-tab ${mode === "generate" ? "active" : ""}`} onClick={() => setMode("generate")}>
          <span className="nav-icon">🎨</span><span>生图</span>
          <small>文生图 / 图生图，自由创作</small>
        </button>
      </div>
      {mode === "edit"
        ? <EditWorkbench onToast={onToast} />
        : <SimpleGenerate onToast={onToast} />}
    </>
  )
}

// ============ Edit (multiregion repaint) ============
function EditWorkbench({ onToast }: { onToast: (m: string, k?: "ok" | "err") => void }) {
  // base image
  const [baseAssetId, setBaseAssetId] = useState<string>("")
  const [baseImageId, setBaseImageId] = useState<string>("")
  const [baseUrl, setBaseUrl] = useState<string>("")
  const [baseFilename, setBaseFilename] = useState<string>("")
  const [baseSize, setBaseSize] = useState<{ w: number; h: number }>({ w: 800, h: 800 })

  // regions
  const [regions, setRegions] = useState<RegionItem[]>([])
  const [instructions, setInstructions] = useState<RegionInstruction[]>([])
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})

  // params
  // Seedream 5.0 Pro 仅支持单图生成，固定为 1 张
  const nChoice: 1 = 1
  const [submitting, setSubmitting] = useState(false)

  // fetch assets + previews
  const fetchAssets = useCallback(async () => {
    try {
      const res = await authFetch("/api/assets?limit=100")
      if (!res.ok) return
      const j = await res.json()
      setAssets(j.data?.items || [])
    } catch {}
  }, [])
  useEffect(() => { fetchAssets() }, [fetchAssets])

  // auto-load preview URLs（走同源代理 /api/assets/[id]/preview，避免 TOS 直连跨域/超时）
  const loadedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const missing = assets.filter(a => !previewUrls[a.id] && !loadedRef.current.has(a.id))
    if (!missing.length) return
    missing.forEach(a => loadedRef.current.add(a.id))
    missing.forEach((a) => {
      setPreviewUrls(p => p[a.id] ? p : ({ ...p, [a.id]: `/api/assets/${a.id}/preview` }))
    })
  }, [assets, previewUrls])

  // listen for cross-tab "pick base" events（detail 含 id/filename/url/width/height）
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ id: string; filename: string; url?: string; width?: number; height?: number; isGenerated?: boolean }>
      const asset = ce.detail
      if (asset.isGenerated) {
        setBaseImageId(asset.id); setBaseAssetId("")
        setBaseFilename(asset.filename)
        const url = asset.url || store.recent.find((r: { id: string }) => r.id === asset.id)?.url || (window as any).__evss_last_url || ""
        setBaseUrl(url)
        setBaseSize({ w: asset.width || 800, h: asset.height || 800 })
      } else {
        setBaseAssetId(asset.id); setBaseImageId("")
        setBaseUrl(asset.url || previewUrls[asset.id] || `/api/assets/${asset.id}/preview`)
        setBaseFilename(asset.filename)
        setBaseSize({ w: asset.width || 800, h: asset.height || 800 })
      }
      setRegions([]); setInstructions([])
      setStore({ result: { kind: "empty" } })
    }
    window.addEventListener("evss:pick-base", handler as EventListener)
    return () => window.removeEventListener("evss:pick-base", handler as EventListener)
  }, [previewUrls])

  // pick base from gallery modal
  const [galleryPickOpen, setGalleryPickOpen] = useState(false)
  const pickFromGallery = (a: AssetItem) => {
    setBaseAssetId(a.id); setBaseImageId("")
    setBaseUrl(previewUrls[a.id] || "")
    setBaseFilename(a.filename)
    setBaseSize({ w: a.width || 800, h: a.height || 800 })
    setRegions([]); setInstructions([])
    setStore({ result: { kind: "empty" } })
    setGalleryPickOpen(false)
  }

  // upload base
  const uploadBase = async (file: File) => {
    const fd = new FormData(); fd.append("file", file)
    try {
      const res = await authFetch("/api/assets/upload", { method: "POST", body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message || "上传失败")
      const asset = j.data?.asset || j.data
      setBaseAssetId(asset.id); setBaseImageId("")
      setBaseFilename(asset.filename || file.name)
      // 上传后用同源代理预览
      setBaseUrl(`/api/assets/${asset.id}/preview`)
      setPreviewUrls(p => ({ ...p, [asset.id]: `/api/assets/${asset.id}/preview` }))
      setBaseSize({ w: asset.width || 800, h: asset.height || 800 })
      setRegions([]); setInstructions([])
      setStore({ result: { kind: "empty" } })
      fetchAssets()
      onToast("上传成功", "ok")
    } catch (e: any) { onToast(e.message || "上传失败", "err") }
  }

  // recent = recently used bases from store
  const recent = useStore(s => s.recent)

  // regions → instructions sync（按数组顺序编号 1..N）
  useEffect(() => {
    setInstructions(prev => {
      const byId = new Map(prev.map(p => [p.id, p]))
      const next: RegionInstruction[] = regions.map((r, i) => {
        const exist = byId.get(r.id)
        return {
          id: r.id, index: i + 1, rect: r.rect,
          bbox_norm: rectToBboxNorm(r.rect),
          instruction: exist?.instruction || "",
          referenceAssetId: exist?.referenceAssetId,
          referenceImageUrl: exist?.referenceImageUrl,
        }
      })
      return next
    })
  }, [regions])

  // 给 Picker 用的 onChange：保持 list 顺序但重新编号 1..N（Picker 新建时 index=0，这里统一修正）
  const onRegionsChange = useCallback((rs: RegionItem[]) => {
    setRegions(rs.map((r, i) => ({ ...r, index: i + 1 })))
  }, [])

  // submit
  const submit = async () => {
    if (!baseUrl) { onToast("请先选底图", "err"); return }
    if (!instructions.length) { onToast("请至少圈选一个区域", "err"); return }
    if (instructions.some(r => !r.instruction.trim())) { onToast("请填写所有区域指令", "err"); return }

    setSubmitting(true)
    const chosenN = nChoice
    localStorage.setItem(LAST_N_KEY, String(chosenN))
    const builtRegions = buildMultiRegionSubmitPayload(instructions)
    const allInstructionText = builtRegions
      .map(r => `[区域${r.index}] ${r.instruction}`)
      .join("\n")
    const payload: Record<string, unknown> = {
      task_type: "edit",
      n: chosenN,
      edit_instruction_text: allInstructionText,
      params: {
        mode: "partial_repaint",
        count: chosenN,
        regions: builtRegions.map(r => ({
          id: r.id,
          index: r.index,
          instruction: r.instruction,
          bbox_norm: r.bbox_norm,
          referenceAssetId: r.referenceAssetId,
        })),
      },
    }
    if (baseAssetId) (payload as any).base_asset_id = baseAssetId
    else if (baseImageId) (payload as any).source_generated_image_id = baseImageId
    setStore({
      result: { kind: "loading", progress: 5, hint: "已提交，等待 Seedream…" },
      lastSubmit: { baseAssetId, baseImageId, baseUrl, baseFilename, n: chosenN, regions: instructions },
    })
    try {
      const res = await authFetch("/api/generation/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message || "提交失败")
      const taskId = j.data?.id || j.data?.task?.id
      if (!taskId) throw new Error("未返回任务 ID")
      pollTask(taskId, chosenN)
    } catch (e: any) {
      setStore({ result: { kind: "error", message: e.message || "提交失败", canRetry: true } })
      onToast(e.message || "提交失败", "err")
      setSubmitting(false)
    }
  }

  const pollTask = useCallback(async (taskId: string, expectedN: number) => {
    let tries = 0
    const iv = setInterval(async () => {
      tries++
      try {
        const [dr, ir] = await Promise.all([
          authFetch(`/api/generation/tasks/${taskId}`),
          authFetch(`/api/generation/tasks/${taskId}/images`),
        ])
        if (!dr.ok) return
        const dj = await dr.json()
        const status = dj.data?.status
        const progress = status === "succeeded" ? 100
          : status === "running" ? Math.min(90, 20 + tries * 8)
          : tries * 5
        const hint = status === "succeeded" ? "完成！"
          : status === "running" ? "Seedream 正在生成…"
          : "排队中…"
        if (status === "failed") {
          clearInterval(iv)
          const msg = dj.data?.error_message_safe || "生成失败"
          setStore({ result: { kind: "error", message: msg, canRetry: true } })
          setSubmitting(false)
          onToast(msg, "err")
          return
        }
        if (ir.ok) {
          const ij = await ir.json()
          const images: GenImage[] = (ij.data?.images || []).map((img: GenImage) => ({
            ...img,
            preview_url: img.id ? `/api/generation/images/${img.id}/preview` : img.preview_url,
          }))
          if (status === "succeeded" && images.length > 0) {
            clearInterval(iv)
            // push to recent
            const newRecent = [
              ...images.map(img => ({ id: img.id, url: img.preview_url, filename: `v${img.version_no}-${img.variant_index}`, isGenerated: true as const })),
              ...store.recent,
            ].slice(0, 8)
            setStore({ result: { kind: "done", images, activeIdx: 0, taskId }, recent: newRecent })
            setSubmitting(false)
            onToast("生成完成", "ok")
            return
          }
          setStore({ result: { kind: "loading", progress, hint } })
        } else {
          setStore({ result: { kind: "loading", progress, hint } })
        }
        if (tries > 90) { // 3 分钟超时
          clearInterval(iv)
          setStore({ result: { kind: "error", message: "生成超时，请重试", canRetry: true } })
          setSubmitting(false)
        }
      } catch { /* network, retry */ }
    }, 2000)
  }, [onToast])

  const retry = () => {
    const last = store.lastSubmit
    if (!last) return
    // 重新提交相同参数
    setBaseAssetId(last.baseAssetId || "")
    setBaseImageId(last.baseImageId || "")
    setBaseUrl(last.baseUrl)
    setBaseFilename(last.baseFilename)
    // nChoice 固定为 1，无需恢复历史选择
    setInstructions(last.regions)
    setTimeout(() => submit(), 100)
  }

  // expose retry to ResultPanel via store
  useEffect(() => { (window as any).__evss_retry = retry }, [retry])

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit() }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  })

  return (
    <>
      {/* Step 1 选底图 */}
      <section className="evss-card">
        <div className="evss-card-header">
          <div>
            <h3 className="evss-card-title"><span className="step-badge">1</span>选择底图</h3>
            <p className="evss-card-desc">从图库选、上传新图，或从最近用过的开始</p>
          </div>
        </div>
        <div className="evss-base-picker">
          <div className="evss-base-actions">
            <button type="button" className="evss-btn" onClick={() => setGalleryPickOpen(true)}>🖼️ 从图库选</button>
          <div style={{ display: "inline-block" }}>
            <label className="evss-btn" style={{ cursor: "pointer", margin: 0 }}>
              📤 本地上传
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBase(f); e.target.value = "" }} />
            </label>
          </div>
          </div>
          {recent.length > 0 && (
            <div className="evss-recent-row">
              <span className="evss-recent-label">最近：</span>
              {recent.slice(0, 6).map(r => (
                <div key={r.id}
                  className={`evss-thumb-tile ${baseUrl === r.url ? "active" : ""}`}
                  style={{ backgroundImage: r.url ? `url(${r.url})` : undefined }}
                  title={r.filename}
                  onClick={() => {
                    if (r.isGenerated) { setBaseImageId(r.id); setBaseAssetId("") }
                    else { setBaseAssetId(r.id); setBaseImageId("") }
                    setBaseUrl(r.url); setBaseFilename(r.filename)
                    setRegions([]); setInstructions([])
                    setStore({ result: { kind: "empty" } })
                  }}
                />
              ))}
            </div>
          )}
          {baseUrl && (
            <div className="evss-base-selected">
              <div className="thumb" style={{ backgroundImage: `url(${baseUrl})` }} />
              <div className="meta">
                <div className="filename">{baseFilename}</div>
                <div className="sub">{baseSize.w}×{baseSize.h} · {baseImageId ? "基于生成图" : "资产"}</div>
              </div>
              <button type="button" className="evss-btn ghost" style={{ marginLeft: "auto" }}
                onClick={() => { setBaseUrl(""); setBaseAssetId(""); setBaseImageId(""); setRegions([]); setInstructions([]); setStore({ result: { kind: "empty" } }) }}>
                清除
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Step 2 圈区域 + 指令 */}
      <section className="evss-card">
        <div className="evss-card-header">
          <div>
            <h3 className="evss-card-title"><span className="step-badge">2</span>圈选区域 · 填写指令</h3>
            <p className="evss-card-desc">在图上拖出矩形，每个区域写指令，可附参考图</p>
          </div>
        </div>
        <div className="evss-canvas-wrap">
          {baseUrl ? (
            <div className="evss-canvas-stage">
              <MultiRegionPicker
                imageUrl={baseUrl}
                canvasSize={baseSize}
                value={regions}
                onChange={onRegionsChange}
                multiple={true}
                maxRegions={8}
                onLimit={(n) => onToast(`最多 ${n} 个区域`, "err")}
              />
            </div>
          ) : (
            <div className="evss-canvas-empty">
              <strong>请先在 Step 1 选底图</strong>
              选好后这里会出现画布，可以在上面拖框选区域
            </div>
          )}
          {baseUrl && instructions.length > 0 && (
            <RegionInstructionList
              regions={instructions}
              onChange={setInstructions}
              assets={assets.map(a => ({ id: a.id, filename: a.filename, width: a.width, height: a.height }))}
              getAssetPreviewUrl={(id) => previewUrls[id]}
            />
          )}
        </div>
      </section>

      {/* 生成 */}
      <section className="evss-card">
        <div className="evss-bottom-row" style={{ justifyContent: "flex-end" }}>
          <div className="evss-submit-wrap">
            <button type="button" className="evss-btn primary lg"
              disabled={submitting || !baseUrl || !instructions.length}
              onClick={submit}>
              {submitting ? "生成中…" : "🚀 生图"}
            </button>
            <span className="evss-submit-hint">⌘/Ctrl + Enter</span>
          </div>
        </div>
      </section>

      {/* 图库选底图 modal */}
      {galleryPickOpen && (
        <GalleryPickModal
          assets={assets}
          previewUrls={previewUrls}
          onClose={() => setGalleryPickOpen(false)}
          onPick={pickFromGallery}
          onRequestPreview={async (id) => {
            if (previewUrls[id]) return
            setPreviewUrls(p => ({ ...p, [id]: `/api/assets/${id}/preview` }))
          }}
        />
      )}
    </>
  )
}

// ============ Gallery Pick Modal ============
function GalleryPickModal({ assets, previewUrls, onClose, onPick, onRequestPreview }: {
  assets: AssetItem[]
  previewUrls: Record<string, string>
  onClose: () => void
  onPick: (a: AssetItem) => void
  onRequestPreview: (id: string) => void
}) {
  const [q, setQ] = useState("")
  const filtered = assets.filter(a => !q || a.filename.toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>从图库选底图</h3>
          <button className="evss-btn ghost" onClick={onClose}>✕</button>
        </div>
        <input className="field" placeholder="搜索文件名…" value={q}
          onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <div className="evss-gallery-grid">
            {filtered.map(a => (
              <div key={a.id} className="evss-gallery-card" onClick={() => onPick(a)}>
                <div className="evss-gallery-thumb"
                  ref={el => {
                    if (!el) return
                    if (previewUrls[a.id]) {
                      el.style.backgroundImage = `url(${previewUrls[a.id]})`
                      return
                    }
                    const io = new IntersectionObserver((ents) => {
                      for (const ent of ents) {
                        if (ent.isIntersecting) { onRequestPreview(a.id); io.disconnect() }
                      }
                    })
                    io.observe(el)
                  }}
                />
                <div className="evss-gallery-meta">
                  <div className="name">{a.filename}</div>
                  <div className="sub">{a.width || "?"}×{a.height || "?"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ Simple Generate (txt2img / img2img) ============
function SimpleGenerate({ onToast }: { onToast: (m: string, k?: "ok" | "err") => void }) {
  const [prompt, setPrompt] = useState("")
  const [refAsset, setRefAsset] = useState<{ id: string; filename: string; url: string; width?: number | null; height?: number | null } | null>(null)
  const [refAssets, setRefAssets] = useState<AssetItem[]>([])
  const [refPreviewUrls, setRefPreviewUrls] = useState<Record<string, string>>({})
  const [pickOpen, setPickOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchAssets = useCallback(async () => {
    try {
      const res = await authFetch("/api/assets?pageSize=50")
      if (!res.ok) return
      const j = await res.json()
      setRefAssets(j.data?.items || [])
    } catch {}
  }, [])
  useEffect(() => { fetchAssets() }, [fetchAssets])

  useEffect(() => {
    const missing = refAssets.filter(a => !refPreviewUrls[a.id])
    if (!missing.length) return
    const next: Record<string, string> = { ...refPreviewUrls }
    missing.forEach(a => { next[a.id] = `/api/assets/${a.id}/preview` })
    setRefPreviewUrls(next)
  }, [refAssets, refPreviewUrls])

  const uploadRef = async (file: File) => {
    const fd = new FormData(); fd.append("file", file)
    try {
      const res = await authFetch("/api/assets/upload", { method: "POST", body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message || "上传失败")
      const asset = j.data?.asset || j.data
      setRefAsset({
        id: asset.id,
        filename: asset.filename || file.name,
        url: `/api/assets/${asset.id}/preview`,
        width: asset.width, height: asset.height,
      })
      fetchAssets()
      onToast("参考图已上传", "ok")
    } catch (e: any) { onToast(e.message || "上传失败", "err") }
  }

  const submit = async () => {
    if (!prompt.trim()) { onToast("请输入提示词", "err"); return }
    setSubmitting(true)
    setStore({ result: { kind: "loading", progress: 5, hint: "已提交，等待 Seedream…" } })
    try {
      const payload: Record<string, unknown> = {
        task_type: "generate",
        n: 1,
        prompt: prompt.trim(),
        input_assets: {},
      }
      if (refAsset) {
        (payload.input_assets as any).product_image_asset_id = refAsset.id
      }
      const res = await authFetch("/api/generation/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message || "提交失败")
      const taskId = j.data?.id || j.data?.task?.id
      if (!taskId) throw new Error("未返回任务 ID")
      // 复用现有轮询逻辑
      pollTaskSimple(taskId)
    } catch (e: any) {
      setStore({ result: { kind: "error", message: e.message || "提交失败", canRetry: true } })
      onToast(e.message || "提交失败", "err")
      setSubmitting(false)
    }
  }

  const pollTaskSimple = useCallback(async (taskId: string) => {
    let tries = 0
    const iv = setInterval(async () => {
      tries++
      try {
        const [dr, ir] = await Promise.all([
          authFetch(`/api/generation/tasks/${taskId}`),
          authFetch(`/api/generation/tasks/${taskId}/images`),
        ])
        if (!dr.ok) return
        const dj = await dr.json()
        const status = dj.data?.status
        const progress = status === "succeeded" ? 100
          : status === "running" ? Math.min(90, 20 + tries * 8) : tries * 5
        const hint = status === "succeeded" ? "完成！"
          : status === "running" ? "Seedream 正在生成…" : "排队中…"
        if (status === "failed") {
          clearInterval(iv)
          const msg = dj.data?.error_message_safe || "生成失败"
          setStore({ result: { kind: "error", message: msg, canRetry: true } })
          setSubmitting(false)
          onToast(msg, "err"); return
        }
        if (ir.ok) {
          const ij = await ir.json()
          const images: GenImage[] = (ij.data?.images || []).map((img: GenImage) => ({
            ...img,
            preview_url: img.id ? `/api/generation/images/${img.id}/preview` : img.preview_url,
          }))
          if (status === "succeeded" && images.length > 0) {
            clearInterval(iv)
            const newRecent = [
              ...images.map(img => ({ id: img.id, url: img.preview_url, filename: `v${img.version_no}-${img.variant_index}`, isGenerated: true as const })),
              ...store.recent,
            ].slice(0, 8)
            setStore({ result: { kind: "done", images, activeIdx: 0, taskId }, recent: newRecent })
            setSubmitting(false)
            onToast("生成完成", "ok"); return
          }
          setStore({ result: { kind: "loading", progress, hint } })
        } else {
          setStore({ result: { kind: "loading", progress, hint } })
        }
        if (tries > 90) {
          clearInterval(iv)
          setStore({ result: { kind: "error", message: "生成超时，请重试", canRetry: true } })
          setSubmitting(false)
        }
      } catch { /* retry */ }
    }, 2000)
  }, [onToast])

  // ⌘/Ctrl+Enter 快捷提交
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!submitting && prompt.trim()) submit() }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, prompt])

  return (
    <>
      {/* 参考图 */}
      <section className="evss-card">
        <div className="evss-card-header">
          <div>
            <h3 className="evss-card-title"><span className="step-badge">1</span>参考图（可选）</h3>
            <p className="evss-card-desc">上传或从图库选一张图作参考，不选则为纯文生图</p>
          </div>
        </div>
        <div className="evss-base-picker">
          <div className="evss-base-actions">
            <button type="button" className="evss-btn" onClick={() => setPickOpen(true)}>🖼️ 从图库选</button>
            <label className="evss-btn" style={{ cursor: "pointer", margin: 0, display: "inline-block" }}>
              📤 本地上传
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRef(f); e.target.value = "" }} />
            </label>
          </div>
          {refAsset && (
            <div className="evss-base-selected">
              <div className="thumb" style={{ backgroundImage: `url(${refAsset.url})` }} />
              <div className="meta">
                <div className="filename">{refAsset.filename}</div>
                <div className="sub">{refAsset.width || "?"}×{refAsset.height || "?"}</div>
              </div>
              <button type="button" className="evss-btn ghost" style={{ marginLeft: "auto" }}
                onClick={() => setRefAsset(null)}>清除</button>
            </div>
          )}
        </div>
      </section>

      {/* 提示词 */}
      <section className="evss-card">
        <div className="evss-card-header">
          <div>
            <h3 className="evss-card-title"><span className="step-badge">2</span>提示词</h3>
            <p className="evss-card-desc">用一段话描述你想要的画面，越具体越好</p>
          </div>
        </div>
        <textarea
          className="evss-prompt-textarea"
          placeholder="例如：一杯冒着热气的拿铁咖啡，放在浅木色桌面上，窗边自然光，俯拍角度，柔和阴影，ins 风格，高清，4k"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          style={{
            width: "100%", padding: 12, border: "1px solid var(--evss-border)",
            borderRadius: 8, fontSize: 14, fontFamily: "inherit", resize: "vertical",
            boxSizing: "border-box", outline: "none",
          }}
        />
      </section>

      {/* 生成 */}
      <section className="evss-card">
        <div className="evss-bottom-row" style={{ justifyContent: "flex-end" }}>
          <div className="evss-submit-wrap">
            <button type="button" className="evss-btn primary lg"
              disabled={submitting || !prompt.trim()}
              onClick={submit}>
              {submitting ? "生成中…" : "🚀 生图"}
            </button>
            <span className="evss-submit-hint">⌘/Ctrl + Enter</span>
          </div>
        </div>
      </section>

      {pickOpen && (
        <GalleryPickModal
          assets={refAssets}
          previewUrls={refPreviewUrls}
          onClose={() => setPickOpen(false)}
          onPick={(a) => {
            setRefAsset({
              id: a.id, filename: a.filename,
              url: refPreviewUrls[a.id] || `/api/assets/${a.id}/preview`,
              width: a.width, height: a.height,
            })
            setPickOpen(false)
          }}
          onRequestPreview={(id) => {
            if (refPreviewUrls[id]) return
            setRefPreviewUrls(p => ({ ...p, [id]: `/api/assets/${id}/preview` }))
          }}
        />
      )}
    </>
  )
}

// ============ Gallery Tab ============
function Gallery({ onPickBase, onToast, role }: {
  onPickBase: (a: { id: string; filename: string; url: string; width?: number | null; height?: number | null }) => void
  onToast: (m: string, k?: "ok" | "err") => void
  role: string
}) {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<GalleryFilter>("all")
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [scope, setScope] = useState<ScopeFilter>("all")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<AssetItem | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [tagInput, setTagInput] = useState("")

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/assets?pageSize=200&scope=${scope}`)
      const j = await res.json()
      setAssets(j.data?.items || [])
    } finally { setLoading(false) }
  }, [scope])
  useEffect(() => { fetchAssets() }, [fetchAssets])

  const requestPreview = useCallback((id: string) => {
    if (previewUrls[id]) return
    setPreviewUrls(p => ({ ...p, [id]: `/api/assets/${id}/preview` }))
  }, [previewUrls])

  // auto-load on intersection for all visible cards
  useEffect(() => {
    const els = document.querySelectorAll("[data-gallery-id]")
    const io = new IntersectionObserver((ents) => {
      ents.forEach(ent => {
        if (ent.isIntersecting) {
          const id = (ent.target as HTMLElement).dataset.galleryId!
          requestPreview(id)
          io.unobserve(ent.target)
        }
      })
    }, { rootMargin: "200px" })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [assets, filter, scope, q, requestPreview])

  const upload = async (file: File) => {
    const fd = new FormData(); fd.append("file", file)
    try {
      const res = await authFetch("/api/assets/upload", { method: "POST", body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message || "上传失败")
      onToast("上传成功", "ok")
      fetchAssets()
    } catch (e: any) { onToast(e.message || "上传失败", "err") }
  }

  const del = async (id: string) => {
    if (!confirm("确认删除？")) return
    try {
      const res = await authFetch(`/api/assets/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error?.message || "删除失败")
      }
      onToast("已删除", "ok")
      setSelected(null)
      fetchAssets()
    } catch (e: any) { onToast(e.message || "删除失败", "err") }
  }

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  const exitBatch = () => { setBatchMode(false); setSelectedIds(new Set()); setTagInput("") }

  const runBatch = async (payload: any, okMsg: string) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) { onToast("请先选择资产", "err"); return }
    if (!confirm(`${okMsg}（${ids.length} 条）？`)) return
    setBatchBusy(true)
    try {
      const res = await authFetch("/api/assets/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...payload }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error?.message || "操作失败")
      }
      onToast(`${okMsg}成功（${ids.length} 条）`, "ok")
      exitBatch()
      fetchAssets()
    } catch (e: any) { onToast(e.message || "操作失败", "err") }
    finally { setBatchBusy(false) }
  }

  const addTagsFromInput = async () => {
    const tags = tagInput.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean)
    if (tags.length === 0) { onToast("请输入标签", "err"); return }
    await runBatch({ action: "add_tags", tags }, "添加标签")
    setTagInput("")
  }

  const toggleVisibility = async (a: AssetItem) => {
    if (!a.is_mine && role !== "admin") {
      onToast("仅所有者或管理员可修改公开范围", "err")
      return
    }
    const next = a.visibility === "public" ? "private" : "public"
    try {
      const res = await authFetch(`/api/assets/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error?.message || "修改失败")
      }
      onToast(next === "public" ? "已设为公开" : "已设为私有", "ok")
      setAssets(list => list.map(x => x.id === a.id ? { ...x, visibility: next } : x))
      if (selected?.id === a.id) setSelected(s => s ? { ...s, visibility: next } : s)
    } catch (e: any) { onToast(e.message || "修改失败", "err") }
  }

  // 聚合所有标签（按出现次数降序）
  const tagList = useMemo(() => {
    const m = new Map<string, number>()
    assets.forEach(a => (a.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([t, c]) => ({ tag: t, count: c }))
  }, [assets])

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return assets.filter(a => {
      if (ql) {
        const inName = a.filename.toLowerCase().includes(ql)
        const inTag = (a.tags || []).some(t => t.toLowerCase().includes(ql))
        if (!inName && !inTag) return false
      }
      if (activeTag && !(a.tags || []).includes(activeTag)) return false
      if (filter === "all") return true
      if (filter === "template") return a.type === "template" || a.type?.includes("template")
      if (filter === "upload") return a.type === "upload" || a.type === "user_upload" || a.type?.includes("upload")
      if (filter === "generated") return a.type === "generated" || a.type?.includes("generated")
      return true
    })
  }, [assets, filter, q, activeTag])

  const allIds = filtered.map((a) => a.id)
  const allChecked = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const toggleAll = () => {
    if (allChecked) setSelectedIds(new Set())
    else setSelectedIds(new Set(allIds))
  }

  return (
    <>
      <div className="evss-card">
        <div className="evss-gallery-toolbar">
          <label className="evss-btn primary" style={{ cursor: "pointer", margin: 0 }}>
            + 上传图片
            <input type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
          </label>
          <button className="evss-btn" onClick={fetchAssets}>🔄 刷新</button>
          <button
            className={batchMode ? "evss-btn primary" : "evss-btn"}
            onClick={() => { if (batchMode) exitBatch(); else setBatchMode(true) }}
          >
            {batchMode ? "✕ 退出批量" : "☰ 批量管理"}
          </button>
          <div className="evss-filter-chips">
            {([["all", "全部"], ["mine", "我的"], ["public", "公开"], ["private", "私有"]] as const).map(([k, label]) => (
              <button key={k} className={`evss-chip ${scope === k ? "active" : ""}`} onClick={() => setScope(k)}>{label}</button>
            ))}
          </div>
          <div className="evss-filter-chips evss-filter-chips-sub">
            {([["all", "类型"], ["template", "模板"], ["upload", "上传"], ["generated", "生成"]] as const).map(([k, label]) => (
              <button key={k} className={`evss-chip evss-chip-sm ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <div className="spacer" />
          <input type="search" placeholder="搜索文件名 / 标签…" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        {tagList.length > 0 && (
          <div className="evss-tag-row">
            <span className="evss-tag-row-label">标签：</span>
            <button
              className={`evss-chip evss-chip-sm ${activeTag === null ? "active" : ""}`}
              onClick={() => setActiveTag(null)}
            >全部</button>
            {tagList.map(({ tag, count }) => (
              <button
                key={tag}
                className={`evss-chip evss-chip-sm evss-chip-tag ${activeTag === tag ? "active" : ""}`}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                title={`${count} 张图`}
              >#{tag} <span className="evss-chip-count">{count}</span></button>
            ))}
          </div>
        )}

        {batchMode && (
          <div style={{
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
            padding: "10px 14px", marginBottom: 12,
            background: "#f0fdf4", border: "1px solid var(--evss-border)", borderRadius: 10,
          }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, marginRight: 8 }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              全选当前页（{filtered.length}）
            </label>
            <span style={{ fontSize: 13, color: "#64748b" }}>已选 {selectedIds.size} 条</span>
            <span style={{ flex: 1 }} />
            <input
              type="text"
              placeholder="标签（逗号/空格分隔，回车添加）"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTagsFromInput() }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--evss-border)", fontSize: 13, width: 240 }}
              disabled={batchBusy}
            />
            <button className="evss-btn" disabled={batchBusy} onClick={addTagsFromInput}>🏷 添加标签</button>
            <button className="evss-btn" disabled={batchBusy}
              onClick={() => runBatch({ action: "set_visibility", visibility: "public" }, "批量公开")}>🌐 公开</button>
            <button className="evss-btn" disabled={batchBusy}
              onClick={() => runBatch({ action: "set_visibility", visibility: "private" }, "批量转私有")}>🔒 私有</button>
            <button className="evss-btn danger" disabled={batchBusy}
              onClick={() => runBatch({ action: "delete" }, "批量删除")}>🗑 删除</button>
          </div>
        )}

        {loading ? (
          <div className="evss-gallery-empty"><div className="evss-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="evss-gallery-empty">暂无资产，点左上角上传</div>
        ) : (
          <div className="evss-gallery-grid">
            {filtered.map(a => (
              <div key={a.id}
                className={`evss-gallery-card${selectedIds.has(a.id) ? " batch-selected" : ""}`}
                data-gallery-id={a.id}
                onClick={() => {
                  if (batchMode) { toggleId(a.id); return }
                  setSelected(a)
                }}>
                {batchMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleId(a.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 18, height: 18, cursor: "pointer" }}
                  />
                )}
                <div className="evss-gallery-thumb"
                  style={previewUrls[a.id] ? { backgroundImage: `url(${previewUrls[a.id]})` } : undefined}>
                  <span className={`badge ${a.type?.includes("template") ? "template" : a.type?.includes("upload") ? "upload" : a.type?.includes("generated") ? "generated" : ""}`}>
                    {a.type?.includes("template") ? "模板" : a.type?.includes("upload") ? "上传" : a.type?.includes("generated") ? "生成" : "素材"}
                  </span>
                  {a.visibility && (
                    <span className={`vis-badge ${a.visibility === "public" ? "public" : "private"}`}>
                      {a.visibility === "public" ? "🌐 公开" : "🔒 私有"}
                    </span>
                  )}
                  {a.tags && a.tags.length > 0 && (
                    <span className="evss-thumb-tags">
                      {a.tags.slice(0, 3).map((t) => (
                        <span key={t} className="evss-thumb-tag">#{t}</span>
                      ))}
                      {a.tags.length > 3 && (
                        <span className="evss-thumb-tag-more">+{a.tags.length - 3}</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="evss-gallery-meta">
                  <div className="name" title={a.filename}>{a.filename}</div>
                  <div className="sub">
                    {a.width || "?"}×{a.height || "?"} · {formatTime(a.created_at)}
                    {a.owner?.name && !a.is_mine ? ` · ${a.owner.name}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div style={modalOverlayStyle} onClick={() => setSelected(null)}>
          <div style={{ ...modalStyle, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                {selected.filename}
                {selected.visibility && (
                  <span className={`vis-badge ${selected.visibility === "public" ? "public" : "private"}`} style={{ fontSize: 12 }}>
                    {selected.visibility === "public" ? "🌐 公开" : "🔒 私有"}
                  </span>
                )}
              </h3>
              <button className="evss-btn ghost" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={{
              aspectRatio: "1/1", background: `#f8fafc center/contain no-repeat`,
              backgroundImage: previewUrls[selected.id] ? `url(${previewUrls[selected.id]})` : undefined,
              border: "1px solid var(--evss-border)", borderRadius: 8, marginBottom: 12,
            }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="evss-btn primary" onClick={() => {
                onPickBase({
                  id: selected.id,
                  filename: selected.filename,
                  url: previewUrls[selected.id] || `/api/assets/${selected.id}/preview`,
                  width: selected.width,
                  height: selected.height,
                })
                setSelected(null)
              }}>
                🎨 选作底图
              </button>
              {previewUrls[selected.id] && (
                <a className="evss-btn" href={previewUrls[selected.id]} target="_blank" rel="noreferrer" download>⬇ 下载</a>
              )}
              {(selected.is_mine || role === "admin") && (
                <button className="evss-btn" onClick={() => toggleVisibility(selected)}>
                  {selected.visibility === "public" ? "🔒 转为私有" : "🌐 公开"}
                </button>
              )}
              {(selected.is_mine || role === "admin") && (
                <button className="evss-btn danger" style={{ marginLeft: "auto" }} onClick={() => del(selected.id)}>删除</button>
              )}
            </div>
            {selected.owner?.name && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--evss-text-2, #64748b)" }}>
                所有者：{selected.owner.name}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ============ Result Panel (right aside) ============
function ResultPanel({ onToast }: { onToast: (m: string, k?: "ok" | "err") => void }) {
  const result = useStore(s => s.result)
  const activePreview = useStore(s => s.activePreview)

  const handleDownload = (img: GenImage) => {
    // 直接下载 preview_url 或用 download API
    const a = document.createElement("a")
    a.href = img.preview_url
    a.download = `evss-v${img.version_no}-${img.variant_index}.png`
    a.target = "_blank"
    a.rel = "noreferrer"
    document.body.appendChild(a); a.click(); a.remove()
    // push to recent
    const exists = store.recent.some((r: { id: string }) => r.id === img.id)
    if (!exists) {
      setStore({ recent: [{ id: img.id, url: img.preview_url, filename: `v${img.version_no}-${img.variant_index}`, isGenerated: true }, ...store.recent].slice(0, 8) })
    }
    onToast("已下载", "ok")
  }

  const handleContinue = (img: GenImage) => {
    // 把这张图作为新底图，通过事件通知 Workbench
    window.dispatchEvent(new CustomEvent("evss:pick-base", {
      detail: { id: img.id, filename: `v${img.version_no}-${img.variant_index}`, isGenerated: true }
    }))
    // 把 url 存到 recent 让 workbench 能取到
    setStore({
      recent: [{ id: img.id, url: img.preview_url, filename: `v${img.version_no}-${img.variant_index}`, isGenerated: true }, ...store.recent.filter((r: { id: string }) => r.id !== img.id)].slice(0, 8),
    })
    ;(window as any).__evss_last_url = img.preview_url
    onToast("已回填为新底图", "ok")
  }

  return (
    <>
      <div className="evss-card evss-result-card">
        <h3 className="evss-card-title" style={{ marginBottom: 4 }}>生成结果</h3>
        <p className="evss-card-desc" style={{ marginTop: 0 }}>生图后结果显示在这里</p>

        {result.kind === "empty" && (
          <div className="evss-result-empty">
            <div className="ico">🎨</div>
            <p>圈选区域并填写指令后<br />点击「生图」</p>
          </div>
        )}

        {result.kind === "loading" && (
          <div className="evss-result-progress">
            <div className="evss-spinner" />
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{result.hint}</div>
            <div className="evss-progress-bar">
              <div className="evss-progress-fill" style={{ width: `${result.progress}%` }} />
            </div>
            <div className="evss-progress-text">{result.progress}% · 约 15-25s</div>
          </div>
        )}

        {result.kind === "error" && (
          <div className="evss-result-error">
            <strong>生成失败</strong>
            <div>{result.message}</div>
            {result.canRetry && (
              <button className="evss-btn" onClick={() => (window as any).__evss_retry?.()}>
                🔄 重试同样参数
              </button>
            )}
          </div>
        )}

        {result.kind === "done" && (() => {
          const active = result.images[result.activeIdx]
          if (!active) return null
          return (
            <>
              <div className="evss-result-image"
                style={{ backgroundImage: `url(${active.preview_url})` }}
                onClick={() => setStore({ activePreview: { url: active.preview_url, alt: `v${active.version_no}-${active.variant_index}` } })}
              />
              <div className="evss-result-meta">
                <span>v{active.version_no}-{active.variant_index}</span>
                <span>{result.images.length} 张候选</span>
              </div>
              {result.images.length > 1 && (
                <div className="evss-result-thumbs">
                  {result.images.map((img, i) => (
                    <div key={img.id}
                      className={`evss-result-thumb ${i === result.activeIdx ? "active" : ""}`}
                      style={{ backgroundImage: `url(${img.preview_url})` }}
                      onClick={() => setStore({ result: { ...result, activeIdx: i } })}
                    />
                  ))}
                </div>
              )}
              <div className="evss-result-actions">
                <button className="evss-btn" onClick={() => handleDownload(active)}>⬇ 下载</button>
                <button className="evss-btn primary" onClick={() => handleContinue(active)}>🔄 继续修改</button>
              </div>
            </>
          )
        })()}
      </div>

      {activePreview && (
        <ImagePreviewModal open={true} imageUrl={activePreview.url} alt={activePreview.alt}
          onClose={() => setStore({ activePreview: null })} />
      )}
    </>
  )
}

// ============ Modal styles (inline, shared) ============
const modalOverlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,.5)",
  display: "grid", placeItems: "center", zIndex: 60, padding: 20,
}
const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 20,
  width: "100%", maxWidth: 760, maxHeight: "90vh", overflow: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,.25)",
}
