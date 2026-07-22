"use client"

import * as React from "react"

export interface PickerRect {
  x: number
  y: number
  width: number
  height: number
}

interface CoordinatePickerProps {
  imageUrl: string
  canvasSize: { w: number; h: number }
  onSelect: (rect: PickerRect) => void
  /** 当前已框选的矩形（百分比 0~1），受控 */
  value?: PickerRect | null
  className?: string
}

type Pt = { x: number; y: number }

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
    left: `${(r.x) * 100}%`,
    top: `${(r.y) * 100}%`,
    width: `${(r.width) * 100}%`,
    height: `${(r.height) * 100}%`,
  }
}

/**
 * 通用坐标框选组件：点击图片任意两点形成矩形，输出百分比坐标（0~1）。
 * 不依赖 V1 的 LayerTemplateJson 类型。
 */
export function CoordinatePicker({
  imageUrl,
  canvasSize,
  onSelect,
  value,
  className = "",
}: CoordinatePickerProps) {
  const [points, setPoints] = React.useState<Pt[]>([])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - bounds.left) / bounds.width
    const py = (e.clientY - bounds.top) / bounds.height
    const next: Pt = {
      x: Math.max(0, Math.min(1, Number(px.toFixed(4)))),
      y: Math.max(0, Math.min(1, Number(py.toFixed(4)))),
    }
    setPoints((prev) => {
      if (prev.length === 0) return [next]
      // 已有一个点，生成矩形并重置
      const rect = rectFromPoints(prev[0], next)
      // 忽略过小的矩形（视为误点）
      if (rect.width * canvasSize.w < 4 || rect.height * canvasSize.h < 4) {
        return [next]
      }
      onSelect(rect)
      return []
    })
  }

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPoints([])
  }

  const draftRect: PickerRect | null =
    value && value.width > 0 && value.height > 0
      ? value
      : points.length === 2
        ? rectFromPoints(points[0], points[1])
        : points.length === 1
          ? { x: points[0].x, y: points[0].y, width: 0, height: 0 }
          : null

  return (
    <div className={`coordinate-picker ${className}`.trim()}>
      <div
        className="region-picker"
        style={{ aspectRatio: `${canvasSize.w} / ${canvasSize.h}`, position: "relative" }}
        onClick={handleClick}
        title="点击两点框选矩形区域"
      >
        <img src={imageUrl} alt="待框选" style={{ width: "100%", display: "block" }} />
        {draftRect && draftRect.width > 0 && (
          <div
            className={`region-box ${draftRect.width > 0.01 && draftRect.height > 0.01 ? "valid" : ""}`}
            style={toPercentStyle(draftRect)}
          />
        )}
        {points.map((p, i) => (
          <span
            key={`${p.x}-${p.y}-${i}`}
            className="point-marker"
            style={{
              position: "absolute",
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              transform: "translate(-50%,-50%)",
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#14b8a6",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="region-readout" style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
        {value && value.width > 0 ? (
          <span>
            已选区域：x {(value.x * 100).toFixed(1)}% · y {(value.y * 100).toFixed(1)}% · w {(value.width * 100).toFixed(1)}% · h {(value.height * 100).toFixed(1)}%
          </span>
        ) : points.length === 0 ? (
          <span>点击图片任意两点以框选矩形区域（百分比坐标）</span>
        ) : (
          <span>已标记第 1 个点，请点击第 2 个点</span>
        )}
        {(points.length > 0 || (value && value.width > 0)) && (
          <button type="button" className="button" style={{ minHeight: 28, padding: "4px 10px", fontSize: 12 }} onClick={handleReset}>
            清除
          </button>
        )}
      </div>
    </div>
  )
}
