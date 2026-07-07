import type { AssetStatus, LayerTemplate, LayerTemplateJson } from "../types";

export type LayerTemplateRow = {
  id: number;
  name: string;
  category: string;
  canvas_width: number;
  canvas_height: number;
  template_json: string | LayerTemplateJson;
  status: AssetStatus;
  version: number;
  tags_json?: string | string[] | null;
};

function parseJson<T>(value: string | T): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export function mapLayerTemplateRow(row: LayerTemplateRow): LayerTemplate {
  const templateJson = parseJson<LayerTemplateJson>(row.template_json);
  const tags = row.tags_json ? parseJson<string[]>(row.tags_json) : [];
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    canvasWidth: row.canvas_width,
    canvasHeight: row.canvas_height,
    templateJson,
    tags,
    status: row.status,
    version: row.version
  };
}
