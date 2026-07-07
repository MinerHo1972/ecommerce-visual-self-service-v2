// Verify image_quality_reviews table readiness and optional sample write.
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;

      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadLocalEnv();

const args = process.argv.slice(2);
const shouldWriteSample = args.includes("--write-sample");
const shouldWritePendingSample = args.includes("--write-pending-sample");
const shouldRunSidecarSample = args.includes("--run-sidecar-sample");
const imageIdArg = args.find((arg) => arg.startsWith("--image-id="));
const imageId = Number(imageIdArg ? imageIdArg.split("=")[1] : 0);

async function tableExists(pool) {
  const [rows] = await pool.query("SHOW TABLES LIKE 'image_quality_reviews'");
  return Array.isArray(rows) && rows.length > 0;
}

async function listIndexes(pool) {
  const [rows] = await pool.query("SHOW INDEX FROM image_quality_reviews");
  return rows.map((row) => row.Key_name).filter(Boolean);
}

async function writeSample(pool) {
  if (!imageId || Number.isNaN(imageId)) {
    throw new Error("--image-id=<id> is required when using --write-sample");
  }

  const workflowRunId = `manual_verify_${Date.now()}`;
  const now = new Date();
  const [result] = await pool.execute(
    `INSERT INTO image_quality_reviews (image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, quality_status, confidence, vlm_scores, reject_reasons, suggested_action, candidate_image_url, inputs_snapshot, started_at, finished_at, created_at)
     VALUES (?, ?, 'manual_verify', 'quality_review_verify', 'mock', 'succeeded', 'review', 0.7777, ?, ?, 'manual_review', '', ?, ?, ?, ?)`,
    [
      imageId,
      workflowRunId,
      JSON.stringify({ productFidelity: 0.77, brandCompliance: 0.77, templateFidelity: 0.77, visualQuality: 0.77, productCount: 1 }),
      JSON.stringify(["low_confidence"]),
      JSON.stringify({ verification: "manual_sample", writeSample: true }),
      now,
      now,
      now,
    ]
  );

  const [rows] = await pool.query(
    `SELECT id, image_id, workflow_run_id, review_status, quality_status, confidence, suggested_action
     FROM image_quality_reviews WHERE id = ? LIMIT 1`,
    [result.insertId]
  );

  return rows[0] ?? null;
}

async function writePendingSample(pool) {
  if (!imageId || Number.isNaN(imageId)) {
    throw new Error("--image-id=<id> is required when using --write-pending-sample");
  }

  const workflowRunId = `manual_pending_${Date.now()}`;
  const now = new Date();
  const [result] = await pool.execute(
    `INSERT INTO image_quality_reviews (image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, candidate_image_url, inputs_snapshot, created_at)
     VALUES (?, ?, 'manual_verify', 'quality_review_pending_verify', 'mock', 'pending', '', ?, ?)`,
    [imageId, workflowRunId, JSON.stringify({ verification: "manual_pending_sample", writePendingSample: true }), now]
  );

  const [rows] = await pool.query(
    `SELECT id, image_id, workflow_run_id, review_status, quality_status, confidence, suggested_action
     FROM image_quality_reviews WHERE id = ? LIMIT 1`,
    [result.insertId]
  );

  return rows[0] ?? null;
}

function buildMockScores(input) {
  const hasPrompt = Boolean(input.promptTrace && input.promptTrace.prompt);
  const hasReferences = input.referenceImages.length > 0;
  const isTextEdit = input.workflowType === "template_text_edit";
  const isPartialRepaint = input.workflowType === "partial_repaint";
  return {
    productFidelity: hasReferences ? 0.9 : 0.72,
    brandCompliance: hasPrompt ? 0.86 : 0.68,
    templateFidelity: isPartialRepaint ? 0.82 : 0.88,
    visualQuality: input.candidateImageUrl ? 0.9 : 0.5,
    productCount: isTextEdit ? 0.96 : 0.9,
  };
}

