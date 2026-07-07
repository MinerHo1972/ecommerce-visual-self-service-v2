import { getMysqlPool } from "../db/mysql";
import type {
  GenerationOperationTrace,
  ImageQualityReview,
  ImageQualityReviewInput,
  ImageQualityReviewResult,
  QualityHumanDecision,
  QualityRejectReason,
  QualityReviewSource,
  QualityReviewStatus,
  QualityStatus,
  QualitySuggestedAction,
  QualityVlmScores,
} from "../types";

type ImageQualityReviewRow = {
  id: number;
  image_id: number;
  workflow_run_id: string | null;
  workflow_type: string | null;
  workflow_step: string | null;
  review_source: QualityReviewSource;
  review_status: QualityReviewStatus;
  quality_status: QualityStatus | null;
  confidence: string | number | null;
  vlm_scores: string | QualityVlmScores | null;
  reject_reasons: string | QualityRejectReason[] | null;
  suggested_action: QualitySuggestedAction | null;
  prompt_trace: string | GenerationOperationTrace | null;
  reference_images: string | string[] | null;
  reference_image_hashes: string | string[] | null;
  candidate_image_url: string | null;
  constraint_preset: string | null;
  inputs_snapshot: string | Record<string, unknown> | null;
  human_decision: QualityHumanDecision | null;
  human_reject_reason: string | null;
  human_reviewer: string | null;
  coze_workflow_run_id: string | null;
  raw_trace_url: string | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  updated_at: Date;
};

