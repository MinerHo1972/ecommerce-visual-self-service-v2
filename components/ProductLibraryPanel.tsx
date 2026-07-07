"use client";

import { Check, Download, ImagePlus, MoreHorizontal, Pencil, Search, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProductItem = {
  id: number;
  name: string;
  tags: string[];
  ossKey: string;
  thumbnailUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: { message: string };
};

export function ProductLibraryPanel() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchRecycling, setBatchRecycling] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("updated_desc");
  const [error, setError] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState<number | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/product-library");
      const data = (await res.json()) as ApiResult<{ products: ProductItem[] }>;
      if (data.success && data.data) {
        setProducts(data.data.products);
      }
    } catch {
      setError("获取产品列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function handleUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/product-library", { method: "POST", body: formData });
      const data = (await res.json()) as ApiResult<{ product: ProductItem }>;
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "上传失败");
      }
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleRename(id: number, newName: string) {
    try {
      const res = await fetch("/api/product-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "重命名失败");
      setEditingId(null);
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重命名失败");
    }
  }

  async function handleSaveToLibrary(product: ProductItem, target: "template") {
    setSavingToLibrary(product.id);
    setError(null);
    try {
      const endpoint = target === "template" ? "/api/template-library" : "/api/product-library";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_from_url",
          sourceUrl: product.thumbnailUrl,
          name: product.name,
          tags: ["saved_from_product", `product:${product.id}`],
        }),
      });
      const data = await res.json() as ApiResult<unknown>;
      if (!res.ok || !data.success) throw new Error(data.error?.message ?? "保存失败");
      setOpenActionsId(null);
      setError("已保存到模板库");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingToLibrary(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("确定移入回收站这个产品吗？")) return;
    try {
      const res = await fetch(`/api/product-library?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "移入回收站失败");
      setBatchSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移入回收站失败");
    }
  }

  const tagOptions = useMemo(() => {
    const labels = new Set<string>();
    products.forEach((entry) => entry.tags.forEach((tag) => labels.add(tag)));
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return products
      .filter((entry) => {
        const haystack = `${entry.name} ${entry.tags.join(" ")}`.toLowerCase();
        if (normalizedKeyword && !haystack.includes(normalizedKeyword)) return false;
        if (tagFilter !== "all" && !entry.tags.includes(tagFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "created_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortOrder === "created_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortOrder === "name_asc") return a.name.localeCompare(b.name, "zh-Hans-CN");
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [keyword, products, sortOrder, tagFilter]);

  const visibleIds = useMemo(() => filteredProducts.map((entry) => entry.id), [filteredProducts]);
  const selectedVisibleCount = visibleIds.filter((id) => batchSelectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  function handleToggleBatchSelection(id: number) {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAllVisible() {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleBatchDelete() {
    const ids = Array.from(batchSelectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定把选中的 ${ids.length} 个产品移入回收站吗？`)) return;
    setBatchRecycling(true);
    setError(null);
    try {
      await Promise.all(ids.map(async (id) => {
        const res = await fetch(`/api/product-library?id=${id}`, { method: "DELETE" });
        const data = (await res.json()) as ApiResult<unknown>;
        if (!data.success) throw new Error(data.error?.message ?? "移入回收站失败");
      }));
      setBatchSelectedIds(new Set());
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量移入回收站失败");
    } finally {
      setBatchRecycling(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">产品库</p>
          <h2>管理产品图</h2>
          <p className="muted">上传产品图，在"模板换产品"页可直接从产品库选用；这里和模板库、历史成图完全分开。</p>
        </div>
        <label className="button primary file-button">
          <UploadCloud size={16} />
          {uploading ? "上传中" : "上传产品"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
        </label>
      </div>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      {!loading && products.length > 0 && (
        <div className="library-filter-bar">
          <div className="field search-field">
            <label>搜索产品</label>
            <div className="input-wrap">
              <Search size={16} />
              <input className="input" value={keyword} placeholder="名称 / 标签" onChange={(event) => setKeyword(event.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>标签</label>
            <select className="select" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
              <option value="all">全部标签</option>
              {tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </div>
          <div className="field">
            <label>排序</label>
            <select className="select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="updated_desc">最近更新</option>
              <option value="created_desc">最新上传</option>
              <option value="created_asc">最早上传</option>
              <option value="name_asc">名称 A-Z</option>
            </select>
          </div>
          <span className="count-pill">{filteredProducts.length}/{products.length} 个</span>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="bulk-action-bar library-bulk-actions">
          <label className="check-row">
            <input type="checkbox" checked={allVisibleSelected} onChange={handleToggleAllVisible} />
            全选当前筛选结果
          </label>
          <span className="muted">已选 {batchSelectedIds.size} 个</span>
          <button className="button danger" disabled={batchSelectedIds.size === 0 || batchRecycling} onClick={handleBatchDelete}>
            <Trash2 size={16} />批量移入回收站
          </button>
          {batchSelectedIds.size > 0 && (
            <button className="button" disabled={batchRecycling} onClick={() => setBatchSelectedIds(new Set())}>清空选择</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <ImagePlus size={32} />
          <p>还没有产品，点击上方按钮上传第一张产品图。</p>
        </div>
      ) : (
        <div className="template-library-grid">
          {filteredProducts.map((p) => (
            <article key={p.id} className={`template-library-card ${batchSelectedIds.has(p.id) ? "batch-selected" : ""}`}>
              <div className="thumb-wrap">
                <label className="batch-select-badge" title="选择用于批量清理">
                  <input
                    type="checkbox"
                    checked={batchSelectedIds.has(p.id)}
                    onChange={() => handleToggleBatchSelection(p.id)}
                  />
                </label>
                <img src={p.thumbnailUrl} alt={p.name} loading="lazy" decoding="async" />
              </div>
              <div className="template-library-card-body">
                {editingId === p.id ? (
                  <div className="rename-row">
                    <input
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(p.id, editName);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button className="button" onClick={() => handleRename(p.id, editName)}>保存</button>
                  </div>
                ) : (
                  <h3>{p.name}</h3>
                )}
                <p className="muted">{new Date(p.createdAt).toLocaleDateString("zh-CN")}</p>
                <div className="template-library-card-actions">
                  <button
                    className="button"
                    onClick={() => { setEditingId(p.id); setEditName(p.name); }}
                    disabled={editingId === p.id}
                  >
                    <Pencil size={14} /> 改名
                  </button>
                  <details
                    className="more-actions"
                    open={openActionsId === p.id}
                    onToggle={(event) => setOpenActionsId(event.currentTarget.open ? p.id : null)}
                  >
                    <summary className="button icon-button" title="更多操作" aria-label="更多操作">
                      <MoreHorizontal size={16} />更多
                    </summary>
                    <div className="more-actions-menu">
                      <button className="button" disabled={savingToLibrary === p.id} onClick={() => handleSaveToLibrary(p, "template")}>
                        <Check size={16} />{savingToLibrary === p.id ? "保存中" : "存模板库"}
                      </button>
                      <a className="button" href={p.thumbnailUrl} download target="_blank" rel="noreferrer" onClick={() => setOpenActionsId(null)}>
                        <Download size={16} />下载
                      </a>
                      <button className="button danger" onClick={() => handleDelete(p.id)}>
                        <Trash2 size={16} />移入回收站
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && products.length > 0 && filteredProducts.length === 0 && (
        <div className="empty-state">
          <Search size={28} />
          <p>没有匹配的产品图，试试换个关键词或标签。</p>
        </div>
      )}
    </div>
  );
}
