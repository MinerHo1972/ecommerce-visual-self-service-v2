import { getMysqlPool } from "../db/mysql";
import type { LayerTemplate, PromptTemplate } from "../types";
import { mapLayerTemplateRow, type LayerTemplateRow } from "./template-row-mapper";
import type { PageResult, TemplateRepository } from "./templates";

type LayerTemplateDbRow = LayerTemplateRow;
type CountRow = { total: number };

function normalizePagination(page = 1, pageSize = 20) {
  return { page: Math.max(1, page), pageSize: Math.min(Math.max(1, pageSize), 100) };
}

export const rdsTemplateRepository: TemplateRepository = {
  async listLayerTemplates(params = {}): Promise<PageResult<LayerTemplate>> {
    const pool = await getMysqlPool();
    const { page, pageSize } = normalizePagination(params.page, params.pageSize);
    const where: string[] = [];
    const values: Record<string, unknown> = { limit: pageSize, offset: (page - 1) * pageSize };

    if (params.keyword) {
      where.push("name LIKE :keyword");
      values.keyword = `%${params.keyword}%`;
    }
    if (params.category) {
      where.push("category = :category");
      values.category = params.category;
    }
    if (params.status) {
      where.push("status = :status");
      values.status = params.status;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await pool.query<LayerTemplateDbRow[]>(
      `SELECT id, name, category, canvas_width, canvas_height, template_json, status, version, JSON_ARRAY() AS tags_json
       FROM layer_templates ${whereSql}
       ORDER BY updated_at DESC
       LIMIT :limit OFFSET :offset`,
      values
    );
    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM layer_templates ${whereSql}`,
      values
    );

    return { items: rows.map(mapLayerTemplateRow), page, page_size: pageSize, total: Number(countRows[0]?.total ?? 0) };
  },

  async getLayerTemplate(id: number): Promise<LayerTemplate | null> {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<LayerTemplateDbRow[]>(
      `SELECT id, name, category, canvas_width, canvas_height, template_json, status, version, JSON_ARRAY() AS tags_json
       FROM layer_templates
       WHERE id = :id
       LIMIT 1`,
      { id }
    );
    return rows[0] ? mapLayerTemplateRow(rows[0]) : null;
  },

  async updateLayerTemplate(id, input): Promise<LayerTemplate | null> {
    const pool = await getMysqlPool();
    const current = await this.getLayerTemplate(id);
    if (!current) return null;
    const nextJson = input.templateJson ?? current.templateJson;

    await pool.execute(
      `UPDATE layer_templates
       SET name = :name,
           category = :category,
           canvas_width = :canvasWidth,
           canvas_height = :canvasHeight,
           template_json = CAST(:templateJson AS JSON),
           focus_area_json = CAST(:focusAreaJson AS JSON),
           export_sizes_json = CAST(:exportSizesJson AS JSON),
           status = :status,
           version = version + 1
       WHERE id = :id`,
      {
        id,
        name: input.name ?? current.name,
        category: input.category ?? current.category,
        canvasWidth: nextJson.canvas.width,
        canvasHeight: nextJson.canvas.height,
        templateJson: JSON.stringify(nextJson),
        focusAreaJson: JSON.stringify(nextJson.focusArea),
        exportSizesJson: JSON.stringify(nextJson.exportSizes),
        status: input.status ?? current.status
      }
    );

    return this.getLayerTemplate(id);
  },

  async listPromptTemplates(): Promise<PageResult<PromptTemplate>> {
    return { items: [], page: 1, page_size: 0, total: 0 };
  }
};
