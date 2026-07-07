import type {
  ImageQualityReviewInput,
  ImageQualityReviewResult,
  QualityRejectReason,
  QualityReviewStatus,
  QualitySuggestedAction,
  QualityStatus,
  QualityVlmScores,
  QualityWorkflowAdapter,
} from "../types";

/* ------------------------------------------------------------------ */
/* Mock adapter (unchanged)                                           */
/* ------------------------------------------------------------------ */

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function buildScores(input: ImageQualityReviewInput): QualityVlmScores {
  const hasPrompt = Boolean(input.promptTrace?.prompt);
  const hasReferences = input.referenceImages.length > 0;
  const isTextEdit = input.workflowType === "template_text_edit";
  const isPartialRepaint = input.workflowType === "partial_repaint";

  return {
    productFidelity: clampScore(hasReferences ? 0.9 : 0.72),
    brandCompliance: clampScore(hasPrompt ? 0.86 : 0.68),
    templateFidelity: clampScore(isPartialRepaint ? 0.82 : 0.88),
    visualQuality: clampScore(input.candidateImageUrl ? 0.9 : 0.5),
    productCount: clampScore(isTextEdit ? 0.96 : 0.9),
  };
}

function averageScore(scores: QualityVlmScores): number {
  const values = [
    scores.productFidelity,
    scores.brandCompliance,
    scores.templateFidelity,
    scores.visualQuality,
    scores.productCount,
  ];
  return clampScore(values.reduce((sum, score) => sum + score, 0) / values.length);
}

function classifyReview(confidence: number, input: ImageQualityReviewInput): {
  qualityStatus: QualityStatus;
  suggestedAction: QualitySuggestedAction;
  rejectReasons: QualityRejectReason[];
} {
  const rejectReasons: QualityRejectReason[] = [];
  if (!input.promptTrace?.prompt) rejectReasons.push("missing_trace");
  if (!input.candidateImageUrl) rejectReasons.push("unreadable_image");
  if (confidence < 0.8) rejectReasons.push("low_confidence");

  if (!input.candidateImageUrl || confidence < 0.65) {
    return { qualityStatus: "fail", suggestedAction: "manual_review", rejectReasons };
  }
  if (rejectReasons.length > 0 || confidence < 0.86) {
    return { qualityStatus: "review", suggestedAction: "manual_review", rejectReasons };
  }
  return { qualityStatus: "pass", suggestedAction: "accept", rejectReasons };
}

