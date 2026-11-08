"use client"

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSignedUrls } from "@/lib/hooks/useSignedUrls"
import { LazyThumb } from "./LazyThumb"

type AssetType = "product_image" | "reference_image" | "template_material" | "generated_image"
type UploadType = Exclude<AssetType, "generated_image">
type Visibility = "public" | "private"
type QueueStatus = "waiting" | "uploading" | "success" | "failed" | "cancelled"

interface UserInfo { id: string; name: string; role: string }
interface AssetItem {
  id: string
  type: AssetType
  filename: string
  display_name: string
  width: number | null
  height: number | null
  visibility: Visibility
  owner_id: string
  owner?: { name: string | null; avatar_url: string | null }
  is_mine: boolean
  tags: string[]
  created_at: string
}
interface QueueItem {
  key: string
  file: File
  status: QueueStatus
  error?: string
  asset?: AssetItem
}
interface BatchDeleteResult {
  id: string
  result: "deleted" | "forbidden" | "already_deleted" | "not_found"
  reason?: string
}

const TYPE_LABELS: Record<AssetType, string> = {
  product_image: "产品图",
  reference_image: "参考图",
  template_material: "普通模板图",
  generated_image: "生成图",
}
const MAX_FILES = 50
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

function errorMessage(json: unknown, fallback: string) {
  if (json && typeof json === "object" && "error" in json) {
    const error = (json as { error?: { message?: string } }).error
    if (error?.message) return error.message
  }
  return fallback
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    const result = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return result
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法读取图片")) }
    image.src = url
  })
}

async function validateFile(file: File): Promise<string | null> {
  if (!ALLOWED_MIME.has(file.type)) return "仅支持 JPG、PNG、WebP"
  if (file.size > MAX_BYTES) return "文件超过 20MB"
  try {
    const dimensions = await readDimensions(file)
    if (dimensions.width < 200 || dimensions.height < 200) return "尺寸不能小于 200×200"
  } catch {
    return "无法读取图片尺寸"
  }
  return null
}