function parseJsonObject<T>(value: string | T | null): T | undefined {
  if (!value) return undefined;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as T : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonArray<T>(value: string | T[] | null): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapReviewRow(row: ImageQualityReviewRow): ImageQualityReview {
  return {
    id: row.id,
    imageId: row.image_id,
    candidateImageUrl: row.candidate_image_url ?? "",
    workflowRunId: row.workflow_run_id,
    workflowType: row.workflow_type,
    workflowStep: row.workflow_step,
    promptTrace: parseJsonObject<GenerationOperationTrace>(row.prompt_trace) ?? null,
    referenceImages: parseJsonArray<string>(row.reference_images),
    referenceImageHashes: parseJsonArray<string>(row.reference_image_hashes),
    constraintPreset: row.constraint_preset,
    inputsSnapshot: parseJsonObject<Record<string, unknown>>(row.inputs_snapshot),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    reviewStatus: row.review_status,
    qualityStatus: row.quality_status ?? undefined,
    confidence: row.confidence === null ? undefined : Number(row.confidence),
    vlmScores: parseJsonObject<QualityVlmScores>(row.vlm_scores),
    rejectReasons: parseJsonArray<QualityRejectReason>(row.reject_reasons),
    suggestedAction: row.suggested_action ?? undefined,
    cozeWorkflowRunId: row.coze_workflow_run_id,
    rawTraceUrl: row.raw_trace_url,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: toIsoString(row.started_at),
    finishedAt: toIsoString(row.finished_at),
    reviewSource: row.review_source,
    humanDecision: row.human_decision,
    humanRejectReason: row.human_reject_reason,
    humanReviewer: row.human_reviewer,
    retryCount: row.retry_count,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function serializeJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export const rdsImageQualityReviewRepository = {
  async createPendingReview(input: ImageQualityReviewInput, reviewSource: QualityReviewSource = "coze_workflow"): Promise<number> {
    const pool = await getMysqlPool();
    const [result] = await pool.execute<{ insertId: number }>(
      `INSERT INTO image_quality_reviews (image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, prompt_trace, reference_images, reference_image_hashes, candidate_image_url, constraint_preset, inputs_snapshot, created_at)
       VALUES (:imageId, :workflowRunId, :workflowType, :workflowStep, :reviewSource, 'pending', :promptTrace, :referenceImages, :referenceImageHashes, :candidateImageUrl, :constraintPreset, :inputsSnapshot, :createdAt)`,
      {
        imageId: input.imageId,
        workflowRunId: input.workflowRunId ?? null,
        workflowType: input.workflowType ?? null,
        workflowStep: input.workflowStep ?? null,
        reviewSource,
        promptTrace: serializeJson(input.promptTrace ?? null),
        referenceImages: serializeJson(input.referenceImages),
        referenceImageHashes: serializeJson(input.referenceImageHashes),
        candidateImageUrl: input.candidateImageUrl,
        constraintPreset: input.constraintPreset ?? null,
        inputsSnapshot: serializeJson(input.inputsSnapshot),
        createdAt: input.createdAt,
      }
    );
    return result.insertId;
  },

  async markRunning(reviewId: number, params: { cozeWorkflowRunId?: string | null; rawTraceUrl?: string | null; startedAt?: string } = {}): Promise<ImageQualityReview | null> {
    const pool = await getMysqlPool();
    await pool.execute(
      `UPDATE image_quality_reviews
       SET review_status = 'running', coze_workflow_run_id = :cozeWorkflowRunId, raw_trace_url = :rawTraceUrl, started_at = :startedAt
       WHERE id = :id`,
      {
        id: reviewId,
        cozeWorkflowRunId: params.cozeWorkflowRunId ?? null,
        rawTraceUrl: params.rawTraceUrl ?? null,
        startedAt: params.startedAt ?? new Date().toISOString(),
      }
    );
    return this.getById(reviewId);
  },

  async markSucceeded(reviewId: number, result: ImageQualityReviewResult): Promise<ImageQualityReview | null> {
    const pool = await getMysqlPool();
    await pool.execute(
      `UPDATE image_quality_reviews
       SET review_status = 'succeeded', quality_status = :qualityStatus, confidence = :confidence, vlm_scores = :vlmScores, reject_reasons = :rejectReasons, suggested_action = :suggestedAction, coze_workflow_run_id = :cozeWorkflowRunId, raw_trace_url = :rawTraceUrl, error_code = NULL, error_message = NULL, started_at = COALESCE(started_at, :startedAt), finished_at = :finishedAt
       WHERE id = :id`,
      {
        id: reviewId,
        qualityStatus: result.qualityStatus ?? null,
        confidence: result.confidence ?? null,
        vlmScores: serializeJson(result.vlmScores ?? null),
        rejectReasons: serializeJson(result.rejectReasons),
        suggestedAction: result.suggestedAction ?? null,
        cozeWorkflowRunId: result.cozeWorkflowRunId ?? null,
        rawTraceUrl: result.rawTraceUrl ?? null,
        startedAt: result.startedAt ?? new Date().toISOString(),
        finishedAt: result.finishedAt ?? new Date().toISOString(),
      }
    );
    return this.getById(reviewId);
  },

  async markFailed(reviewId: number, params: { status?: Extract<QualityReviewStatus, "failed" | "timeout" | "skipped">; errorCode?: string | null; errorMessage?: string | null; finishedAt?: string }): Promise<ImageQualityReview | null> {
    const pool = await getMysqlPool();
    await pool.execute(
      `UPDATE image_quality_reviews
       SET review_status = :status, error_code = :errorCode, error_message = :errorMessage, finished_at = :finishedAt
       WHERE id = :id`,
      {
        id: reviewId,
        status: params.status ?? "failed",
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
        finishedAt: params.finishedAt ?? new Date().toISOString(),
      }
    );
    return this.getById(reviewId);
  },

  async incrementRetryCount(reviewId: number): Promise<ImageQualityReview | null> {
    const pool = await getMysqlPool();
    await pool.execute(
      `UPDATE image_quality_reviews SET retry_count = retry_count + 1 WHERE id = :id`,
      { id: reviewId }
    );
    return this.getById(reviewId);
  },

  async getById(reviewId: number): Promise<ImageQualityReview | null> {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<ImageQualityReviewRow[]>(
      `SELECT id, image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, quality_status, confidence, vlm_scores, reject_reasons, suggested_action, prompt_trace, reference_images, reference_image_hashes, candidate_image_url, constraint_preset, inputs_snapshot, human_decision, human_reject_reason, human_reviewer, coze_workflow_run_id, raw_trace_url, error_code, error_message, retry_count, created_at, started_at, finished_at, updated_at
       FROM image_quality_reviews WHERE id = :id LIMIT 1`,
      { id: reviewId }
    );
    return rows[0] ? mapReviewRow(rows[0]) : null;
  },

  async getLatestByImage(imageId: number): Promise<ImageQualityReview | null> {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<ImageQualityReviewRow[]>(
      `SELECT id, image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, quality_status, confidence, vlm_scores, reject_reasons, suggested_action, prompt_trace, reference_images, reference_image_hashes, candidate_image_url, constraint_preset, inputs_snapshot, human_decision, human_reject_reason, human_reviewer, coze_workflow_run_id, raw_trace_url, error_code, error_message, retry_count, created_at, started_at, finished_at, updated_at
       FROM image_quality_reviews
       WHERE image_id = :imageId
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      { imageId }
    );
    return rows[0] ? mapReviewRow(rows[0]) : null;
  },

  async getLatestByImageIds(imageIds: number[]): Promise<Map<number, ImageQualityReview>> {
    if (imageIds.length === 0) return new Map();
    const pool = await getMysqlPool();
    const namedParams: Record<string, unknown> = {};
    const placeholders = imageIds.map((id, i) => {
      const key = `id${i}`;
      namedParams[key] = id;
      return `:${key}`;
    }).join(",");
    const [rows] = await pool.query<(ImageQualityReviewRow & { rn: number })[]>(
      `SELECT t.id, t.image_id, t.workflow_run_id, t.workflow_type, t.workflow_step, t.review_source, t.review_status, t.quality_status, t.confidence, t.vlm_scores, t.reject_reasons, t.suggested_action, t.prompt_trace, t.reference_images, t.reference_image_hashes, t.candidate_image_url, t.constraint_preset, t.inputs_snapshot, t.human_decision, t.human_reject_reason, t.human_reviewer, t.coze_workflow_run_id, t.raw_trace_url, t.error_code, t.error_message, t.retry_count, t.created_at, t.started_at, t.finished_at, t.updated_at FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY image_id ORDER BY created_at DESC, id DESC) AS rn
         FROM image_quality_reviews
         WHERE image_id IN (${placeholders})
       ) t WHERE t.rn = 1`,
      namedParams
    );
    const result = new Map<number, ImageQualityReview>();
    for (const row of rows) {
      const review = mapReviewRow(row);
      if (review) result.set(review.imageId, review);
    }
    return result;
  },

  async listByWorkflowRun(workflowRunId: string): Promise<ImageQualityReview[]> {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<ImageQualityReviewRow[]>(
      `SELECT id, image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, quality_status, confidence, vlm_scores, reject_reasons, suggested_action, prompt_trace, reference_images, reference_image_hashes, candidate_image_url, constraint_preset, inputs_snapshot, human_decision, human_reject_reason, human_reviewer, coze_workflow_run_id, raw_trace_url, error_code, error_message, retry_count, created_at, started_at, finished_at, updated_at
       FROM image_quality_reviews
       WHERE workflow_run_id = :workflowRunId
       ORDER BY image_id ASC, created_at DESC, id DESC`,
      { workflowRunId }
    );
    return rows.map(mapReviewRow);
  },
};
