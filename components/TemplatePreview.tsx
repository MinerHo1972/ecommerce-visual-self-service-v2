"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { renderLayerTemplate } from "@/lib/canvas-renderer";
import type { ExportSize, LayerTemplateJson, QualityCheck, RenderInputs } from "@/lib/types";

type TemplatePreviewProps = {
  template: LayerTemplateJson;
  inputs: RenderInputs;
  exportSize?: ExportSize;
  showSafeMargin?: boolean;
};

export function TemplatePreview({ template, inputs, exportSize, showSafeMargin = true }: TemplatePreviewProps) {
  const [dataUrl, setDataUrl] = useState("");
  const [checks, setChecks] = useState<QualityCheck[]>([]);

  useEffect(() => {
    let cancelled = false;
    renderLayerTemplate(template, inputs, { exportSize, showSafeMargin })
      .then((result) => {
        if (cancelled) return;
        setDataUrl(result.dataUrl);
        setChecks(result.checks);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setChecks([{ type: "size_compliance", passed: false, message: error.message }]);
      });
    return () => {
      cancelled = true;
    };
  }, [template, inputs, exportSize, showSafeMargin]);

  return (
    <div className="grid">
      <div className="preview-board">{dataUrl ? <img alt="模板渲染预览" src={dataUrl} /> : <span className="muted">正在渲染</span>}</div>
      <ul className="status-list">
        {checks.map((check, index) => (
          <li key={`${check.type}-${check.layerId || index}`} className={check.passed ? "ok" : "danger"}>
            {check.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>{check.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
