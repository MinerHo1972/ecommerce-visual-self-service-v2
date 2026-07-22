"use client"

import * as React from "react"

export interface RegionInstruction {
  id: string
  index: number
  rect: { x: number; y: number; width: number; height: number }
  bbox_norm?: { x1: number; y1: number; x2: number; y2: number }
  instruction: string
  referenceAssetId?: string
  referenceImageUrl?: string
  operationTag?: string
}

interface AssetOption {
  id: string
  filename: string
  width?: number | null
  height?: number | null
}

interface RegionInstructionListProps {
  regions: RegionInstruction[]
  onChange: (regions: RegionInstruction[]) => void
  /** 可选资产列表（用于选择参考图） */
  assets?: AssetOption[]
  /** 可选：从资产拿预览 URL */
  getAssetPreviewUrl?: (assetId: string) => string | undefined
  /** 折叠状态 */
  collapsible?: boolean
}

const OP_TAGS: Array<{ value: string; label: string }> = [
  { value: "text", label: "改文字" },
  { value: "replace", label: "替换物体" },
  { value: "erase", label: "擦除" },
  { value: "recolor", label: "换颜色" },
  { value: "decorate", label: "加装饰" },
  { value: "other", label: "其他" },
]

export function RegionInstructionList({ regions, onChange, assets, getAssetPreviewUrl, collapsible }: RegionInstructionListProps) {
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set())
  /** 当前展开「参考图选择器」的区域 id，null 表示全部关闭 */
  const [pickerOpenFor, setPickerOpenFor] = React.useState<string | null>(null)

  const update = React.useCallback(
    (id: string, patch: Partial<RegionInstruction>) => {
      onChange(regions.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    },
    [regions, onChange]
  )

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (regions.length === 0) {
    return (
      <div className="ri-empty">
        <p>在左侧基础图上框选一个或多个矩形区域后，这里会出现对应指令输入框。</p>
      </div>
    )
  }

  return (
    <div className="ri-list">
      {regions.map((r) => {
        const isCollapsed = collapsible ? collapsedIds.has(r.id) : false
        const accent = (r.index % 2) === 0
        const tagColor = accent ? "var(--accent, #f59e0b)" : "var(--primary, #0f766e)"
        const pickerOpen = pickerOpenFor === r.id
        return (
          <div key={r.id} className="ri-card" data-ri-index={r.index}>
            <div className="ri-head">
              <div className="ri-head-left">
                <span className="ri-badge" style={{ background: tagColor }}>{r.index}</span>
                <span className="ri-coord">
                  x {(r.rect.x * 100).toFixed(1)}% · y {(r.rect.y * 100).toFixed(1)}% · w {(r.rect.width * 100).toFixed(1)}% · h {(r.rect.height * 100).toFixed(1)}%
                </span>
              </div>
              {collapsible && (
                <button type="button" className="ri-mini-btn" onClick={() => toggleCollapse(r.id)}>
                  {isCollapsed ? "展开" : "折叠"}
                </button>
              )}
            </div>

            {!isCollapsed && (
              <>
                <textarea
                  className="ri-textarea"
                  value={r.instruction}
                  onChange={(e) => update(r.id, { instruction: e.target.value })}
                  placeholder={`区域 ${r.index} 指令，例如：替换成一杯黑咖啡、改成 #0f766e 颜色、删除水印、改成中文「限时特惠」`}
                />

                <div className="ri-tags">
                  {OP_TAGS.map((t) => {
                    const active = r.operationTag === t.value
                    return (
                      <button
                        type="button"
                        key={t.value}
                        onClick={() => update(r.id, { operationTag: active ? undefined : t.value })}
                        className={`ri-tag ${active ? "active" : ""}`}
                        style={active ? { background: tagColor, borderColor: tagColor, color: "#fff" } : undefined}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>

                <div className="ri-ref-row">
                  <div className="ri-ref-label">参考图（可选）</div>
                  {r.referenceAssetId && getAssetPreviewUrl?.(r.referenceAssetId) ? (
                    <div className="ri-ref-selected">
                      <img
                        src={getAssetPreviewUrl(r.referenceAssetId)}
                        alt="ref"
                        className="ri-ref-thumb"
                      />
                      <span className="ri-ref-name">
                        {(assets || []).find(a => a.id === r.referenceAssetId)?.filename || "已选"}
                      </span>
                      <button type="button" className="ri-mini-btn danger" onClick={() => update(r.id, { referenceAssetId: undefined })}>清除</button>
                      <button type="button" className="ri-mini-btn" onClick={() => setPickerOpenFor(pickerOpen ? null : r.id)}>更换</button>
                    </div>
                  ) : (
                    <button type="button" className="ri-mini-btn primary" onClick={() => setPickerOpenFor(pickerOpen ? null : r.id)}>
                      + 选择参考图
                    </button>
                  )}

                  {pickerOpen && (
                    <div className="ri-picker">
                      <div className="ri-picker-head">
                        <span>从图库选择参考图</span>
                        <button type="button" className="ri-mini-btn" onClick={() => setPickerOpenFor(null)}>关闭</button>
                      </div>
                      {(assets && assets.length > 0) ? (
                        <div className="ri-picker-grid">
                          {assets.map((a) => {
                            const url = getAssetPreviewUrl?.(a.id)
                            const isSel = a.id === r.referenceAssetId
                            return (
                              <button
                                type="button"
                                key={a.id}
                                className={`ri-picker-cell ${isSel ? "sel" : ""}`}
                                onClick={() => {
                                  update(r.id, { referenceAssetId: a.id })
                                  setPickerOpenFor(null)
                                }}
                                title={a.filename}
                              >
                                <div className="ri-picker-thumb">
                                  {url ? <img src={url} alt={a.filename} /> : <span className="ri-picker-noimg">无预览</span>}
                                </div>
                                <div className="ri-picker-name">{a.filename}</div>
                                {isSel && <div className="ri-picker-sel">✓</div>}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="ri-picker-empty">暂无可选资产，请先上传</div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
