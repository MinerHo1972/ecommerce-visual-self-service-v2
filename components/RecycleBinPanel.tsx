"use client";

import { RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type RecycleBinItemType = "all" | "product" | "template" | "generated";

type RecycleBinPage = {
  limit: number;
  offset: number;
  nextOffset: number;
  hasMore: boolean;
};

type RecycleBinCounts = {
  products: number;
  templates: number;
  generated: number;
  total: number;
};

type RecycleBinPayload = {
  items: RecycleBinItem[];
  counts: RecycleBinCounts;
  page: RecycleBinPage;
};

type RecycleBinItem = {
  id: number;
  type: Exclude<RecycleBinItemType, "all">;
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

const typeLabels: Record<Exclude<RecycleBinItemType, "all">, string> = {
  product: "产品",
  template: "模板",
  generated: "历史成图",
};

const filterOptions: { value: RecycleBinItemType; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "product", label: "产品库" },
  { value: "template", label: "模板库" },
  { value: "generated", label: "历史成图" },
];

function matchesKeyword(item: RecycleBinItem, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return true;
  return `${item.name} ${item.ossKey} ${item.tags.join(" ")}`.toLowerCase().includes(normalized);
}

export function RecycleBinPanel() {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<RecycleBinItemType>("all");
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<RecycleBinCounts>({ products: 0, templates: 0, generated: 0, total: 0 });
  const [page, setPage] = useState<RecycleBinPage>({ limit: 24, offset: 0, nextOffset: 0, hasMore: false });
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async (offset = 0) => {
    const isFirstPage = offset === 0;
    if (isFirstPage) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await fetch(`/api/recycle-bin?limit=24&offset=${offset}&_=${Date.now()}`, { cache: "no-store" });
      const data = (await res.json()) as ApiResult<RecycleBinPayload>;
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error?.message ?? "获取回收站失败");
      }
      const payload = data.data;
      setItems((prev) => isFirstPage ? payload.items : [...prev, ...payload.items]);
      setCounts(payload.counts);
      setPage(payload.page);
      if (isFirstPage) setFailedThumbs(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取回收站失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      return matchesKeyword(item, keyword);
    });
  }, [items, keyword, type]);

  async function handleRestore(item: RecycleBinItem) {
    if (!confirm(`确定恢复“${item.name}”吗？`)) return;
    const key = `${item.type}:${item.id}`;
    setRestoringKey(key);
    setError(null);
    try {
      const res = await fetch("/api/recycle-bin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: item.type, id: item.id }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "恢复失败");
      }
      setItems((prev) => prev.filter((entry) => !(entry.type === item.type && entry.id === item.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢复失败");
    } finally {
      setRestoringKey(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">回收站</p>
          <h2>已移入回收站的素材</h2>
          <p className="muted">这里统一查看产品库、模板库、历史成图中已归档的内容；当前只支持恢复，不做永久删除。</p>
        </div>
        <button className="button" onClick={() => fetchItems()} disabled={loading}>刷新</button>
      </div>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      <div className="metric-row">
        <span>已加载 {items.length} / 总计 {counts.total}</span>
        <span>产品 {counts.products}</span>
        <span>模板 {counts.templates}</span>
        <span>历史成图 {counts.generated}</span>
      </div>

      <div className="recycle-toolbar">
        <div className="field search-field">
          <label>搜索</label>
          <div className="input-wrap">
            <Search size={16} />
            <input className="input" value={keyword} placeholder="名称 / 标签 / OSS Key" onChange={(event) => setKeyword(event.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>类型</label>
          <select className="select" value={type} onChange={(event) => setType(event.target.value as RecycleBinItemType)}>
            {filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <Trash2 size={32} />
          <p>当前没有匹配的回收站内容</p>
        </div>
      ) : (
        <div className="template-library-grid recycle-grid">
          {filteredItems.map((item) => {
            const restoreKey = `${item.type}:${item.id}`;
            const hasFailedThumb = failedThumbs.has(restoreKey);
            return (
              <article className="template-library-card" key={restoreKey}>
                <div className="thumb-wrap">
                  {item.thumbnailUrl && !hasFailedThumb ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      onError={() => setFailedThumbs((previous) => new Set(previous).add(restoreKey))}
                    />
                  ) : (
                    <div className="recycle-missing-thumb">
                      <span>{item.type === "generated" ? "历史预览已过期" : "无预览"}</span>
                    </div>
                  )}
                  <span className="selected-badge">{typeLabels[item.type]}</span>
                </div>
                <div className="template-library-card-body">
                  <h3>{item.name}</h3>
                  <p className="muted">{new Date(item.updatedAt || item.createdAt).toLocaleString("zh-CN")}</p>
                  <div className="tag-row">
                    <span className="tag">{item.status}</span>
                    {item.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                  </div>
                  <div className="template-library-card-actions">
                    <button className="button primary" disabled={restoringKey === restoreKey} onClick={() => handleRestore(item)}>
                      <RotateCcw size={14} />恢复
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && page.hasMore && (
        <div className="load-more-row">
          <button className="button" disabled={loadingMore} onClick={() => fetchItems(page.nextOffset)}>
            {loadingMore ? "加载中..." : `加载更多（${items.length}/${counts.total}）`}
          </button>
        </div>
      )}
    </div>
  );
}
