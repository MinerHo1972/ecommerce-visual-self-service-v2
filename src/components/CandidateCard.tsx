"use client"

import * as React from "react"

export interface CandidateQualityInfo {
  label: string
  color: string
  qc: any
}

interface CandidateCardProps {
  id: string
  previewUrl: string
  versionNo: number
  variantIndex: number
  isSelected: boolean
  active?: boolean
  parentGeneratedImageId?: string | null
  qualityInfo: CandidateQualityInfo
  onPreview?: () => void
  onSelect?: () => void
  onContinueEdit?: () => void
  onDelete?: () => void
  /** 是否显示"选择采用/继续改图/删除"操作 */
  canOperate?: boolean
  /** 是否已经处于"继续改图"激活态（外部控制，显示改图输入区） */
  editActive?: boolean
  editInstruction?: string
  onEditInstructionChange?: (v: string) => void
  onSubmitEdit?: () => void
  onCancelEdit?: () => void
  /** P1：将该候选作为多区域精修的新底图 */
  onUseAsBase?: () => void
}

export function CandidateCard({
  previewUrl,
  versionNo,
  variantIndex,
  isSelected,
  active = false,
  parentGeneratedImageId,
  qualityInfo,
  onPreview,
  onSelect,
  onContinueEdit,
  onDelete,
  onUseAsBase,
  canOperate = false,
  editActive = false,
  editInstruction = "",
  onEditInstructionChange,
  onSubmitEdit,
  onCancelEdit,
}: CandidateCardProps) {
  return (
    <div className={`candidate-card ${active || isSelected ? "active" : ""}`.trim()}>
      <div className="thumb-wrap" style={{ aspectRatio: "1 / 1", cursor: onPreview ? "zoom-in" : "default" }} onClick={onPreview}>
        <img src={previewUrl} alt={`v${versionNo}-${variantIndex}`} loading="lazy" />
        {isSelected && <span className="selected-badge">已采用</span>}
        <span
          className="count-pill"
          style={{ position: "absolute", right: 10, top: 10, fontSize: 11, padding: "2px 8px", background: "rgba(255,255,255,.92)" }}
        >
          v{versionNo} #{variantIndex}
        </span>
      </div>
      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
          <span className="muted">
            v{versionNo} #{variantIndex}
            {parentGeneratedImageId && <span style={{ marginLeft: 6 }}>· 改图</span>}
          </span>
          <span style={{ color: qualityInfo.color, fontWeight: 600 }}>{qualityInfo.label}</span>
        </div>
        {canOperate && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!isSelected && onSelect && (
              <button type="button" className="button primary" style={{ minHeight: 30, padding: "4px 10px", fontSize: 12 }} onClick={onSelect}>
                选择采用
              </button>
            )}
            {onContinueEdit && (
              <button type="button" className="button" style={{ minHeight: 30, padding: "4px 10px", fontSize: 12 }} onClick={onContinueEdit}>
                {editActive ? "取消改图" : "继续改图"}
              </button>
            )}
            {onUseAsBase && (
              <button type="button" className="button" style={{ minHeight: 30, padding: "4px 10px", fontSize: 12 }} onClick={onUseAsBase} title="把这张候选图作为新底图，进入多区域精修">
                用作新底图
              </button>
            )}
            {!isSelected && onDelete && (
              <button type="button" className="button" style={{ minHeight: 30, padding: "4px 10px", fontSize: 12, color: "var(--danger)" }} onClick={onDelete}>
                删除
              </button>
            )}
          </div>
        )}
        {editActive && onEditInstructionChange && onSubmitEdit && (
          <div style={{ display: "grid", gap: 6 }}>
            <input
              type="text"
              className="input"
              value={editInstruction}
              onChange={(e) => onEditInstructionChange(e.target.value)}
              placeholder="输入改图指令..."
              style={{ fontSize: 12, padding: "6px 8px" }}
            />
            <button type="button" className="button primary" style={{ minHeight: 30, padding: "4px 10px", fontSize: 12 }} onClick={onSubmitEdit}>
              提交改图
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
