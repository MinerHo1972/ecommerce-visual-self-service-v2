"use client"

import * as React from "react"

export interface PickerRect {
  x: number
  y: number
  width: number
  height: number
}

export interface RegionItem {
  /** 稳定 id（前端生成 uuid） */
  id: string
  /** 1-based 序号（当前列表中的展示序号） */
  index: number
  /** 百分比坐标 0~1 */
  rect: PickerRect
}

interface MultiRegionPickerProps {
  imageUrl: string
  canvasSize: { w: number; h: number }
  /** 受控：当前已选区域列表 */
  value: RegionItem[]
  /** 区域变化回调（含重新编号后的完整列表） */
  onChange: (regions: RegionItem[]) => void
  /** 是否允许多选。false = 单矩形模式（兼容旧用法） */
  multiple?: boolean
  className?: string
  /** 只读：false 时允许交互 */
  readonly?: boolean
  /** 区域上限，超过时阻止新建并回调 onLimit */
  maxRegions?: number
  onLimit?: (max: number) => void
}

type Pt = { x: number; y: number }

type DragMode =
  | { kind: 'create'; start: Pt; current: Pt }
  | { kind: 'move'; id: string; origin: PickerRect; anchor: Pt }
  | { kind: 'resize'; id: string; origin: PickerRect; anchor: Pt; handle: 'se' | 'ne' | 'sw' | 'nw' }
  | null

function rectFromPoints(a: Pt, b: Pt): PickerRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

