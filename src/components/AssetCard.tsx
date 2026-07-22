"use client"

import * as React from "react"

interface AssetCardProps {
  id: string
  filename: string
  width: number | null
  height: number | null
  previewUrl?: string
  type?: string
  selected?: boolean
  onSelect?: (id: string) => void
  onDelete?: (id: string) => void
  /** 自动预览：加载到视口时触发一次 signed-url 拉取。父组件负责去重/并发控制。 */
  onRequestPreview?: (id: string) => void
}

export function AssetCard({
  id,
  filename,
  width,
  height,
  previewUrl,
  type,
  selected = false,
  onSelect,
  onDelete,
  onRequestPreview,
}: AssetCardProps) {
  const [errored, setErrored] = React.useState(false)
  const ref = React.useRef<HTMLDivElement | null>(null)
  const requestedRef = React.useRef(false)

  React.useEffect(() => {
    if (previewUrl || requestedRef.current) return
    if (!onRequestPreview) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      requestedRef.current = true
      onRequestPreview(id)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          if (ent.isIntersecting && !requestedRef.current) {
            requestedRef.current = true
            onRequestPreview(id)
          }
        }
      },
      { rootMargin: "200px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [id, previewUrl, onRequestPreview])

  return (
    <div
      ref={ref}
      className={`history-card ${selected ? "active" : ""}`}
      style={{ cursor: onSelect ? "pointer" : "default", borderColor: selected ? "var(--primary)" : undefined }}
      onClick={() => onSelect?.(id)}
    >
      <div className="thumb-wrap">
        {previewUrl && !errored ? (
          <img
            src={previewUrl}
            alt={filename}
            loading="lazy"
            onError={() => setErrored(true)}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f1f5f9",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            {previewUrl === undefined ? "加载中…" : "无预览"}
          </div>
        )}
        {selected && <span className="selected-badge">已选</span>}
      </div>
      <div className="history-card-body">
        <div className="history-title-row">
          <h3
            style={{
              fontSize: 13,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={filename}
          >
            {filename}
          </h3>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {type && (
            <span className="count-pill" style={{ fontSize: 11, padding: "2px 8px" }}>
              {type}
            </span>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            {width && height ? `${width}×${height}` : "尺寸未知"}
          </span>
        </div>
        <div className="history-actions" style={{ justifyContent: "flex-end" }}>
          {onDelete && (
            <button
              type="button"
              className="button"
              style={{ minHeight: 30, padding: "4px 10px", fontSize: 12, color: "var(--danger)" }}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(id)
              }}
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
