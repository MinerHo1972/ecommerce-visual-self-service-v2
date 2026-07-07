import { getMysqlPool } from "../db/mysql";
import { getRuntimeConfig } from "../config";
import type { CreateGenerationJobPayload, GeneratedImage, GenerationJob, GenerationOperationTrace } from "../types";

type GenerationJobRow = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  template_id: number | null;
  candidate_count: number;
  inputs_snapshot: string | null;
  created_at: Date;
};

type GeneratedImageRow = {
  id: number;
  job_id: string;
  template_id: number | null;
  template_name: string | null;
  title: string | null;
  scene: string | null;
  platform: string | null;
  oss_key: string | null;
  thumbnail_url: string | null;
  width: number;
  height: number;
  status: "queued" | "running" | "succeeded" | "failed" | "archived";
  selected: number;
  tags: string | string[] | null;
  inputs_snapshot: string | Record<string, unknown> | null;
  operation_trace: string | GenerationOperationTrace | null;
  workflow_type: string | null;
  workflow_run_id: string | null;
  workflow_step: string | null;
  parent_image_id: number | null;
  parent_asset_type: string | null;
  human_decision: string | null;
  created_at: Date;
};

function mapJobRow(row: GenerationJobRow): GenerationJob {
  return {
    id: row.id,
    status: row.status,
    templateId: row.template_id ?? 0,
    candidateCount: row.candidate_count,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parseTags(value: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
}

function parseInputsSnapshot(value: string | Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === "object") return Array.isArray(value) ? undefined : value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function parseOperationTrace(value: string | GenerationOperationTrace | null): GenerationOperationTrace | undefined {
  if (!value) return undefined;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as GenerationOperationTrace : undefined;
  } catch {
    return undefined;
  }
}

let generationImageRelationColumnsReady = false;

async function addColumnIfMissing(sql: string, label: string): Promise<void> {
  const pool = await getMysqlPool();
  try {
    await pool.execute(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Duplicate column") && !message.includes("already exists")) {
      console.warn(`[rds-generation-jobs] ensure ${label} column skipped`, message);
    }
  }
}

async function ensureGeneratedImageRelationColumns(): Promise<void> {
  if (generationImageRelationColumnsReady) return;
  await addColumnIfMissing(`ALTER TABLE generated_images ADD COLUMN operation_trace JSON NULL AFTER inputs_snapshot`, "operation_trace");
  await addColumnIfMissing(`ALTER TABLE generated_images ADD COLUMN workflow_type VARCHAR(64) NULL AFTER operation_trace`, "workflow_type");
  await addColumnIfMissing(`ALTER TABLE generated_images ADD COLUMN workflow_run_id VARCHAR(64) NULL AFTER workflow_type`, "workflow_run_id");
  await addColumnIfMissing(`ALTER TABLE generated_images ADD COLUMN workflow_step VARCHAR(64) NULL AFTER workflow_run_id`, "workflow_step");
  await addColumnIfMissing(`ALTER TABLE generated_images ADD COLUMN parent_image_id BIGINT NULL AFTER workflow_step`, "parent_image_id");
  await addColumnIfMissing(`ALTER TABLE generated_images ADD COLUMN parent_asset_type VARCHAR(32) NULL AFTER parent_image_id`, "parent_asset_type");
  await addColumnIfMissing(`ALTER TABLE generated_images ADD COLUMN human_decision VARCHAR(32) NULL AFTER parent_asset_type`, "human_decision");
  generationImageRelationColumnsReady = true;
}


function toHttpsUrl(url: string): string {
  return url.replace(/^http:\/\//, "https://");
}

function getAliOssClient() {
  const config = getRuntimeConfig();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  return new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
    authorization: "signature",
  });
}