function toPercentStyle(r: PickerRect) {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.width * 100}%`,
    height: `${r.height * 100}%`,
  }
}

function genId() {
  return `r_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`
}

const HANDLE_SIZE = 10

/**
 * 多区域框选组件（P1 升级版）。
 * - 在图片上拖拽（鼠标按下→拖动→抬起）形成矩形
 * - multiple=true：可连续框选多个矩形，自动编号 1/2/3/4，颜色 primary/accent 交替
 * - multiple=false：单矩形模式（最多保留一个）
 * - hover 时右上角显示 × 删除按钮，右下角显示拖拽手柄支持调整大小
 * - 支持拖动已有框（在框内按下并拖动）
 */
const ZOOM_OPTIONS = [1, 1.5, 2, 3, 4] as const

export function MultiRegionPicker({
  imageUrl,
  canvasSize,
  value,
  onChange,
  multiple = true,
  className = "",
  readonly = false,
  maxRegions = 8,
  onLimit,
}: MultiRegionPickerProps) {
  const [drag, setDrag] = React.useState<DragMode>(null)
  const [hoverId, setHoverId] = React.useState<string | null>(null)
  const [zoom, setZoom] = React.useState<number>(1)

  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  // 切换缩放后让已选第一个区域滚到视野中央
  const centerOnRegions = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el || value.length === 0) return
    // 找到所有框的包围盒中心
    let minX = 1, minY = 1, maxX = 0, maxY = 0
    value.forEach(r => {
      minX = Math.min(minX, r.rect.x)
      minY = Math.min(minY, r.rect.y)
      maxX = Math.max(maxX, r.rect.x + r.rect.width)
      maxY = Math.max(maxY, r.rect.y + r.rect.height)
    })
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    // 等下一帧 layout 更新后再滚
    requestAnimationFrame(() => {
      const contentW = el.scrollWidth
      const contentH = el.scrollHeight
      el.scrollLeft = cx * contentW - el.clientWidth / 2
      el.scrollTop = cy * contentH - el.clientHeight / 2
    })
  }, [value])

  React.useEffect(() => {
    centerOnRegions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const getPt = React.useCallback((e: { clientX: number; clientY: number }): Pt => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const bounds = el.getBoundingClientRect()
    const px = (e.clientX - bounds.left) / bounds.width
    const py = (e.clientY - bounds.top) / bounds.height
    return {
      x: Math.max(0, Math.min(1, Number(px.toFixed(4)))),
      y: Math.max(0, Math.min(1, Number(py.toFixed(4)))),
    }
  }, [])

  const handleBoxMouseDown = (e: React.MouseEvent<HTMLDivElement>, r: RegionItem, mode: 'move' | 'resize', handle?: 'se' | 'ne' | 'sw' | 'nw') => {
    if (readonly) return
    e.preventDefault()
    e.stopPropagation()
    const pt = getPt(e)
    if (mode === 'move') {
      setDrag({ kind: 'move', id: r.id, origin: { ...r.rect }, anchor: pt })
    } else {
      setDrag({ kind: 'resize', id: r.id, origin: { ...r.rect }, anchor: pt, handle: handle || 'se' })
    }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readonly) return
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // 点在已有框/徽章/手柄/删除按钮上，不由画布处理
    if (target.closest("[data-region-box]") || target.closest("[data-region-delete]") || target.closest("[data-region-handle]")) return

    if (multiple && value.length >= maxRegions) {
      e.preventDefault()
      onLimit?.(maxRegions)
      return
    }

    e.preventDefault()
    const pt = getPt(e)
    setDrag({ kind: 'create', start: pt, current: pt })
  }

  React.useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const pt = getPt(e)
      if (drag.kind === 'create') {
        setDrag({ ...drag, current: pt })
      } else if (drag.kind === 'move') {
        const dx = pt.x - drag.anchor.x
        const dy = pt.y - drag.anchor.y
        let nx = drag.origin.x + dx
        let ny = drag.origin.y + dy
        // 限制不超出画布
        nx = Math.max(0, Math.min(1 - drag.origin.width, nx))
        ny = Math.max(0, Math.min(1 - drag.origin.height, ny))
        const next = value.map((r) => r.id === drag.id ? { ...r, rect: { ...drag.origin, x: nx, y: ny } } : r)
        onChange(next)
      } else if (drag.kind === 'resize') {
        const { origin, handle } = drag
        let x1 = origin.x
        let y1 = origin.y
        let x2 = origin.x + origin.width
        let y2 = origin.y + origin.height
        if (handle.includes('e')) x2 = pt.x
        if (handle.includes('w')) x1 = pt.x
        if (handle.includes('s')) y2 = pt.y
        if (handle.includes('n')) y1 = pt.y
        x1 = Math.max(0, Math.min(1, x1))
        y1 = Math.max(0, Math.min(1, y1))
        x2 = Math.max(0, Math.min(1, x2))
        y2 = Math.max(0, Math.min(1, y2))
        const rx = Math.min(x1, x2)
        const ry = Math.min(y1, y2)
        const rw = Math.abs(x2 - x1)
        const rh = Math.abs(y2 - y1)
        const next = value.map((r) => r.id === drag.id ? { ...r, rect: { x: rx, y: ry, width: rw, height: rh } } : r)
        onChange(next)
      }
    }
    const onUp = () => {
      if (drag.kind === 'create') {
        const rect = rectFromPoints(drag.start, drag.current)
        if (rect.width * canvasSize.w >= 6 && rect.height * canvasSize.h >= 6) {
          const newRegion: RegionItem = { id: genId(), index: 0, rect }
          if (multiple) {
            if (value.length < maxRegions) {
              onChange([...value, newRegion])
            } else {
              onLimit?.(maxRegions)
            }
          } else {
            onChange([newRegion])
          }
        }
      }
      setDrag(null)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [drag, getPt, canvasSize.w, canvasSize.h, multiple, value, onChange, maxRegions, onLimit])

  const handleRemove = (id: string) => {
    if (readonly) return
    onChange(value.filter((r) => r.id !== id))
  }

  const handleClear = () => {
    if (readonly) return
    onChange([])
  }

  const draftRect: PickerRect | null =
    drag?.kind === 'create' ? rectFromPoints(drag.start, drag.current) : null

  return (
    <div className={`multi-region-picker ${className}`.trim()}>
      {/* 缩放工具栏 */}
      {!readonly && (
        <div
          className="region-zoombar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
            fontSize: 12,
            color: "var(--muted)",
            flexWrap: "wrap",
          }}
        >
          <span>缩放：</span>
          {ZOOM_OPTIONS.map((z) => {
            const active = Math.abs(zoom - z) < 0.01
            return (
              <button
                type="button"
                key={z}
                onClick={() => setZoom(z)}
                className={active ? "evss-btn primary" : "evss-btn ghost"}
                style={{ minHeight: 26, padding: "2px 10px", fontSize: 12 }}
                title={`${z}× 显示`}
              >
                {z}×
              </button>
            )
          })}
          <button
            type="button"
            className="evss-btn ghost"
            style={{ minHeight: 26, padding: "2px 10px", fontSize: 12 }}
            onClick={() => setZoom(1)}
            title="适应画布宽度"
          >
            适应
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
            {zoom > 1 ? "滚动画面查看 / 精细框选" : ""}
          </span>
        </div>
      )}
      {/* 滚动容器：放大后内部元素溢出，靠滚动来查看 */}
      <div
        ref={scrollerRef}
        className="region-scroller"
        style={{
          overflow: zoom > 1 ? "auto" : "hidden",
          maxHeight: zoom > 1 ? "72vh" : "none",
          border: zoom > 1 ? "1px solid var(--border)" : "none",
          borderRadius: 6,
          background: "#f8fafc",
        }}
      >
        <div
          ref={containerRef}
          className="region-picker"
          style={{
            aspectRatio: `${canvasSize.w} / ${canvasSize.h}`,
            position: "relative",
            userSelect: "none",
            cursor: readonly ? "default" : "crosshair",
            width: zoom > 1 ? `${zoom * 100}%` : "100%",
            transformOrigin: "top left",
          }}
          onMouseDown={handleCanvasMouseDown}
          title={readonly ? "" : "按住鼠标拖选矩形区域；拖框移动/角点调整大小"}
        >
          <img
            src={imageUrl}
            alt="待框选"
            style={{ width: "100%", display: "block", pointerEvents: "none" }}
            draggable={false}
          />
        {value.map((r) => {
          const style = toPercentStyle(r.rect)
          const isAccent = (r.index % 2) === 0
          const borderColor = isAccent ? "var(--accent, #f59e0b)" : "var(--primary, #0f766e)"
          const fillColor = isAccent ? "rgba(245,158,11,0.14)" : "rgba(15,118,110,0.12)"
          const badgeBg = borderColor
          const hovered = hoverId === r.id
          return (
            <div
              key={r.id}
              data-region-box="1"
              style={{
                position: "absolute",
                border: `2px solid ${borderColor}`,
                background: fillColor,
                boxSizing: "border-box",
                cursor: readonly ? "default" : "move",
                ...style,
              }}
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() => setHoverId((cur) => (cur === r.id ? null : cur))}
              onMouseDown={(e) => handleBoxMouseDown(e, r, 'move')}
            >
              {/* 编号徽章 */}
              <span
                data-region-badge="1"
                style={{
                  position: "absolute",
                  left: -2,
                  top: -2,
                  background: badgeBg,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 22,
                  height: 22,
                  padding: "0 6px",
                  borderRadius: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  pointerEvents: "none",
                }}
              >
                {r.index}
              </span>
              {/* 删除按钮 */}
              {!readonly && hovered && (
                <button
                  type="button"
                  data-region-delete="1"
                  onClick={(e) => { e.stopPropagation(); handleRemove(r.id) }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title={`删除区域 ${r.index}`}
                  style={{
                    position: "absolute",
                    right: -10,
                    top: -10,
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    border: "2px solid #fff",
                    background: "var(--danger, #b91c1c)",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: 1,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                >
                  ×
                </button>
              )}
              {/* 4 个 resize 手柄 */}
              {!readonly && hovered && (
                <>
                  {(['nw', 'ne', 'sw', 'se'] as const).map((h) => {
                    const posStyle: React.CSSProperties = {
                      position: "absolute",
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      background: "#fff",
                      border: `2px solid ${borderColor}`,
                      borderRadius: 2,
                      boxSizing: "border-box",
                    }
                    if (h.includes('n')) posStyle.top = -HANDLE_SIZE / 2
                    if (h.includes('s')) posStyle.bottom = -HANDLE_SIZE / 2
                    if (h.includes('w')) posStyle.left = -HANDLE_SIZE / 2
                    if (h.includes('e')) posStyle.right = -HANDLE_SIZE / 2
                    const cursorMap: Record<string, string> = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' }
                    return (
                      <div
                        key={h}
                        data-region-handle={h}
                        style={{ ...posStyle, cursor: cursorMap[h] }}
                        onMouseDown={(e) => handleBoxMouseDown(e, r, 'resize', h)}
                      />
                    )
                  })}
                </>
              )}
            </div>
          )
        })}
        {draftRect && (
          <div
            style={{
              position: "absolute",
              border: "2px dashed var(--primary, #0f766e)",
              background: "rgba(15,118,110,0.08)",
              boxSizing: "border-box",
              pointerEvents: "none",
              ...toPercentStyle(draftRect),
            }}
          />
        )}
        </div>{/* /.region-picker (containerRef) */}
      </div>{/* /.region-scroller (scrollerRef) */}
      <div
        className="region-readout"
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--muted)",
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <span>
          {readonly ? (
            <>已选 {value.length} 个区域</>
          ) : value.length === 0 ? (
            <>在图上按住鼠标拖动以框选矩形区域（最多 {maxRegions} 个）</>
          ) : (
            <>已选 {value.length} 个区域 · 拖框移动/手柄调整/悬停显示 × 删除</>
          )}
        </span>
        {!readonly && value.length > 0 && (
          <button
            type="button"
            className="button"
            style={{ minHeight: 28, padding: "4px 10px", fontSize: 12 }}
            onClick={handleClear}
          >
            清空全部
          </button>
        )}
      </div>
    </div>
  )
}
