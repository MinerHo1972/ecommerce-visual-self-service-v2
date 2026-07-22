"use client"

import * as React from "react"

interface ImagePreviewModalProps {
  open: boolean
  imageUrl: string
  alt?: string
  onClose: () => void
}

export function ImagePreviewModal({ open, imageUrl, alt = "预览", onClose }: ImagePreviewModalProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ref-preview-overlay" onClick={onClose}>
      <div className="ref-preview-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ref-preview-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <img className="ref-preview-img" src={imageUrl} alt={alt} />
      </div>
    </div>
  )
}