export const mockCozeQualityWorkflowAdapter: QualityWorkflowAdapter = {
  async reviewImage(input: ImageQualityReviewInput): Promise<ImageQualityReviewResult> {
    const startedAt = new Date().toISOString();
    const scores = buildScores(input);
    const confidence = averageScore(scores);
    const classification = classifyReview(confidence, input);
    const finishedAt = new Date().toISOString();

    return {
      imageId: input.imageId,
      reviewStatus: "succeeded",
      qualityStatus: classification.qualityStatus,
      confidence,
      vlmScores: scores,
      rejectReasons: classification.rejectReasons,
      suggestedAction: classification.suggestedAction,
      cozeWorkflowRunId: `mock_quality_${input.imageId}_${Date.now()}`,
      rawTraceUrl: null,
      startedAt,
      finishedAt,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Real Coze workflow adapter                                         */
/* ------------------------------------------------------------------ */
/* API: Coze Coding project `/run` endpoint                          */
/* URL:   COZE_QUALITY_WORKFLOW_URL (e.g. https://xxx.coze.site/run)  */
/* Auth:  COZE_QUALITY_SAT_TOKEN (SAT token, Bearer scheme)           */
/* Input: { product_image: { url } }                                  */
/* Output: { quality_status, confidence, suggestion, dimensions, run_id } */
/* ------------------------------------------------------------------ */

const COZE_WORKFLOW_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Response from the Coze Coding project `/run` endpoint.
 * On success, returns the workflow output object directly (no envelope).
 * On error, returns `{ detail: { error_code, error_message } }`.
 */
type CozeRunErrorDetail = {
  detail?: {
    error_code?: number;
    error_message?: string;
  };
};

/**
 * Workflow output shape — matches the deployed Coze workflow's end node.
 */
type CozeQualityRunOutput = {
  quality_status?: string;
  confidence?: number;
  suggestion?: string;
  dimensions?: {
    clarity?: number;
    background?: number;
    centering?: number;
    watermark?: number;
  };
  run_id?: string;
};

/**
 * Map the workflow's `quality_status` string to our QualityStatus type.
 * The workflow uses "pass" | "fail" | "warning".
 */
function mapQualityStatus(raw: string | undefined): QualityStatus | undefined {
  if (!raw) return undefined;
  switch (raw) {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "warning":
      return "review"; // map "warning" to our "review" bucket
    default:
      return undefined;
  }
}

/**
 * Derive suggestedAction from quality_status when the workflow doesn't provide one.
 */
function deriveSuggestedAction(status: QualityStatus | undefined): QualitySuggestedAction {
  switch (status) {
    case "pass":
      return "accept";
    case "fail":
      return "retry";
    default:
      return "manual_review";
  }
}

/**
 * Map workflow dimension scores (0-100 scale from VLM) to our
 * QualityVlmScores (0-1 scale), aligning semantically:
 *   clarity     → visualQuality
 *   background  → brandCompliance (white-bg = brand standard)
 *   centering   → productFidelity (centered product = fidelity to template)
 *   watermark   → templateFidelity (clean = no artifact)
 *   productCount is not separately scored; default to 1.0.
 */
function mapDimensions(
  dims: CozeQualityRunOutput["dimensions"],
): QualityVlmScores {
  const safe = (v: number | undefined) =>
    clampScore(v !== undefined ? v / 100 : 0);
  return {
    visualQuality: safe(dims?.clarity),
    brandCompliance: safe(dims?.background),
    productFidelity: safe(dims?.centering),
    templateFidelity: safe(dims?.watermark),
    productCount: 1,
  };
}

export const realCozeQualityWorkflowAdapter: QualityWorkflowAdapter = {
  async reviewImage(input: ImageQualityReviewInput): Promise<ImageQualityReviewResult> {
    const startedAt = new Date().toISOString();
    const satToken = process.env.COZE_QUALITY_SAT_TOKEN;
    const workflowUrl = process.env.COZE_QUALITY_WORKFLOW_URL;

    if (!satToken || !workflowUrl) {
      return {
        imageId: input.imageId,
        reviewStatus: "skipped",
        rejectReasons: [],
        errorCode: "missing_credentials",
        errorMessage: "COZE_QUALITY_SAT_TOKEN or COZE_QUALITY_WORKFLOW_URL not configured",
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    const runEndpoint = workflowUrl.endsWith("/run")
      ? workflowUrl
      : `${workflowUrl.replace(/\/$/, "")}/run`;

    const payload = {
      product_image: { url: input.candidateImageUrl },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COZE_WORKFLOW_TIMEOUT_MS);

    try {
      const res = await fetch(runEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${satToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const body = (await res.json()) as CozeQualityRunOutput & CozeRunErrorDetail;
      const finishedAt = new Date().toISOString();

      // Error response from the workflow runtime
      if (body.detail?.error_code || !res.ok) {
        return {
          imageId: input.imageId,
          reviewStatus: "failed",
          rejectReasons: [],
          cozeWorkflowRunId: null,
          errorCode: `coze_run_${body.detail?.error_code ?? res.status}`,
          errorMessage: body.detail?.error_message || `HTTP ${res.status}`,
          startedAt,
          finishedAt,
        };
      }

      // Success — map workflow output to our result type
      const qualityStatus = mapQualityStatus(body.quality_status);
      return {
        imageId: input.imageId,
        reviewStatus: "succeeded",
        qualityStatus,
        confidence: body.confidence !== undefined ? clampScore(body.confidence) : undefined,
        vlmScores: body.dimensions ? mapDimensions(body.dimensions) : undefined,
        rejectReasons: [],
        suggestedAction: deriveSuggestedAction(qualityStatus),
        cozeWorkflowRunId: body.run_id ?? null,
        rawTraceUrl: null,
        startedAt,
        finishedAt,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        imageId: input.imageId,
        reviewStatus: isTimeout ? "timeout" : "failed",
        rejectReasons: [],
        errorCode: isTimeout ? "timeout" : "fetch_error",
        errorMessage: err instanceof Error ? err.message : String(err),
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Availability + adapter selection                                   */
/* ------------------------------------------------------------------ */

export function isCozeQualityWorkflowAvailable(): boolean {
  const satToken = process.env.COZE_QUALITY_SAT_TOKEN;
  const workflowUrl = process.env.COZE_QUALITY_WORKFLOW_URL;
  return Boolean(satToken && workflowUrl);
}

export function getQualityWorkflowAdapter(): QualityWorkflowAdapter {
  return isCozeQualityWorkflowAvailable()
    ? realCozeQualityWorkflowAdapter
    : mockCozeQualityWorkflowAdapter;
}