function freshGeneratedUrl(client: ReturnType<typeof getAliOssClient> | null, ossKey: string, storedUrl: string) {
  const normalizedStoredUrl = storedUrl ? toHttpsUrl(storedUrl) : "";
  const storedUrlUsesOssKey = Boolean(ossKey && normalizedStoredUrl.includes(ossKey));
  if (client && ossKey) {
    try {
      if (!normalizedStoredUrl || storedUrlUsesOssKey) {
        return toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
      }
    } catch {
      // fall back to stored URL
    }
  }
  return normalizedStoredUrl;
}

function mapImageRow(row: GeneratedImageRow): GeneratedImage {
  const tags = parseTags(row.tags);
  const inputsSnapshot = parseInputsSnapshot(row.inputs_snapshot);
  const operationTrace = parseOperationTrace(row.operation_trace);
  return {
    id: row.id,
    jobId: row.job_id,
    templateId: row.template_id ?? 0,
    templateName: row.template_name ?? "",
    title: row.title ?? "",
    scene: row.scene ?? "main_image",
    platform: row.platform ?? "tmall",
    ossKey: row.oss_key ?? "",
    thumbnailUrl: freshGeneratedUrl(
      getRuntimeConfig().oss.uploadTokenMode === "aliyun" ? getAliOssClient() : null,
      row.oss_key ?? "",
      row.thumbnail_url ?? ""
    ),
    width: row.width,
    height: row.height,
    status: row.status,
    selected: row.selected === 1,
    tags,
    createdAt: new Date(row.created_at).toISOString(),
    inputsSnapshot,
    operationTrace,
    workflowType: row.workflow_type,
    workflowRunId: row.workflow_run_id,
    workflowStep: row.workflow_step,
    parentImageId: row.parent_image_id,
    parentAssetType: row.parent_asset_type,
    humanDecision: row.human_decision,
  };
}

function normalizePagination(page = 1, pageSize = 20) {
  return { page: Math.max(1, page), pageSize: Math.min(Math.max(1, pageSize), 100) };
}

function buildInputsSnapshot(inputs: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === "string") {
      if (!value.startsWith("data:")) snapshot[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      snapshot[key] = value;
    } else if (typeof value === "object" && value !== null) {
      try {
        JSON.stringify(value);
        snapshot[key] = value;
      } catch {
        // Skip non-serializable values
      }
    }
  }
  return snapshot;
}

