"use client";

import {
  Database,
  FileCode2,
  Globe,
  Layers,
  MousePointerClick,
  Paintbrush,
  ShoppingCart,
  Type,
} from "lucide-react";

/* ---------- 数据 ---------- */

const coreTypes = [
  { name: "LayerTemplate", desc: "图层模板定义：画布尺寸、导出尺寸、图层列表、安全边距", fields: "id, name, category, canvasWidth, canvasHeight, templateJson, tags, status, version" },
  { name: "GeneratedImage", desc: "AI 生成的成品图记录", fields: "id, jobId, workflowType, workflowRunId, workflowStep, parentImageId, parentAssetType, humanDecision, operationTrace, inputsSnapshot" },
  { name: "WorkflowLineageViewModel", desc: "运行路径抽屉统一数据结构", fields: "currentImageId, job, run, sections, summary" },
  { name: "GenerationJob", desc: "一次抽卡生成任务", fields: "id, status, templateId, candidateCount, createdAt" },
  { name: "RenderInputs", desc: "前端填入的渲染参数（标题/副标题/价格/商品图等）", fields: "title, subtitle, price, badge, productImageDataUrl, backgroundImageDataUrl, productFocusArea, focusAreas" },
  { name: "TemplateLayer", desc: "单图层定义（背景/商品/文字/角标/Logo/形状）", fields: "id, type, zIndex, area, textKey, style, fill, …" },
  { name: "PromptTemplate", desc: "Prompt 模板骨架与变量", fields: "id, name, scene, platform, promptSkeleton, variables, tags, status" },
];

const apiEndpoints = [
  { method: "GET", path: "/api/layer-templates", desc: "模板列表" },
  { method: "GET", path: "/api/layer-templates/[id]", desc: "单个模板" },
  { method: "POST", path: "/api/layer-templates/validate", desc: "模板校验" },
  { method: "GET", path: "/api/generation-jobs", desc: "任务列表" },
  { method: "POST", path: "/api/generation-jobs", desc: "创建任务" },
  { method: "GET", path: "/api/generation-jobs/[jobId]", desc: "任务详情" },
  { method: "GET", path: "/api/generated-images", desc: "生成图列表" },
  { method: "GET", path: "/api/generated-images/[imageId]", desc: "单张图" },
  { method: "GET", path: "/api/generated-images/[imageId]/lineage", desc: "运行路径统一 view model" },
  { method: "PATCH", path: "/api/generated-images/[imageId]", desc: "更新图（选中）" },
  { method: "GET", path: "/api/oss/signed-url", desc: "OSS 读取签名" },
  { method: "POST", path: "/api/oss/upload-token", desc: "OSS 上传签名" },
  { method: "GET", path: "/api/references", desc: "参考图列表" },
  { method: "POST", path: "/api/references", desc: "上传参考图签名" },
  { method: "DELETE", path: "/api/references?id=...", desc: "删除参考图" },
  { method: "GET", path: "/api/settings", desc: "运行时配置" },
  { method: "GET", path: "/api/tags", desc: "标签列表" },
];

const tables = [
  { name: "layer_templates", desc: "图层模板主表", columns: "id, name, category, canvas_width, canvas_height, template_json, tags, status, version, created_at, updated_at" },
  { name: "generation_jobs", desc: "AI 生成任务记录", columns: "id, status, template_id, template_name, inputs, export_size, candidate_count, created_at, updated_at" },
  { name: "generated_images", desc: "生成的图片记录", columns: "id, job_id, workflow_type, workflow_run_id, workflow_step, parent_image_id, parent_asset_type, human_decision, operation_trace, inputs_snapshot, created_at" },
];

/* ---------- helpers ---------- */

function methodColor(method: string) {
  if (method === "GET") return "#15803d";
  if (method === "POST") return "#1d4ed8";
  if (method === "PATCH") return "#b45309";
  if (method === "DELETE") return "#b91c1c";
  return "#334155";
}

/* ---------- component ---------- */

export function DataContractPanel() {
  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* 核心类型 */}
      <section className="panel">
        <div className="panel-head">
          <h2><Layers size={17} style={{ marginRight: 6, verticalAlign: -3 }} />核心类型定义</h2>
          <span className="count-pill">{coreTypes.length} 个</span>
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
          项目中 lib/types.ts 定义的 TypeScript 核心数据模型。
        </p>
        <div className="grid cols-2" style={{ gap: 12 }}>
          {coreTypes.map((t) => (
            <div className="card" key={t.name}>
              <div className="card-body">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <FileCode2 size={16} style={{ color: "var(--primary)" }} />
                  <p className="card-title" style={{ margin: 0, fontSize: 14 }}>{t.name}</p>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>{t.desc}</p>
                <code style={{ display: "block", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 11, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  {t.fields}
                </code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* API 端点 */}
      <section className="panel">
        <div className="panel-head">
          <h2><Globe size={17} style={{ marginRight: 6, verticalAlign: -3 }} />API 端点</h2>
          <span className="count-pill">{apiEndpoints.length} 个</span>
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
          Next.js Route Handler 提供的 REST 端点。
        </p>
        <div style={{ display: "grid", gap: 6 }}>
          {apiEndpoints.map((ep, i) => (
            <div key={`${ep.method}-${ep.path}-${i}`} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", background: "#f8fafc",
              border: "1px solid #e2e8f0", borderRadius: 6,
            }}>
              <span style={{
                fontWeight: 700, fontSize: 11, minWidth: 48, textAlign: "center",
                padding: "2px 8px", borderRadius: 4,
                background: `${methodColor(ep.method)}14`, color: methodColor(ep.method),
                border: `1px solid ${methodColor(ep.method)}33`,
              }}>
                {ep.method}
              </span>
              <code style={{ fontSize: 13, color: "#334155", minWidth: 280 }}>{ep.path}</code>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{ep.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* RDS 表结构 */}
      <section className="panel">
        <div className="panel-head">
          <h2><Database size={17} style={{ marginRight: 6, verticalAlign: -3 }} />RDS 表结构</h2>
          <span className="count-pill">{tables.length} 张表</span>
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
          阿里云 RDS MySQL 数据库中的核心表（对应 repository 实现中的字段映射）。
        </p>
        <div className="grid" style={{ gap: 12 }}>
          {tables.map((t) => (
            <div className="card" key={t.name}>
              <div className="card-body">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Database size={15} style={{ color: "var(--accent)" }} />
                  <p className="card-title" style={{ margin: 0 }}>{t.name}</p>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>{t.desc}</p>
                <code style={{ display: "block", background: "#0f172a", color: "#e2e8f0", borderRadius: 6, padding: "10px 12px", fontSize: 11, lineHeight: 1.6, overflowWrap: "anywhere" }}>
                  {t.columns}
                </code>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
