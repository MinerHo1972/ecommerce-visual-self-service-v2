"use client";

import { CheckCircle2, Copy, MousePointerClick, RotateCcw, Save, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { CoordinatePicker } from "@/components/CoordinatePicker";
import { TemplatePreview } from "@/components/TemplatePreview";
import { validateLayerTemplateJson } from "@/lib/template-validation";
import type { LayerTemplate, LayerTemplateJson, ProductLayer, Rect, RenderInputs } from "@/lib/types";

type TemplateAdminPanelProps = {
  templates: LayerTemplate[];
};

function cloneTemplateJson(template: LayerTemplateJson): LayerTemplateJson {
  return JSON.parse(JSON.stringify(template)) as LayerTemplateJson;
}

function getProductLayers(template: LayerTemplateJson): ProductLayer[] {
  return template.layers.filter((layer): layer is ProductLayer => layer.type === "product");
}

function applyLayerArea(template: LayerTemplateJson, layerId: string, area: Rect): LayerTemplateJson {
  return {
    ...template,
    focusArea: { ...area, layerId },
    layers: template.layers.map((layer) => {
      if (layer.id !== layerId || !("area" in layer)) return layer;
      return { ...layer, area };
    })
  };
}

function rectFromPoints(points: Array<{ x: number; y: number }>): Rect | null {
  if (points.length < 2) return null;
  const [a, b] = points;
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

const previewInputs: RenderInputs = {
  title: "连咖啡爆款组合",
  subtitle: "模板编辑预览",
  price: "到手 ¥59.9",
  badge: "618 限时"
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function TemplateAdminPanel({ templates }: TemplateAdminPanelProps) {
  const [selectedId, setSelectedId] = useState(templates[0].id);
  const selectedTemplate = templates.find((template) => template.id === selectedId) ?? templates[0];
  const [draft, setDraft] = useState(() => cloneTemplateJson(selectedTemplate.templateJson));
  const productLayers = getProductLayers(draft);
  const [targetLayerId, setTargetLayerId] = useState(productLayers[0]?.id ?? "product_main");
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const checks = useMemo(() => validateLayerTemplateJson(draft), [draft]);
  const targetLayer = productLayers.find((layer) => layer.id === targetLayerId) ?? productLayers[0];
  const passed = checks.every((check) => check.passed);

  function resetToTemplate(template: LayerTemplate) {
    const nextDraft = cloneTemplateJson(template.templateJson);
    const firstProduct = getProductLayers(nextDraft)[0];
    setSelectedId(template.id);
    setDraft(nextDraft);
    setTargetLayerId(firstProduct?.id ?? "product_main");
    setPoints([]);
    setSaveState("idle");
    setSaveMessage("");
  }

  function handlePick(point: { x: number; y: number }) {
    const nextPoints = points.length >= 2 ? [point] : [...points, point];
    setPoints(nextPoints);
    const area = rectFromPoints(nextPoints);
    if (area && targetLayer) {
      setDraft(applyLayerArea(draft, targetLayer.id, area));
    }
  }

  async function handleSaveDraft() {
    setSaveState("saving");
    setSaveMessage("");
    const response = await fetch(`/api/layer-templates/${selectedTemplate.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: selectedTemplate.name,
        category: selectedTemplate.category,
        tags: selectedTemplate.tags,
        status: "draft",
        template_json: draft
      })
    });
    const result = (await response.json()) as { success: boolean; error?: { message: string }; data?: LayerTemplate };
    if (!response.ok || !result.success) {
      setSaveState("error");
      setSaveMessage(result.error?.message ?? "保存失败");
      return;
    }
    setSaveState("saved");
    setSaveMessage(`草稿已保存为 v${result.data?.version ?? "?"}`);
  }

  return (
    <div className="grid template-admin-grid">
      <section className="panel">
        <div className="panel-head">
          <h2>模板后台编辑</h2>
          <button className="button" onClick={() => resetToTemplate(selectedTemplate)}>
            <RotateCcw size={16} />
            重置
          </button>
        </div>
        <div className="template-admin-help">
          <div>
            <MousePointerClick size={18} />
            <strong>用途：校准商品图摆放区域</strong>
          </div>
          <ol>
            <li>选择要调整的模板和商品图层。</li>
            <li>在左侧画布上点两下：第一次点左上角，第二次点右下角。</li>
            <li>右侧预览确认商品槽位位置，校验通过后点「保存草稿」。</li>
          </ol>
          <p className="muted">这里不是运营改图入口；运营生成图片请回到「运营自助台」填写文案、上传商品图并抽卡。</p>
        </div>

        <div className="grid two-up">
          <div className="field">
            <label>当前模板</label>
            <select
              className="select"
              value={selectedId}
              onChange={(event) => {
                const nextTemplate = templates.find((template) => template.id === Number(event.target.value));
                if (nextTemplate) resetToTemplate(nextTemplate);
              }}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>坐标目标层</label>
            <select className="select" value={targetLayer?.id ?? ""} onChange={(event) => { setTargetLayerId(event.target.value); setPoints([]); }}>
              {productLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.id}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="metric-row">
          <span>画布 {draft.canvas.width}x{draft.canvas.height}</span>
          <span>商品槽位 {targetLayer ? `${targetLayer.area.x},${targetLayer.area.y},${targetLayer.area.width},${targetLayer.area.height}` : "未配置"}</span>
          <span>点击点 {points.length}/2</span>
        </div>

        <CoordinatePicker template={draft} targetLayerId={targetLayer?.id ?? ""} points={points} onPick={handlePick} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>实时预览</h2>
          <button className="button primary" disabled={!passed || saveState === "saving"} onClick={handleSaveDraft}>
            <Save size={16} />
            {saveState === "saving" ? "保存中" : "保存草稿"}
          </button>
        </div>
        {saveMessage && <p className={`inline-message ${saveState === "error" ? "danger" : "ok"}`}>{saveMessage}</p>}
        <TemplatePreview template={draft} inputs={previewInputs} exportSize={draft.exportSizes[0]} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>结构校验</h2>
          <button
            className="button"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(draft, null, 2))}
          >
            <Copy size={16} />
            复制 JSON
          </button>
        </div>
        <ul className="status-list compact">
          {checks.map((check, index) => (
            <li key={`${check.message}-${index}`} className={check.passed ? "ok" : "danger"}>
              {check.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <span>{check.message}</span>
            </li>
          ))}
        </ul>
        <pre className="json-preview">{JSON.stringify(draft.focusArea, null, 2)}</pre>
      </section>
    </div>
  );
}