function averageScore(scores) {
  const values = Object.values(scores);
  const value = values.reduce((sum, score) => sum + score, 0) / values.length;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function classifyMockReview(confidence, input) {
  const rejectReasons = [];
  if (!input.promptTrace || !input.promptTrace.prompt) rejectReasons.push("missing_trace");
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

async function runSidecarSample(pool) {
  if (!imageId || Number.isNaN(imageId)) {
    throw new Error("--image-id=<id> is required when using --run-sidecar-sample");
  }

  const now = new Date();
  const workflowRunId = `manual_sidecar_${Date.now()}`;
  const input = {
    imageId,
    candidateImageUrl: "https://example.com/mock-quality-sidecar.png",
    workflowRunId,
    workflowType: "template_replace",
    workflowStep: "quality_review_sidecar_verify",
    promptTrace: {
      provider: "mock",
      operationMode: "template_replace",
      workflowType: "商品图套模板",
      constraintPreset: "更像模板原图",
      prompt: "manual sidecar verification sample",
      referenceUrls: ["https://example.com/product.png"],
      referenceImageHashes: ["url:manual-sidecar"],
      size: "800x800",
      count: 1,
      createdAt: now.toISOString(),
    },
    referenceImages: ["https://example.com/product.png"],
    referenceImageHashes: ["url:manual-sidecar"],
    constraintPreset: "更像模板原图",
    inputsSnapshot: { verification: "manual_sidecar_sample", runSidecarSample: true },
    createdAt: now,
  };

  const [insertResult] = await pool.execute(
    `INSERT INTO image_quality_reviews (image_id, workflow_run_id, workflow_type, workflow_step, review_source, review_status, prompt_trace, reference_images, reference_image_hashes, candidate_image_url, constraint_preset, inputs_snapshot, created_at)
     VALUES (?, ?, ?, ?, 'mock', 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    [
      imageId,
      workflowRunId,
      input.workflowType,
      input.workflowStep,
      JSON.stringify(input.promptTrace),
      JSON.stringify(input.referenceImages),
      JSON.stringify(input.referenceImageHashes),
      input.candidateImageUrl,
      input.constraintPreset,
      JSON.stringify(input.inputsSnapshot),
      input.createdAt,
    ]
  );

  const reviewId = insertResult.insertId;
  const [pendingRows] = await pool.query(
    `SELECT id, image_id, workflow_run_id, review_status, quality_status, confidence, suggested_action
     FROM image_quality_reviews WHERE id = ? LIMIT 1`,
    [reviewId]
  );

  const startedAt = new Date();
  await pool.execute(
    `UPDATE image_quality_reviews SET review_status = 'running', started_at = ? WHERE id = ?`,
    [startedAt, reviewId]
  );
  const [runningRows] = await pool.query(
    `SELECT id, image_id, workflow_run_id, review_status, quality_status, confidence, suggested_action
     FROM image_quality_reviews WHERE id = ? LIMIT 1`,
    [reviewId]
  );

  const vlmScores = buildMockScores(input);
  const confidence = averageScore(vlmScores);
  const classification = classifyMockReview(confidence, input);
  const finishedAt = new Date();
  await pool.execute(
    `UPDATE image_quality_reviews
     SET review_status = 'succeeded', quality_status = ?, confidence = ?, vlm_scores = ?, reject_reasons = ?, suggested_action = ?, coze_workflow_run_id = ?, raw_trace_url = NULL, error_code = NULL, error_message = NULL, finished_at = ?
     WHERE id = ?`,
    [
      classification.qualityStatus,
      confidence,
      JSON.stringify(vlmScores),
      JSON.stringify(classification.rejectReasons),
      classification.suggestedAction,
      `mock_quality_${imageId}_${Date.now()}`,
      finishedAt,
      reviewId,
    ]
  );
  const [succeededRows] = await pool.query(
    `SELECT id, image_id, workflow_run_id, review_status, quality_status, confidence, suggested_action
     FROM image_quality_reviews WHERE id = ? LIMIT 1`,
    [reviewId]
  );

  return {
    pending: pendingRows[0] ?? null,
    running: runningRows[0] ?? null,
    succeeded: succeededRows[0] ?? null,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ ok: true, databaseConfigured: false, skipped: true, message: "DATABASE_URL is not configured; quality review table check skipped" }, null, 2));
    return;
  }

  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 2 });

  try {
    const exists = await tableExists(pool);
    if (!exists) {
      console.log(JSON.stringify({ ok: true, tableExists: false, message: "image_quality_reviews table is not migrated yet" }, null, 2));
      return;
    }

    const indexes = [...new Set(await listIndexes(pool))].sort();
    const output = { ok: true, tableExists: true, indexes };

    if (shouldWriteSample) {
      output.sample = await writeSample(pool);
    }

    if (shouldWritePendingSample) {
      output.pendingSample = await writePendingSample(pool);
    }

    if (shouldRunSidecarSample) {
      output.sidecarSample = await runSidecarSample(pool);
    }

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