export function AssetManager() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [items, setItems] = useState<AssetItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(24)
  const [scope, setScope] = useState("default")
  const [type, setType] = useState("")
  const [visibility, setVisibility] = useState("")
  const [query, setQuery] = useState("")
  const [appliedQuery, setAppliedQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [tagDraft, setTagDraft] = useState("")
  const [batchBusy, setBatchBusy] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadType, setUploadType] = useState<UploadType>("product_image")
  const [queue, setQueue] = useState<QueueItem[]>([])
  const queueRef = useRef<QueueItem[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const runningRef = useRef(false)
  const runIdRef = useRef(0)
  const selectionIdRef = useRef(0)
  const queueKeyRef = useRef(0)
  const loadIdRef = useRef(0)
  const [uploadRunning, setUploadRunning] = useState(false)

  // 缩略图很小，签名 URL 并发拉取（与一页 24 张匹配）。
  const { urls: signedUrls, enqueueMany: enqueueSigned, reset: resetSigned } = useSignedUrls(24, "thumb")

  const notify = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setMessage({ text, kind })
    window.setTimeout(() => setMessage(null), 3200)
  }, [])

  const updateQueue = useCallback((key: string, patch: Partial<QueueItem>) => {
    queueRef.current = queueRef.current.map((item) => item.key === key ? { ...item, ...patch } : item)
    setQueue(queueRef.current)
  }, [])

  const loadAssets = useCallback(async (requestedPage = page) => {
    const loadId = ++loadIdRef.current
    setLoading(true)
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(pageSize) })
    if (scope !== "default") params.set("scope", scope)
    if (type) params.set("type", type)
    if (visibility) params.set("visibility", visibility)
    if (appliedQuery) params.set("q", appliedQuery)
    try {
      const response = await fetch(`/api/assets?${params}`)
      const json = await response.json()
      if (loadId !== loadIdRef.current) return
      if (!response.ok) throw new Error(errorMessage(json, "素材加载失败"))
      const nextItems = (json.data?.items || []) as AssetItem[]
      setItems(nextItems)
      setTotal(json.data?.total || 0)
      // 预取当前页签名 URL（LazyThumb 会在进入视口时直接使用）
      enqueueSigned(nextItems.map((it) => it.id))
    } catch (error) {
      if (loadId !== loadIdRef.current) return
      notify(error instanceof Error ? error.message : "素材加载失败", "error")
    } finally {
      if (loadId === loadIdRef.current) setLoading(false)
    }
  }, [appliedQuery, notify, page, pageSize, scope, type, visibility])

  useEffect(() => {
    fetch("/api/auth/me").then((res) => res.json()).then((json) => {
      const nextUser = json.data?.user || null
      setUser(nextUser)
      if (nextUser?.role === "admin") setScope("all")
    })
  }, [])
  useEffect(() => { loadAssets() }, [loadAssets])
  useEffect(() => { setPage(1) }, [scope, type, visibility, appliedQuery])

  const detail = useMemo(() => items.find((item) => item.id === detailId) || null, [detailId, items])
  const writableIds = useMemo(() => new Set(items.filter((item) => item.is_mine || user?.role === "admin").map((item) => item.id)), [items, user])
  const selectedIds = useMemo(() => Array.from(selected).filter((id) => writableIds.has(id)), [selected, writableIds])
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const toggleSelected = (item: AssetItem) => {
    if (!item.is_mine && user?.role !== "admin") return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
      return next
    })
  }

  const runBatch = async (body: Record<string, unknown>, successText: string) => {
    if (!selectedIds.length) return
    setBatchBusy(true)
    try {
      const response = await fetch("/api/assets/batch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ids: selectedIds }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(errorMessage(json, "批量操作失败"))
      notify(successText)
      await loadAssets()
    } catch (error) { notify(error instanceof Error ? error.message : "批量操作失败", "error") }
    finally { setBatchBusy(false) }
  }

  const deleteSelected = async () => {
    if (!selectedIds.length) return
    const count = selectedIds.length
    if (!window.confirm(`确认软删除已选的 ${count} 项素材？\n\n删除后将从默认列表隐藏，但不会删除原始文件或历史生成记录。`)) return

    setBatchBusy(true)
    try {
      const response = await fetch("/api/assets/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: selectedIds }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(errorMessage(json, "批量删除失败"))

      const results = (json.data?.results || []) as BatchDeleteResult[]
      const deletedIds = new Set(results.filter((item) => item.result === "deleted").map((item) => item.id))
      const affected = deletedIds.size
      const failed = results.length - affected
      setSelected((current) => new Set(Array.from(current).filter((id) => !deletedIds.has(id))))
      if (detailId && deletedIds.has(detailId)) {
        setDetailId(null)
        setEditingName(false)
      }

      const nextPage = affected >= items.length && page > 1 ? page - 1 : page
      if (nextPage !== page) setPage(nextPage)
      await loadAssets(nextPage)
      notify(failed > 0 ? `已软删除 ${affected} 项，${failed} 项未处理` : `已软删除 ${affected} 项`, failed > 0 ? "error" : "ok")
    } catch (error) {
      notify(error instanceof Error ? error.message : "批量删除失败", "error")
    } finally {
      setBatchBusy(false)
    }
  }

  const saveName = async () => {
    if (!detail) return
    const displayName = nameDraft.trim()
    if (!displayName || displayName.length > 100) { notify("展示名称需为 1～100 个字符", "error"); return }
    try {
      const response = await fetch(`/api/assets/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: displayName }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(errorMessage(json, "改名失败"))
      setItems((current) => current.map((item) => item.id === detail.id ? { ...item, display_name: displayName } : item))
      setEditingName(false)
      notify("展示名称已更新")
    } catch (error) { notify(error instanceof Error ? error.message : "改名失败", "error") }
  }

  const chooseFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectionId = ++selectionIdRef.current
    const files = Array.from(event.target.files || [])
    event.target.value = ""
    if (!files.length) return
    const remaining = Math.max(0, MAX_FILES - queueRef.current.length)
    const accepted = files.slice(0, remaining)
    const next: QueueItem[] = []
    for (const file of accepted) {
      const error = await validateFile(file)
      if (selectionId !== selectionIdRef.current) return
      next.push({ key: `${Date.now()}-${++queueKeyRef.current}`, file, status: error ? "failed" : "waiting", error: error || undefined })
    }
    if (selectionId !== selectionIdRef.current) return
    queueRef.current = [...queueRef.current, ...next]
    setQueue(queueRef.current)
    if (files.length > remaining) notify(`每批最多 ${MAX_FILES} 张，超出部分未加入`, "error")
  }

  const uploadOne = useCallback(async (item: QueueItem, runId: number) => {
    if (runId !== runIdRef.current) return null
    const controller = new AbortController()
    controllers.current.set(item.key, controller)
    updateQueue(item.key, { status: "uploading", error: undefined })
    try {
      const form = new FormData()
      form.append("file", item.file)
      form.append("type", uploadType)
      const response = await fetch("/api/assets/upload", { method: "POST", body: form, signal: controller.signal })
      const json = await response.json()
      if (!response.ok) throw new Error(errorMessage(json, "上传失败"))
      const asset = (json.data?.asset || json.data) as AssetItem
      if (runId !== runIdRef.current) return null
      updateQueue(item.key, { status: "success", asset })
      return asset
    } catch (error) {
      if (runId === runIdRef.current) {
        if (controller.signal.aborted) updateQueue(item.key, { status: "cancelled", error: "已取消" })
        else updateQueue(item.key, { status: "failed", error: error instanceof Error ? error.message : "上传失败" })
      }
      return null
    } finally {
      if (controllers.current.get(item.key) === controller) controllers.current.delete(item.key)
    }
  }, [updateQueue, uploadType])

  const revealSuccesses = useCallback(async (successes: AssetItem[]) => {
    if (!successes.length) return
    setScope("mine")
    setType(uploadType)
    setVisibility("private")
    setQuery("")
    setAppliedQuery("")
    setPage(1)
    setItems(successes)
    setTotal(successes.length)
    loadIdRef.current += 1
    setLoading(false)
    setSelected((current) => new Set([...current, ...successes.map((asset) => asset.id)]))
  }, [uploadType])

  const startUploads = async () => {
    if (runningRef.current) return
    const pending = queueRef.current.filter((item) => item.status === "waiting")
    if (!pending.length) return
    const runId = ++runIdRef.current
    runningRef.current = true
    setUploadRunning(true)
    let cursor = 0
    const successes: AssetItem[] = []
    const worker = async () => {
      while (cursor < pending.length) {
        if (runId !== runIdRef.current) return
        const item = pending[cursor++]
        const asset = await uploadOne(item, runId)
        if (runId !== runIdRef.current) return
        if (asset) successes.push(asset)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker))
      if (runId !== runIdRef.current) return
      if (successes.length) {
        await revealSuccesses(successes)
        notify(`已上传 ${successes.length} 张，成功项已选中`)
      }
    } finally {
      if (runId === runIdRef.current) {
        runningRef.current = false
        setUploadRunning(false)
      }
    }
  }

  const retryItem = async (item: QueueItem) => {
    if (runningRef.current || (item.status !== "failed" && item.status !== "cancelled")) return
    const validationRunId = runIdRef.current
    const validationError = await validateFile(item.file)
    if (validationRunId !== runIdRef.current) return
    if (item.status !== queueRef.current.find((entry) => entry.key === item.key)?.status) return
    if (validationError) { updateQueue(item.key, { status: "failed", error: validationError }); return }
    const runId = ++runIdRef.current
    runningRef.current = true
    setUploadRunning(true)
    updateQueue(item.key, { status: "waiting", error: undefined })
    try {
      const asset = await uploadOne({ ...item, status: "waiting" }, runId)
      if (runId !== runIdRef.current) return
      if (asset) { await revealSuccesses([asset]); notify("素材上传成功，已选中") }
    } finally {
      if (runId === runIdRef.current) {
        runningRef.current = false
        setUploadRunning(false)
      }
    }
  }

  const closeUpload = () => {
    const unfinished = queueRef.current.some((item) => item.status === "waiting" || item.status === "uploading")
    if (unfinished && !window.confirm("上传队列尚未完成，确认关闭？上传中的项目将被取消。")) return
    runIdRef.current += 1
    selectionIdRef.current += 1
    controllers.current.forEach((controller) => controller.abort())
    controllers.current.clear()
    runningRef.current = false
    setUploadRunning(false)
    queueRef.current = []
    setQueue([])
    setUploadOpen(false)
  }

  return (
    <div className="asset-manager">
      {message && <div className={`asset-toast ${message.kind}`}>{message.text}</div>}
      <div className="asset-page-head">
        <div><h1>素材管理</h1><p>产品图、参考图和普通模板图统一管理</p></div>
        <div className="asset-head-actions"><a className="button" href={user?.role === "designer" ? "/designer" : "/operator"}>返回工作台</a><button className="button primary" onClick={() => { selectionIdRef.current += 1; setUploadOpen(true) }}>上传素材</button></div>
      </div>

      <div className="asset-toolbar">
        <form onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query.trim()) }} className="asset-search">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索展示名称或原始文件名" maxLength={100} />
          <button className="button" type="submit">搜索</button>
        </form>
        <select value={scope} onChange={(event) => setScope(event.target.value)}><option value="default">我的 + 公开</option><option value="mine">仅我的</option><option value="public">公开素材</option><option value="private">我的私有</option>{user?.role === "admin" && <option value="all">全部素材</option>}</select>
        <select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部类型</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="">全部可见性</option><option value="private">私有</option><option value="public">公开</option></select>
      </div>

      {selectedIds.length > 0 && <div className="asset-batchbar">
        <strong>已选 {selectedIds.length} 项</strong>
        <button disabled={batchBusy} className="button" onClick={() => runBatch({ action: "set_visibility", visibility: "public" }, "已设为公开")}>设为公开</button>
        <button disabled={batchBusy} className="button" onClick={() => runBatch({ action: "set_visibility", visibility: "private" }, "已设为私有")}>设为私有</button>
        <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="标签，逗号分隔" />
        <button disabled={batchBusy || !tagDraft.trim()} className="button" onClick={() => runBatch({ action: "add_tags", tags: tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean) }, "标签已添加")}>添加标签</button>
        <button disabled={batchBusy || !tagDraft.trim()} className="button" onClick={() => runBatch({ action: "remove_tags", tags: tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean) }, "标签已移除")}>移除标签</button>
        <button disabled={batchBusy} className="button danger" onClick={deleteSelected}>批量删除</button>
        <button className="button" onClick={() => setSelected(new Set())}>取消选择</button>
      </div>}

      <div className="asset-layout">
        <section>
          {loading ? <div className="asset-empty">加载中...</div> : items.length === 0 ? <div className="asset-empty">没有符合条件的素材</div> : <div className="asset-grid">
            {items.map((item) => {
              const writable = item.is_mine || user?.role === "admin"
              const ownerName = item.owner?.name || (item.is_mine ? "我" : item.owner_id.slice(0, 8))
              return <article key={item.id} className={`asset-card ${detailId === item.id ? "active" : ""}`} onClick={() => setDetailId(item.id)}>
                <div className="asset-thumb"><LazyThumb assetId={item.id} signedUrl={signedUrls[item.id]} alt={item.display_name} /><span className={`asset-visibility ${item.visibility}`}>{item.visibility === "public" ? "公开" : "私有"}</span>{writable && <input aria-label={`选择 ${item.display_name}`} type="checkbox" checked={selected.has(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(item)} />}</div>
                <div className="asset-card-body"><h3 title={item.display_name}>{item.display_name}</h3><p>{TYPE_LABELS[item.type]} · {item.width || "?"}×{item.height || "?"}</p><p className="asset-card-owner" title={item.owner?.name || item.owner_id}>{ownerName}</p><div className="asset-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
              </article>
            })}
          </div>}
          <div className="asset-pagination"><button className="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} / {pageCount} 页，共 {total} 项</span><button className="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页</button></div>
        </section>

        <aside className="asset-detail">
          {!detail ? <div className="asset-empty">选择一项查看详情</div> : <>
            <div className="asset-detail-image"><img src={`/api/assets/${detail.id}/preview`} alt={detail.display_name} /></div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <a className="button" href={`/api/assets/${detail.id}/preview?download=1`} target="_blank" rel="noreferrer">⬇ 下载原图</a>
              <a className="button" href={`/api/assets/${detail.id}/preview`} target="_blank" rel="noreferrer">🔍 新窗口打开</a>
            </div>
            <div className="asset-detail-title"><span>展示名称</span>{editingName ? <div className="asset-name-editor"><input autoFocus value={nameDraft} maxLength={100} onChange={(event) => setNameDraft(event.target.value)} /><button className="button primary" onClick={saveName}>保存</button><button className="button" onClick={() => setEditingName(false)}>取消</button></div> : <div><strong>{detail.display_name}</strong>{(detail.is_mine || user?.role === "admin") && <button className="button" onClick={() => { setNameDraft(detail.display_name); setEditingName(true) }}>改名</button>}</div>}</div>
            <dl><dt>原始文件名</dt><dd>{detail.filename}</dd><dt>类型</dt><dd>{TYPE_LABELS[detail.type]}</dd><dt>尺寸</dt><dd>{detail.width || "?"}×{detail.height || "?"}</dd><dt>所有者</dt><dd>{detail.owner?.name || detail.owner_id}</dd><dt>可见性</dt><dd>{detail.visibility === "public" ? "公开" : "私有"}</dd><dt>创建时间</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd><dt>标签</dt><dd>{detail.tags.join("、") || "无"}</dd></dl>
          </>}
        </aside>
      </div>

      {uploadOpen && <div className="asset-modal-backdrop" role="presentation"><div className="asset-upload-modal" role="dialog" aria-modal="true" aria-label="批量上传素材">
        <div className="asset-modal-head"><div><h2>批量上传</h2><p>单批最多 50 张，单张不超过 20MB，并发 3 张</p></div><button className="icon-button" aria-label="关闭" onClick={closeUpload}>×</button></div>
        <div className="asset-upload-controls"><label>本批类型<select value={uploadType} disabled={queue.length > 0} onChange={(event) => setUploadType(event.target.value as UploadType)}><option value="product_image">产品图</option><option value="reference_image">参考图</option><option value="template_material">普通模板图</option></select></label><label className="button">选择图片<input hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} /></label><button className="button primary" disabled={!queue.some((item) => item.status === "waiting") || uploadRunning} onClick={startUploads}>开始上传</button></div>
        <div className="asset-queue">{queue.length === 0 ? <div className="asset-empty">选择同一类型的图片加入队列</div> : queue.map((item) => <div className="asset-queue-row" key={item.key}><div><strong>{item.file.name}</strong><span>{(item.file.size / 1024 / 1024).toFixed(2)}MB</span></div><span className={`queue-status ${item.status}`}>{({ waiting: "等待", uploading: "上传中", success: "成功", failed: "失败", cancelled: "已取消" } as Record<QueueStatus, string>)[item.status]}</span>{item.error && <span className="queue-error">{item.error}</span>}<div className="asset-queue-actions">{item.status === "waiting" && <button className="button" onClick={() => { queueRef.current = queueRef.current.filter((entry) => entry.key !== item.key); setQueue(queueRef.current) }}>移除</button>}{item.status === "uploading" && <button className="button" onClick={() => controllers.current.get(item.key)?.abort()}>取消</button>}{(item.status === "failed" || item.status === "cancelled") && <button className="button" disabled={uploadRunning} onClick={() => retryItem(item)}>重试</button>}</div></div>)}</div>
        <div className="asset-modal-foot"><span>成功 {queue.filter((item) => item.status === "success").length} / {queue.length}</span><button className="button" onClick={closeUpload}>关闭</button></div>
      </div></div>}
    </div>
  )
}
