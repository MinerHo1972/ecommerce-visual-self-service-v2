"use client"

import * as React from "react"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"
import { Field } from "@/components/ui/Field"

export interface TextEditSubmitData {
  originalText: string
  replacementText: string
  instruction: string
}

interface TextEditModalProps {
  open: boolean
  templateName: string
  previewUrl: string
  onClose: () => void
  onSubmit: (data: TextEditSubmitData) => void
  submitting?: boolean
}

export function TextEditModal({
  open,
  templateName,
  previewUrl,
  onClose,
  onSubmit,
  submitting = false,
}: TextEditModalProps) {
  const [originalText, setOriginalText] = React.useState("")
  const [replacementText, setReplacementText] = React.useState("")
  const [instruction, setInstruction] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setOriginalText("")
      setReplacementText("")
      setInstruction("")
    }
  }, [open])

  if (!open) return null

  const handleSubmit = () => {
    onSubmit({ originalText: originalText.trim(), replacementText: replacementText.trim(), instruction: instruction.trim() })
  }

  const canSubmit = originalText.trim() && replacementText.trim() && !submitting

  return (
    <div
      className="template-picker-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="template-picker-modal text-edit-modal"
        style={{ background: "#fff", borderRadius: 12, maxWidth: 720, width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-edit-modal-head" style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="eyebrow" style={{ margin: 0, fontSize: 12, color: "var(--muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>文字修改</p>
            <h3 style={{ margin: "4px 0 4px", fontSize: 18 }}>生成可复用的新模板</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>填入原文字与替换文字，AI 将在该模板基础上替换文字并保持整体风格。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭" style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1 }}>
            ✕
          </button>
        </div>
        <div className="text-edit-layout" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, padding: 20 }}>
          <div className="text-edit-preview" style={{ display: "grid", gap: 8 }}>
            <img src={previewUrl} alt={templateName} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }} />
            <span style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>{templateName}</span>
          </div>
          <div className="text-edit-form" style={{ display: "grid", gap: 12 }}>
            <Field label="原文字">
              <Input value={originalText} onChange={(e) => setOriginalText(e.target.value)} placeholder="例如：618" />
            </Field>
            <Field label="替换为">
              <Input value={replacementText} onChange={(e) => setReplacementText(e.target.value)} placeholder="例如：中秋节" />
            </Field>
            <Field label="补充要求" hint="可选：对字体、颜色、排版的额外说明">
              <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="例如：保持原有书法风格，颜色改为喜庆红" style={{ minHeight: 80 }} />
            </Field>
            <div className="text-edit-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button type="button" className="button" onClick={onClose}>取消</button>
              <button type="button" className="button primary" disabled={!canSubmit} onClick={handleSubmit}>
                {submitting ? "生成中..." : "生成新模板"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
