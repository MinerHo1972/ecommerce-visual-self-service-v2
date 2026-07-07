"use client";

import { Eye, Trash2, Upload, X, ImagePlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type ReferenceImage = {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  uploadedAt: string;
};

type ReferenceGalleryPanelProps = {
  onUseAsProduct?: (url: string, name: string) => void;
  onUseAsBackground?: (url: string, name: string) => void;
};

export function ReferenceGalleryPanel({ onUseAsProduct, onUseAsBackground }: ReferenceGalleryPanelProps) {
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ReferenceImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/references");
      const data = await res.json();
      if (data.success) {
        setImages(data.data?.images ?? []);
      } else {
        setError(data.error?.message ?? "加载失败");
      }
    } catch {
      setError("网络异常，无法加载参考图");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/references", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        setUploadError(uploadData.error?.message ?? "上传失败");
        return;
      }

      await fetchImages();
    } catch {
      setUploadError("上传异常，请重试");
    } finally {
      setUploading(false);
      // reset file input
      e.target.value = "";
    }
  }

  async function handleDelete(image: ReferenceImage) {
    setDeletingId(image.id);
    try {
      const res = await fetch(`/api/references?id=${encodeURIComponent(image.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setImages((prev) => prev.filter((img) => img.id !== image.id));
        if (previewImage?.id === image.id) setPreviewImage(null);
      } else {
        setError(data.error?.message ?? "删除失败");
      }
    } catch {
      setError("网络异常，删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString("zh-CN");
    } catch {
      return iso;
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>
            上传参考图片，供 AI 生成时参考风格与构图。共 {images.length} 张。
          </p>
        </div>
        <label className="button primary" style={{ cursor: uploading ? "wait" : "pointer", position: "relative", overflow: "hidden" }}>
          <Upload size={16} />
          {uploading ? "上传中..." : "上传参考图"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            onChange={handleUpload}
          />
        </label>
      </div>

      {uploadError && (
        <div className="alert error">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)}>关闭</button>
        </div>
      )}
      {error && (
        <div className="alert error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      {/* loading */}
      {loading && (
        <div className="empty-state" style={{ minHeight: 180 }}>
          <ImagePlus size={26} />
          <p>加载中...</p>
        </div>
      )}

      {/* empty */}
      {!loading && images.length === 0 && (
        <div className="empty-state" style={{ minHeight: 220 }}>
          <ImagePlus size={30} />
          <p>暂无参考图，点击右上角上传</p>
        </div>
      )}

      {/* grid */}
      {!loading && images.length > 0 && (
        <div className="ref-gallery-grid">
          {images.map((img) => (
            <div className="card ref-gallery-card" key={img.id}>
              <div className="thumb-wrap">
                <img src={img.thumbnailUrl || img.url} alt={img.name} loading="lazy" />
              </div>
              <div className="card-body" style={{ display: "grid", gap: 6 }}>
                <p className="card-title" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {img.name}
                </p>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  {formatSize(img.size)} · {formatDate(img.uploadedAt)}
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="button" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setPreviewImage(img)}>
                    <Eye size={14} /> 查看
                  </button>
                  {onUseAsProduct && (
                    <button className="button" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => onUseAsProduct(img.url, img.name)}>
                      用作商品图
                    </button>
                  )}
                  {onUseAsBackground && (
                    <button className="button" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => onUseAsBackground(img.url, img.name)}>
                      用作背景
                    </button>
                  )}
                  <button
                    className="button"
                    style={{ fontSize: 12, padding: "4px 8px", color: "#b91c1c", borderColor: "#fecaca" }}
                    disabled={deletingId === img.id}
                    onClick={() => handleDelete(img)}
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* preview modal */}
      {previewImage && (
        <div className="ref-preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="ref-preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ref-preview-close" onClick={() => setPreviewImage(null)}>
              <X size={20} />
            </button>
            <img src={previewImage.url} alt={previewImage.name} className="ref-preview-img" />
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{previewImage.name}</p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {formatSize(previewImage.size)} · 上传于 {formatDate(previewImage.uploadedAt)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
