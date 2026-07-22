"use client"

import * as React from "react"
import { AssetCard } from "@/components/AssetCard"
import { FileButton } from "@/components/ui/FileButton"
import { useSignedUrls } from "@/lib/hooks/useSignedUrls"

export interface AssetLike {
  id: string
  filename: string
  width: number | null
  height: number | null
  type?: string
}

export interface FinishedImageLike {
  id: string
  /** 显示名称（任务号+v#） */
  label: string
  width: number | null
  height: number | null
  preview_url: string
  /** 对应的 asset id（若有）—— 作为 base_asset_id 传给后端 */
  asset_id?: string | null
  created_at?: string
}

interface BaseImagePickerProps {
  assets: AssetLike[]
  finishedImages: FinishedImageLike[]
  loadingAssets?: boolean
  loadingFinished?: boolean
  selectedAssetId: string | null
  selectedFinishedId: string | null
  onSelectAsset: (id: string) => void
  onSelectFinished: (id: string) => void
  onDeleteAsset: (id: string) => void
  onUpload: (file: File) => Promise<void>
  uploading?: boolean
  onRefreshAssets: () => void
}

type Tab = "assets" | "finished"

export function BaseImagePicker({
  assets,
  finishedImages,
  loadingAssets,
  loadingFinished,
  selectedAssetId,
  selectedFinishedId,
  onSelectAsset,
  onSelectFinished,
  onDeleteAsset,
  onUpload,
  uploading,
  onRefreshAssets,
}: BaseImagePickerProps) {
  const [tab, setTab] = React.useState<Tab>("assets")
  const assetUrls = useSignedUrls(6)
  // 资产加载后批量入队
  React.useEffect(() => {
    if (assets.length === 0) return
    assetUrls.enqueueMany(assets.map((a) => a.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map((a) => a.id).join(",")])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    await onUpload(f)
    // 重置 input 以便再次选择同一文件
    e.target.value = ""
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>基础图库</h2>
        <span className="count-pill">{tab === "assets" ? assets.length : finishedImages.length}</span>
      </div>
      <div style={{ padding: "0 16px 12px", display: "grid", gap: 10 }}>
        <div className="source-tabs" style={{ width: "fit-content" }}>
          <button
            type="button"
            className={`source-tab ${tab === "assets" ? "active" : ""}`}
            onClick={() => setTab("assets")}
          >
            我的资产
          </button>
          <button
            type="button"
            className={`source-tab ${tab === "finished" ? "active" : ""}`}
            onClick={() => setTab("finished")}
          >
            成品图
          </button>
        </div>

        {tab === "assets" && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FileButton
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFile as any}
                disabled={!!uploading}
              >
                {uploading ? "上传中..." : "+ 上传图片"}
              </FileButton>
              <button
                type="button"
                className="button"
                style={{ minHeight: 34, padding: "6px 12px", fontSize: 13 }}
                onClick={onRefreshAssets}
              >
                刷新
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              JPEG/PNG/WebP · 最大 20MB · 选一张作为多区域编辑的基础图
            </p>
          </>
        )}
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        {tab === "assets" ? (
          assets.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <p style={{ margin: 0 }}>{loadingAssets ? "加载中..." : "暂无资产，上传商品图后使用"}</p>
            </div>
          ) : (
            <div className="history-grid">
              {assets.map((a) => (
                <AssetCard
                  key={a.id}
                  id={a.id}
                  filename={a.filename}
                  width={a.width}
                  height={a.height}
                  type={a.type}
                  previewUrl={assetUrls.urls[a.id]}
                  selected={selectedAssetId === a.id && !selectedFinishedId}
                  onSelect={onSelectAsset}
                  onDelete={onDeleteAsset}
                  onRequestPreview={assetUrls.enqueue}
                />
              ))}
            </div>
          )
        ) : finishedImages.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <p style={{ margin: 0 }}>
              {loadingFinished ? "加载中..." : "暂无成品图，完成一次生图后即可在这里作为基础图继续编辑"}
            </p>
          </div>
        ) : (
          <div className="history-grid">
            {finishedImages.map((img) => (
              <div
                key={img.id}
                className={`history-card ${selectedFinishedId === img.id ? "active" : ""}`}
                style={{
                  cursor: "pointer",
                  borderColor: selectedFinishedId === img.id ? "var(--primary)" : undefined,
                }}
                onClick={() => onSelectFinished(img.id)}
              >
                <div className="thumb-wrap">
                  <img
                    src={img.preview_url}
                    alt={img.label}
                    loading="lazy"
                    style={{ objectFit: "cover" }}
                  />
                  {selectedFinishedId === img.id && <span className="selected-badge">已选</span>}
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
                      title={img.label}
                    >
                      {img.label}
                    </h3>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="count-pill" style={{ fontSize: 11, padding: "2px 8px" }}>
                      成品图
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {img.width && img.height ? `${img.width}×${img.height}` : "尺寸未知"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
