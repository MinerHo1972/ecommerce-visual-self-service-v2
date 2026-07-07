"use client";

import { Check, Download, ImagePlus, MoreHorizontal, Pencil, Search, Sparkles, Trash2, Type, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TemplateTextLayer = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  align: "left" | "center" | "right";
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  backgroundColor?: string;
  backgroundRadius?: number;
};

type TemplateExtractionDraft = {
  originalText: string;
  eraseMode: "mask" | "inpaint_needed";
  confidence: "low" | "medium" | "high";
  notes: string;
};

type LibraryAsset = {
  id: number;
  jobId: string;
  templateId: number;
  title: string;
  scene: string;
  platform: string;
  ossKey: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  status: string;
  tags: string[];
  createdAt: string;
};

type TemplateItem = {
  id: number;
  name: string;
  tags: string[];
  textLayer?: TemplateTextLayer | null;
  extractionDraft?: TemplateExtractionDraft | null;
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

export function TemplateLibraryPanel({ variant = "library" }: { variant?: "library" | "workbench" }) {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [textEditTemplate, setTextEditTemplate] = useState<TemplateItem | null>(null);
  const [textLayerTemplate, setTextLayerTemplate] = useState<TemplateItem | null>(null);
  const [textLayerDraft, setTextLayerDraft] = useState<TemplateTextLayer | null>(null);
  const [textLayerSaving, setTextLayerSaving] = useState(false);
  const [extractionTemplate, setExtractionTemplate] = useState<TemplateItem | null>(null);
  const [extractionDraft, setExtractionDraft] = useState<TemplateExtractionDraft | null>(null);
  const [extractionSaving, setExtractionSaving] = useState(false);
  const [originalText, setOriginalText] = useState("618");
  const [replacementText, setReplacementText] = useState("中秋节");
  const [editInstruction, setEditInstruction] = useState("只改主标题文字，保持原设计版式、商品和背景不变");
  const [textEditing, setTextEditing] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(() => new Set());
  const [batchRecycling, setBatchRecycling] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("updated_desc");
  const [error, setError] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState<number | null>(null);
  const [imageLibraryAssets, setImageLibraryAssets] = useState<LibraryAsset[]>([]);
  const [imageLibraryLoading, setImageLibraryLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<"templates" | "library">("templates");
  const textEditAbortRef = useRef<AbortController | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/template-library");
      const data = (await res.json()) as ApiResult<{ templates: TemplateItem[] }>;
      if (data.success && data.data) {
        setTemplates(data.data.templates);
      }
    } catch {
      setError("获取模板列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchImageLibrary = useCallback(async () => {
    setImageLibraryLoading(true);
    try {
      const res = await fetch(`/api/image-library?page_size=100&_=${Date.now()}`, { cache: "no-store" });
      const data = (await res.json()) as ApiResult<{ items: LibraryAsset[] }>;
      if (data.success && data.data?.items) setImageLibraryAssets(data.data.items);
    } catch { /* ignore */ }
    finally { setImageLibraryLoading(false); }
  }, []);

  function openTextEditFromLibrary(asset: LibraryAsset) {
    setTextEditTemplate({
      id: 0,
      name: asset.title,
      tags: asset.tags,
      textLayer: null,
      extractionDraft: null,
      ossKey: asset.ossKey,
      thumbnailUrl: asset.thumbnailUrl,
      status: "active",
      createdAt: asset.createdAt,
      updatedAt: asset.createdAt,
    });
    setOriginalText("618");
    setReplacementText("中秋节");
    setEditInstruction("只改主标题文字，保持原设计版式、商品和背景不变");
    setError(null);
  }

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/template-library", { method: "POST", body: formData });
      const data = (await res.json()) as ApiResult<{ template: TemplateItem }>;
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "上传失败");
      }
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleRename(id: number, newName: string) {
    try {
      const res = await fetch("/api/template-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "重命名失败");
      setEditingId(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重命名失败");
    }
  }

  async function handleSaveToProductLibrary(template: TemplateItem) {
    setSavingToLibrary(template.id);
    setError(null);
    try {
      const res = await fetch("/api/product-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_from_url",
          sourceUrl: template.thumbnailUrl,
          name: template.name,
          tags: ["saved_from_template", `template:${template.id}`],
        }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!res.ok || !data.success) throw new Error(data.error?.message ?? "保存失败");
      setOpenActionsId(null);
      setError("已保存到产品库");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingToLibrary(null);
    }
  }


  function createDefaultTextLayer(template?: TemplateItem | null): TemplateTextLayer {
    return template?.textLayer ?? {
      text: "主标题",
      x: 80,
      y: 120,
      width: 640,
      height: 120,
      fontSize: 72,
      fontFamily: "Arial, sans-serif",
      fontWeight: "700",
      color: "#ffffff",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 0,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      backgroundColor: undefined,
      backgroundRadius: 0,
    };
  }

  function openTextLayerEditor(template: TemplateItem) {
    setTextLayerTemplate(template);
    setTextLayerDraft(createDefaultTextLayer(template));
    setError(null);
  }

  function updateTextLayerDraft(patch: Partial<TemplateTextLayer>) {
    setTextLayerDraft((prev) => ({ ...createDefaultTextLayer(textLayerTemplate), ...prev, ...patch }));
  }

  function createDefaultExtractionDraft(template?: TemplateItem | null): TemplateExtractionDraft {
    return template?.extractionDraft ?? {
      originalText: template?.textLayer?.text || "主标题",
      eraseMode: "mask",
      confidence: "low",
      notes: "先用遮罩盖住旧字；复杂纹理或商品重叠区域后续需要局部擦除/修复。",
    };
  }

  function createTextLayerFromExtractionDraft(draft: TemplateExtractionDraft): TemplateTextLayer {
    return {
      ...createDefaultTextLayer(extractionTemplate),
      text: draft.originalText.trim() || "主标题",
      backgroundColor: draft.eraseMode === "mask" ? "#ffffff" : undefined,
    };
  }

  function openExtractionWorkflow(template: TemplateItem) {
    setExtractionTemplate(template);
    setExtractionDraft(createDefaultExtractionDraft(template));
    setError(null);
  }

  function updateExtractionDraft(patch: Partial<TemplateExtractionDraft>) {
    setExtractionDraft((prev) => ({ ...createDefaultExtractionDraft(extractionTemplate), ...prev, ...patch }));
  }

  async function handleSaveExtractionDraft(createTextLayer = false) {
    if (!extractionTemplate || !extractionDraft) return;
    setExtractionSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/template-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: extractionTemplate.id,
          extractionDraft,
          createTextLayerFromExtraction: createTextLayer,
        }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!res.ok || !data.success) throw new Error(data.error?.message ?? "保存提取草案失败");
      const currentTemplate = extractionTemplate;
      const currentDraft = extractionDraft;
      setExtractionTemplate(null);
      setExtractionDraft(null);
      await fetchTemplates();
      if (createTextLayer) {
        setTextLayerTemplate(currentTemplate);
        setTextLayerDraft(createTextLayerFromExtractionDraft(currentDraft));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存提取草案失败");
    } finally {
      setExtractionSaving(false);
    }
  }

  async function handleSaveTextLayer(clear = false) {
    if (!textLayerTemplate) return;
    setTextLayerSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/template-library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { id: textLayerTemplate.id, clearTextLayer: true } : { id: textLayerTemplate.id, textLayer: textLayerDraft }),
      });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!res.ok || !data.success) throw new Error(data.error?.message ?? "保存文字层失败");
      setTextLayerTemplate(null);
      setTextLayerDraft(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存文字层失败");
    } finally {
      setTextLayerSaving(false);
    }
  }

  function openTextEdit(template: TemplateItem) {
    setTextEditTemplate(template);
    setOriginalText("618");
    setReplacementText("中秋节");
    setEditInstruction("只改主标题文字，保持原设计版式、商品和背景不变");
    setError(null);
  }

  async function handleTextEditSubmit() {
    if (!textEditTemplate || !originalText.trim() || !replacementText.trim()) return;
    setTextEditing(true);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    textEditAbortRef.current = controller;
    try {
      const body: Record<string, unknown> = {
        action: "text_edit",
        originalText,
        replacementText,
        editInstruction,
      };
      if (textEditTemplate.id > 0) {
        body.templateId = textEditTemplate.id;
      } else {
        body.sourceOssKey = textEditTemplate.ossKey;
        body.sourceUrl = textEditTemplate.thumbnailUrl;
        body.sourceName = textEditTemplate.name;
      }
      const res = await fetch("/api/template-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await res.json()) as ApiResult<{ template: TemplateItem }>;
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? "生成改字模板失败");
      }
      setTextEditTemplate(null);
      await fetchTemplates();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("生成超时（120秒），任务可能仍在后台处理。");
      } else {
        setError(err instanceof Error ? err.message : "生成改字模板失败");
      }
    } finally {
      clearTimeout(timeout);
      textEditAbortRef.current = null;
      setTextEditing(false);
    }
  }

  function handleCancelTextEdit() {
    textEditAbortRef.current?.abort();
    setTextEditing(false);
  }

  useEffect(() => () => textEditAbortRef.current?.abort(), []);

  async function handleDelete(id: number) {
    if (!confirm("确定移入回收站这个模板吗？")) return;
    try {
      const res = await fetch(`/api/template-library?id=${id}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult<unknown>;
      if (!data.success) throw new Error(data.error?.message ?? "移入回收站失败");
      setBatchSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移入回收站失败");
    }
  }

  const templateSizeLabel = useCallback((entry: TemplateItem) => {
    const text = `${entry.name} ${entry.tags.join(" ")}`;
    return text.match(/\d{3,4}\s*[x×]\s*\d{3,4}/i)?.[0].replace(/\s+/g, "") ?? "未标注尺寸";
  }, []);

  const tagOptions = useMemo(() => {
    const labels = new Set<string>();
    templates.forEach((entry) => entry.tags.forEach((tag) => labels.add(tag)));
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [templates]);

  const sizeOptions = useMemo(() => {
    const labels = new Set<string>();
    templates.forEach((entry) => labels.add(templateSizeLabel(entry)));
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [templateSizeLabel, templates]);

  const filteredTemplates = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return templates
      .filter((entry) => {
        const haystack = `${entry.name} ${entry.tags.join(" ")}`.toLowerCase();
        if (normalizedKeyword && !haystack.includes(normalizedKeyword)) return false;
        if (tagFilter !== "all" && !entry.tags.includes(tagFilter)) return false;
        if (sizeFilter !== "all" && templateSizeLabel(entry) !== sizeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "created_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortOrder === "created_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortOrder === "name_asc") return a.name.localeCompare(b.name, "zh-Hans-CN");
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [keyword, sizeFilter, sortOrder, tagFilter, templateSizeLabel, templates]);

  const visibleIds = useMemo(() => filteredTemplates.map((entry) => entry.id), [filteredTemplates]);
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
    if (!confirm(`确定把选中的 ${ids.length} 个模板移入回收站吗？`)) return;
    setBatchRecycling(true);
    setError(null);
    try {
      await Promise.all(ids.map(async (id) => {
        const res = await fetch(`/api/template-library?id=${id}`, { method: "DELETE" });
        const data = (await res.json()) as ApiResult<unknown>;
        if (!data.success) throw new Error(data.error?.message ?? "移入回收站失败");
      }));
      setBatchSelectedIds(new Set());
      await fetchTemplates();
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
          <p className="eyebrow">{variant === "workbench" ? "当前工作流" : "模板库"}</p>
          <h2>{variant === "workbench" ? "文案替换" : "管理模板图"}</h2>
          <p className="muted">{variant === "workbench" ? "选模板库或图库任意图片，填写原文、新文案和约束说明，直接生成新图。" : "上传模板图，在模板换产品页可直接从模板库选用，不用每次手动上传。"}</p>
        </div>
        {variant === "workbench" && (
          <div className="source-tabs">
            <button className={`source-tab ${activeSource === "templates" ? "active" : ""}`} onClick={() => setActiveSource("templates")}>
              模板库 ({templates.length})
            </button>
            <button className={`source-tab ${activeSource === "library" ? "active" : ""}`} onClick={() => { setActiveSource("library"); if (imageLibraryAssets.length === 0) fetchImageLibrary(); }}>
              图库 ({imageLibraryAssets.length || "…"})
            </button>
          </div>
        )}
        <label className="button primary file-button">
          <UploadCloud size={16} />
          {uploading ? "上传中" : "上传模板"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
        </label>
      </div>

      {error && <div className="alert error"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}

      {(!loading && templates.length > 0) && (variant !== "workbench" || activeSource === "templates") && (
        <div className="library-filter-bar template-filter-bar">
          <div className="field search-field">
            <label>搜索模板</label>
            <div className="input-wrap">
              <Search size={16} />
              <input className="input" value={keyword} placeholder="活动 / 平台 / 用途 / 标签" onChange={(event) => setKeyword(event.target.value)} />
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
            <label>尺寸</label>
            <select className="select" value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
              <option value="all">全部尺寸</option>
              {sizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
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
          <span className="count-pill">{filteredTemplates.length}/{templates.length} 个</span>
        </div>
      )}

      {variant !== "workbench" && !loading && templates.length > 0 && (
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

      {variant === "workbench" && activeSource === "library" && (
        imageLibraryLoading ? (
          <div className="empty-state"><p>加载中...</p></div>
        ) : imageLibraryAssets.length === 0 ? (
          <div className="empty-state">
            <ImagePlus size={32} />
            <p>图库为空，先去生成或上传图片。</p>
          </div>
        ) : (
          <div className="template-library-grid">
            {imageLibraryAssets.map((asset) => (
              <article key={`${asset.jobId}-${asset.id}`} className="template-library-card">
                <div className="thumb-wrap">
                  <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" decoding="async" />
                </div>
                <div className="template-library-card-body">
                  <h3>{asset.title}</h3>
                  <p className="muted">{asset.tags.join(" · ") || "无标签"}</p>
                  <div className="template-library-card-actions">
                    <button className="button primary" onClick={() => openTextEditFromLibrary(asset)}>
                      <Sparkles size={14} />选择并改文字
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      )}

      {(variant !== "workbench" || activeSource === "templates") && (loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <ImagePlus size={32} />
          <p>还没有模板，点击上方按钮上传第一张模板图。</p>
        </div>
      ) : (
        <div className="template-library-grid">
          {filteredTemplates.map((t) => (
            <article key={t.id} className={`template-library-card ${batchSelectedIds.has(t.id) ? "batch-selected" : ""}`}>
              <div className="thumb-wrap">
                {variant !== "workbench" && (
                  <label className="batch-select-badge" title="选择用于批量清理">
                    <input
                      type="checkbox"
                      checked={batchSelectedIds.has(t.id)}
                      onChange={() => handleToggleBatchSelection(t.id)}
                    />
                  </label>
                )}
                <img src={t.thumbnailUrl} alt={t.name} loading="lazy" decoding="async" />
              </div>
              <div className="template-library-card-body">
                {editingId === t.id ? (
                  <div className="rename-row">
                    <input
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(t.id, editName);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button className="button" onClick={() => handleRename(t.id, editName)}>保存</button>
                  </div>
                ) : (
                  <h3>{t.name}</h3>
                )}
                <p className="muted">{new Date(t.createdAt).toLocaleDateString("zh-CN")}</p>
                <div className="template-library-card-actions">
                  {variant === "workbench" ? (
                    <button className="button primary" onClick={() => openTextEdit(t)}>
                      <Sparkles size={14} />选择并改文字
                    </button>
                  ) : (
                    <>
                      <button className="button" onClick={() => openTextLayerEditor(t)}>
                        <Type size={14} /> 文字层{t.textLayer ? "✓" : ""}
                      </button>
                      {!t.textLayer && (
                        <button className="button" onClick={() => openExtractionWorkflow(t)}>
                          <Sparkles size={14} /> 提取文字{t.extractionDraft ? "✓" : ""}
                        </button>
                      )}
                    </>
                  )}
                  {variant !== "workbench" && (
                  <details
                    className="more-actions"
                    open={openActionsId === t.id}
                    onToggle={(event) => setOpenActionsId(event.currentTarget.open ? t.id : null)}
                  >
                    <summary className="button icon-button" title="更多操作" aria-label="更多操作">
                      <MoreHorizontal size={16} />更多
                    </summary>
                    <div className="more-actions-menu">
                      <button className="button" onClick={() => { setOpenActionsId(null); openTextEdit(t); }}>
                        <Sparkles size={16} />改文字
                      </button>
                      <button className="button" onClick={() => { setOpenActionsId(null); setEditingId(t.id); setEditName(t.name); }}>
                        <Pencil size={16} />改名
                      </button>
                      <button className="button" disabled={savingToLibrary === t.id} onClick={() => handleSaveToProductLibrary(t)}>
                        <Check size={16} />{savingToLibrary === t.id ? "保存中" : "存产品库"}
                      </button>
                      <a className="button" href={t.thumbnailUrl} download target="_blank" rel="noreferrer" onClick={() => setOpenActionsId(null)}>
                        <Download size={16} />下载
                      </a>
                      <button className="button danger" onClick={() => { setOpenActionsId(null); handleDelete(t.id); }}>
                        <Trash2 size={16} />移入回收站
                      </button>
                    </div>
                  </details>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ))}
      {(!loading && templates.length > 0 && (variant !== "workbench" || activeSource === "templates")) && filteredTemplates.length === 0 && (
        <div className="empty-state">
          <Search size={28} />
          <p>没有匹配的模板图，试试换个关键词、标签或尺寸。</p>
        </div>
      )}


      {extractionTemplate && extractionDraft && (
        <div className="template-picker-overlay" onClick={() => !extractionSaving && setExtractionTemplate(null)}>
          <div className="template-picker-modal text-layer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="text-edit-modal-head">
              <div>
                <p className="eyebrow">提取文字层</p>
                <h3>先确认文字与擦除方式</h3>
                <p className="muted">手动确认最稳。生成草案后会直接进入文字层微调。</p>
              </div>
              <button className="icon-button" disabled={extractionSaving} onClick={() => setExtractionTemplate(null)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="text-edit-layout">
              <div className="text-edit-preview text-layer-preview">
                <img src={extractionTemplate.thumbnailUrl} alt={extractionTemplate.name} />
                <div className="text-layer-box extraction-suggest-box" />
                <span>{extractionTemplate.name}</span>
              </div>
              <div className="text-edit-form text-layer-form">
                <label className="field">
                  <span>识别到的主文字</span>
                  <input className="input" value={extractionDraft.originalText} onChange={(event) => updateExtractionDraft({ originalText: event.target.value })} placeholder="例如：618 年中大促" />
                </label>
                <div className="form-grid two-cols">
                  <label className="field">
                    <span>旧字擦除方式</span>
                    <select className="select" value={extractionDraft.eraseMode} onChange={(event) => updateExtractionDraft({ eraseMode: event.target.value as TemplateExtractionDraft["eraseMode"] })}>
                      <option value="mask">遮罩盖字</option>
                      <option value="inpaint_needed">需要局部修复</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>识别置信度</span>
                    <select className="select" value={extractionDraft.confidence} onChange={(event) => updateExtractionDraft({ confidence: event.target.value as TemplateExtractionDraft["confidence"] })}>
                      <option value="low">低，需人工调</option>
                      <option value="medium">中，可作为草案</option>
                      <option value="high">高，基本可用</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>擦除/图层备注</span>
                  <textarea className="textarea" value={extractionDraft.notes} onChange={(event) => updateExtractionDraft({ notes: event.target.value })} />
                </label>
                <div className="extraction-workflow-note">
                  <strong>工作流：</strong>确认原文字 → 生成文字层草案 → 自动进入微调 → 保存后改字走固定文字层。复杂背景先保留“需要局部修复”标记。
                </div>
                <div className="text-edit-actions">
                  <button className="button" disabled={extractionSaving} onClick={() => setExtractionTemplate(null)}>取消</button>
                  <button className="button" disabled={extractionSaving} onClick={() => handleSaveExtractionDraft(false)}>{extractionSaving ? "保存中" : "只保存草案"}</button>
                  <button className="button primary" disabled={extractionSaving || !extractionDraft.originalText.trim()} onClick={() => handleSaveExtractionDraft(true)}>
                    {extractionSaving ? "生成中" : "生成文字层草案"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {textLayerTemplate && textLayerDraft && (
        <div className="template-picker-overlay" onClick={() => !textLayerSaving && setTextLayerTemplate(null)}>
          <div className="template-picker-modal text-layer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="text-edit-modal-head">
              <div>
                <p className="eyebrow">文字层配置</p>
                <h3>固定字体参数</h3>
                <p className="muted">配置后“改文字”会走确定性叠字，不再依赖 AI 猜字体。</p>
              </div>
              <button className="icon-button" disabled={textLayerSaving} onClick={() => setTextLayerTemplate(null)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="text-edit-layout">
              <div className="text-edit-preview text-layer-preview">
                <img src={textLayerTemplate.thumbnailUrl} alt={textLayerTemplate.name} />
                <div
                  className="text-layer-box"
                  style={{
                    left: `${(textLayerDraft.x / 800) * 100}%`,
                    top: `${(textLayerDraft.y / 800) * 100}%`,
                    width: `${(textLayerDraft.width / 800) * 100}%`,
                    height: `${(textLayerDraft.height / 800) * 100}%`,
                  }}
                />
                <span>{textLayerTemplate.name}</span>
              </div>
              <div className="text-edit-form text-layer-form">
                <label className="field"><span>示例文字</span><input className="input" value={textLayerDraft.text} onChange={(event) => updateTextLayerDraft({ text: event.target.value })} /></label>
                <div className="form-grid two-cols">
                  <label className="field"><span>X</span><input className="input" type="number" value={textLayerDraft.x} onChange={(event) => updateTextLayerDraft({ x: Number(event.target.value) })} /></label>
                  <label className="field"><span>Y</span><input className="input" type="number" value={textLayerDraft.y} onChange={(event) => updateTextLayerDraft({ y: Number(event.target.value) })} /></label>
                  <label className="field"><span>宽</span><input className="input" type="number" value={textLayerDraft.width} onChange={(event) => updateTextLayerDraft({ width: Number(event.target.value) })} /></label>
                  <label className="field"><span>高</span><input className="input" type="number" value={textLayerDraft.height} onChange={(event) => updateTextLayerDraft({ height: Number(event.target.value) })} /></label>
                </div>
                <div className="form-grid two-cols">
                  <label className="field"><span>字号</span><input className="input" type="number" value={textLayerDraft.fontSize} onChange={(event) => updateTextLayerDraft({ fontSize: Number(event.target.value) })} /></label>
                  <label className="field"><span>字重</span><input className="input" value={textLayerDraft.fontWeight} onChange={(event) => updateTextLayerDraft({ fontWeight: event.target.value })} /></label>
                </div>
                <label className="field"><span>字体族</span><input className="input" value={textLayerDraft.fontFamily} onChange={(event) => updateTextLayerDraft({ fontFamily: event.target.value })} placeholder="Arial, sans-serif" /></label>
                <div className="form-grid two-cols">
                  <label className="field"><span>文字色</span><input className="input" type="color" value={textLayerDraft.color} onChange={(event) => updateTextLayerDraft({ color: event.target.value })} /></label>
                  <label className="field"><span>对齐</span><select className="select" value={textLayerDraft.align} onChange={(event) => updateTextLayerDraft({ align: event.target.value as TemplateTextLayer["align"] })}><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label>
                  <label className="field"><span>描边色</span><input className="input" type="color" value={textLayerDraft.strokeColor ?? "#000000"} onChange={(event) => updateTextLayerDraft({ strokeColor: event.target.value })} /></label>
                  <label className="field"><span>描边宽</span><input className="input" type="number" value={textLayerDraft.strokeWidth ?? 0} onChange={(event) => updateTextLayerDraft({ strokeWidth: Number(event.target.value) })} /></label>
                  <label className="field"><span>遮罩底色</span><input className="input" type="color" value={textLayerDraft.backgroundColor ?? "#ffffff"} onChange={(event) => updateTextLayerDraft({ backgroundColor: event.target.value })} /></label>
                  <label className="field"><span>遮罩圆角</span><input className="input" type="number" value={textLayerDraft.backgroundRadius ?? 0} onChange={(event) => updateTextLayerDraft({ backgroundRadius: Number(event.target.value) })} /></label>
                </div>
                <p className="muted">遮罩底色用于盖住旧字；复杂纹理背景建议使用干净底图。</p>
                <div className="text-edit-actions">
                  {textLayerTemplate.textLayer && <button className="button" disabled={textLayerSaving} onClick={() => handleSaveTextLayer(true)}>清除文字层</button>}
                  <button className="button" disabled={textLayerSaving} onClick={() => setTextLayerTemplate(null)}>取消</button>
                  <button className="button primary" disabled={textLayerSaving} onClick={() => handleSaveTextLayer(false)}>{textLayerSaving ? "保存中" : "保存文字层"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {textEditTemplate && (
        <div className="template-picker-overlay" onClick={() => { handleCancelTextEdit(); setTextEditTemplate(null); }}>
          <div className="template-picker-modal text-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="text-edit-modal-head">
              <div>
                <p className="eyebrow">文字修改</p>
                <h3>生成可复用的新模板</h3>
                <p className="muted">{textEditTemplate.textLayer ? "使用固定文字层参数生成，字体、描边和阴影保持一致。" : "未配置文字层时会走 AI 改字，字体只能尽量贴近。"}</p>
              </div>
              <button className="icon-button" onClick={() => { handleCancelTextEdit(); setTextEditTemplate(null); }} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="text-edit-layout">
              <div className="text-edit-preview">
                <img src={textEditTemplate.thumbnailUrl} alt={textEditTemplate.name} />
                <span>{textEditTemplate.name}</span>
              </div>
              <div className="text-edit-form">
                <label className="field">
                  <span>原文字</span>
                  <input className="input" value={originalText} onChange={(event) => setOriginalText(event.target.value)} placeholder="例如：618" />
                </label>
                <label className="field">
                  <span>替换为</span>
                  <input className="input" value={replacementText} onChange={(event) => setReplacementText(event.target.value)} placeholder="例如：中秋节" />
                </label>
                <label className="field">
                  <span>补充要求</span>
                  <textarea className="textarea" value={editInstruction} onChange={(event) => setEditInstruction(event.target.value)} />
                </label>
                <div className="text-edit-actions">
                  <button className="button" onClick={() => { handleCancelTextEdit(); setTextEditTemplate(null); }}>取消</button>
                  {textEditing ? (
                    <button className="button danger" onClick={handleCancelTextEdit}>取消生成</button>
                  ) : (
                    <button className="button primary" disabled={!originalText.trim() || !replacementText.trim()} onClick={handleTextEditSubmit}>
                      <Sparkles size={16} />生成新模板
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