export const rdsGenerationJobRepository = {
  async createJobRecord(jobId: string, payload: CreateGenerationJobPayload, status: GenerationJob["status"] = "queued"): Promise<GenerationJob> {
    const pool = await getMysqlPool();
    const inputsSnapshot = JSON.stringify(buildInputsSnapshot(payload.inputs));
    await pool.execute(
      `INSERT INTO generation_jobs (id, status, template_id, candidate_count, inputs_snapshot)
       VALUES (:id, :status, :templateId, :candidateCount, :inputsSnapshot)`,
      {
        id: jobId,
        status,
        templateId: payload.templateId,
        candidateCount: payload.candidateCount ?? 4,
        inputsSnapshot,
      }
    );
    return {
      id: jobId,
      status,
      templateId: payload.templateId,
      candidateCount: payload.candidateCount ?? 4,
      createdAt: new Date().toISOString(),
    };
  },

  async updateJobStatus(jobId: string, status: GenerationJob["status"]): Promise<void> {
    const pool = await getMysqlPool();
    await pool.execute(
      `UPDATE generation_jobs SET status = :status WHERE id = :id`,
      { id: jobId, status }
    );
  },

  async insertImage(image: Omit<GeneratedImage, "id">): Promise<number> {
    const pool = await getMysqlPool();
    await ensureGeneratedImageRelationColumns();
    const [result] = await pool.execute<{ insertId: number }>(
      `INSERT INTO generated_images (job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot, operation_trace, workflow_type, workflow_run_id, workflow_step, parent_image_id, parent_asset_type, human_decision)
       VALUES (:jobId, :templateId, :templateName, :title, :scene, :platform, :ossKey, :thumbnailUrl, :width, :height, :status, :selected, :tags, :inputsSnapshot, :operationTrace, :workflowType, :workflowRunId, :workflowStep, :parentImageId, :parentAssetType, :humanDecision)`,
      {
        jobId: image.jobId,
        templateId: image.templateId,
        templateName: image.templateName,
        title: image.title,
        scene: image.scene,
        platform: image.platform,
        ossKey: image.ossKey,
        thumbnailUrl: image.thumbnailUrl,
        width: image.width,
        height: image.height,
        status: image.status,
        selected: image.selected ? 1 : 0,
        tags: JSON.stringify(image.tags ?? []),
        inputsSnapshot: image.inputsSnapshot ? JSON.stringify(image.inputsSnapshot) : null,
        operationTrace: image.operationTrace ? JSON.stringify(image.operationTrace) : null,
        workflowType: image.workflowType ?? null,
        workflowRunId: image.workflowRunId ?? null,
        workflowStep: image.workflowStep ?? null,
        parentImageId: image.parentImageId ?? null,
        parentAssetType: image.parentAssetType ?? null,
        humanDecision: image.humanDecision ?? null,
      }
    );
    return result.insertId;
  },

  async getJob(jobId: string): Promise<{ job: GenerationJob; images: GeneratedImage[] } | null> {
    const pool = await getMysqlPool();
    await ensureGeneratedImageRelationColumns();
    const [jobRows] = await pool.query<GenerationJobRow[]>(
      `SELECT id, status, template_id, candidate_count, inputs_snapshot, created_at
       FROM generation_jobs WHERE id = :id LIMIT 1`,
      { id: jobId }
    );
    if (jobRows.length === 0) return null;

    const [imageRows] = await pool.query<GeneratedImageRow[]>(
      `SELECT id, job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot, operation_trace, workflow_type, workflow_run_id, workflow_step, parent_image_id, parent_asset_type, human_decision, created_at
       FROM generated_images WHERE job_id = :jobId
       ORDER BY id ASC`,
      { jobId }
    );

    return {
      job: mapJobRow(jobRows[0]),
      images: imageRows.map(mapImageRow),
    };
  },

  async getGeneratedImage(imageId: number): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();
    await ensureGeneratedImageRelationColumns();
    const [rows] = await pool.query<GeneratedImageRow[]>(
      `SELECT id, job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot, operation_trace, workflow_type, workflow_run_id, workflow_step, parent_image_id, parent_asset_type, human_decision, created_at
       FROM generated_images WHERE id = :id LIMIT 1`,
      { id: imageId }
    );
    return rows[0] ? mapImageRow(rows[0]) : null;
  },

  async listGeneratedImages(params: {
    keyword?: string;
    templateId?: number;
    status?: string;
    selected?: boolean;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ items: GeneratedImage[]; page: number; page_size: number; total: number }> {
    const pool = await getMysqlPool();
    await ensureGeneratedImageRelationColumns();
    const { page, pageSize } = normalizePagination(params.page, params.pageSize);

    const where: string[] = ["status NOT IN ('archived', 'deleted')"];
    const values: Record<string, unknown> = { limit: pageSize, offset: (page - 1) * pageSize };

    if (params.keyword) {
      where.push("(title LIKE :keyword OR template_name LIKE :keyword)");
      values.keyword = `%${params.keyword}%`;
    }
    if (params.templateId) {
      where.push("template_id = :templateId");
      values.templateId = params.templateId;
    }
    if (params.status) {
      where.push("status = :status");
      values.status = params.status;
    }
    if (typeof params.selected === "boolean") {
      where.push("selected = :selected");
      values.selected = params.selected ? 1 : 0;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query<GeneratedImageRow[]>(
      `SELECT id, job_id, template_id, template_name, title, scene, platform, oss_key, thumbnail_url, width, height, status, selected, tags, inputs_snapshot, operation_trace, workflow_type, workflow_run_id, workflow_step, parent_image_id, parent_asset_type, human_decision, created_at
       FROM generated_images ${whereSql}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      values
    );

    const [countRows] = await pool.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM generated_images ${whereSql}`,
      values
    );

    return {
      items: rows.map(mapImageRow),
      page,
      page_size: pageSize,
      total: Number(countRows[0]?.total ?? 0),
    };
  },

  async updateGeneratedImageSelection(imageId: number, selected: boolean): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();

    const image = await this.getGeneratedImage(imageId);
    if (!image) return null;

    if (selected) {
      // Unselect other images in the same job
      await pool.execute(
        `UPDATE generated_images SET selected = 0 WHERE job_id = :jobId AND id != :imageId`,
        { jobId: image.jobId, imageId }
      );
    }

    await pool.execute(
      `UPDATE generated_images SET selected = :selected WHERE id = :id`,
      { id: imageId, selected: selected ? 1 : 0 }
    );

    return this.getGeneratedImage(imageId);
  },

  async updateGeneratedImageFeedback(imageId: number, feedback: string): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();
    const image = await this.getGeneratedImage(imageId);
    if (!image) return null;

    const tags = [...image.tags.filter((tag) => !tag.startsWith("feedback:")), `feedback:${feedback}`];
    await pool.execute(
      `UPDATE generated_images SET tags = :tags WHERE id = :id`,
      { id: imageId, tags: JSON.stringify(tags) }
    );

    return this.getGeneratedImage(imageId);
  },

  async updateGeneratedImageRating(imageId: number, rating: number | null): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();
    const image = await this.getGeneratedImage(imageId);
    if (!image) return null;

    const tags = image.tags.filter((tag) => !tag.startsWith("rating:"));
    if (rating) tags.push(`rating:${rating}`);
    await pool.execute(
      `UPDATE generated_images SET tags = :tags WHERE id = :id`,
      { id: imageId, tags: JSON.stringify(tags) }
    );

    return this.getGeneratedImage(imageId);
  },

  async updateGeneratedImageUsage(imageId: number, usage: "product" | "template", enabled: boolean): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();
    const image = await this.getGeneratedImage(imageId);
    if (!image) return null;

    const tag = `usage:${usage}`;
    const tags = image.tags.filter((item) => item !== tag);
    if (enabled) tags.push(tag);
    await pool.execute(
      `UPDATE generated_images SET tags = :tags WHERE id = :id`,
      { id: imageId, tags: JSON.stringify(tags) }
    );

    return this.getGeneratedImage(imageId);
  },

  async archiveGeneratedImage(imageId: number): Promise<GeneratedImage | null> {
    const pool = await getMysqlPool();
    const image = await this.getGeneratedImage(imageId);
    if (!image) return null;

    await pool.execute(
      `UPDATE generated_images SET status = 'archived', selected = 0 WHERE id = :id`,
      { id: imageId }
    );

    return this.getGeneratedImage(imageId);
  },

  async archiveGeneratedImages(imageIds: number[]): Promise<{ archivedIds: number[]; notFoundIds: number[] }> {
    const uniqueIds = Array.from(new Set(imageIds));
    if (uniqueIds.length === 0) return { archivedIds: [], notFoundIds: [] };

    const archivedIds: number[] = [];
    const pool = await getMysqlPool();

    for (const id of uniqueIds) {
      const image = await this.getGeneratedImage(id);
      if (!image) continue;
      await pool.execute(
        `UPDATE generated_images SET status = 'archived', selected = 0 WHERE id = :id`,
        { id }
      );
      const updatedImage = await this.getGeneratedImage(id);
      if (updatedImage?.status === "archived") {
        archivedIds.push(id);
      }
    }

    return {
      archivedIds,
      notFoundIds: uniqueIds.filter((id) => !archivedIds.includes(id)),
    };
  },
};
