# Development Status

## 2026-06-10

Implemented first development slice:

- Next.js + React + TypeScript project skeleton.
- Domain types for prompt templates, layer templates, export sizes, quality checks.
- Sample 618 and 双11 layer templates.
- Browser Canvas renderer with layered rendering, text AutoShrink, rerender-based export size scaling, safe-margin overlay, and text overflow checks.
- MVP pages for operations workspace and development preview.
- Mock APIs for layer templates and tags.
- Local initial schema copy.

Implemented second development slice:

- Unified API response envelope with request ids.
- Adapter boundary for template repositories.
- Mock OSS upload-token and signed-url APIs aligned with the API contract.
- Layer template JSON validation API.
- Aliyun ECS/RDS/OSS deployment notes and environment variable checklist.

Implemented third development slice:

- Template management view is now a real admin workspace.
- Added two-click coordinate picker for product slot areas.
- Coordinate picker updates both target product layer `area` and `focusArea`.
- Added live preview, validation results, and JSON copy action for template drafts.

Implemented fourth development slice:

- Added `GET/PATCH /api/layer-templates/{id}` for template draft persistence.
- Mock template repository now supports in-memory updates and version bumping.
- Template admin save button calls the PATCH API and reports save state.
- Added product image upload entry that requests OSS upload-token mock data.

Implemented fifth development slice:

- Added `TEMPLATE_REPOSITORY_MODE` to switch template persistence between mock and RDS.
- Added MySQL pool boundary and RDS template repository for list/get/update layer templates.
- Added DB row mapper from `layer_templates` to the domain `LayerTemplate` contract.
- Updated Aliyun deployment notes with RDS repository mode instructions.

Implemented sixth development slice:

- Added generated image domain type and mock history records.
- Added `GET /api/generated-images` with keyword, template, status, selected, and pagination filters.
- Added history gallery view with filters, selected badges, reuse/export actions, and empty state.
- Added `generated_images` schema draft for future RDS-backed history.

Next slice:

- Execute real OSS PUT upload after Aliyun credentials are available.
- Add generation jobs and RDS-backed generated image history.

## 2026-06-14

Product 2.0 planning documents added:

- `CONTEXT.md`: project terminology for workflow-oriented product language.
- `docs/prd/product-2-workflow-direction.md`: product 2.0 direction document.
- `docs/prd/product-2-mvp-prd.md`: executable MVP PRD for workflow console migration.
- `docs/adr/0001-web-as-workflow-console.md`: decision to keep Web as visual workflow console while introducing workflow core and Coze/Agent orchestration.
- `docs/adr/0002-minimal-workflow-relations.md`: adopted minimal workflow/run/step relation fields on `generated_images`; VLM quality scoring will use a separate future log table/event stream.
- `docs/adr/0003-stage-verified-execution.md`: adopted stage maps, failable checks, and skeptical handoff notes for complex slices before Slice 7.
- `docs/adr/0004-first-coze-workflow-node-quality-gate.md`: Slice 7 proposal choosing automatic quality review as the first Coze workflow node, with input/output and failure boundaries.
- `docs/adr/0005-image-quality-review-log.md`: Slice 7A data design for the `image_quality_reviews` log table/event shape, including fields, indexes, write timing, retry, and backfill strategy.

Next suggested slice:

- Slice 7L: Create the actual Coze low-code workflow with VLM node for image quality review.
- Requires manual work in Coze web IDE to define workflow nodes, inputs, and outputs.
- After workflow is deployed, set COZE_PAT and COZE_QUALITY_WORKFLOW_ID env vars to activate the real adapter.

Slice 7J completed:

- Upgraded the lineage drawer quality review area into a compact debug panel with status color, review id, workflowRunId, source, suggested action, confidence, and updated time.
- Added a refresh-state button for the current lineage view, so pending/running quality review states can be rechecked without closing the drawer.
- Added copy buttons for the image-level and workflowRun-level quality debug API paths.
- This remains read-only UI; it does not trigger retries, real Coze workflows, VLM calls, or candidate blocking.

Slice 7I completed:

- Extended `scripts/verify_quality_reviews.cjs` with `--run-sidecar-sample --image-id=<id>` to create a mock sidecar review and verify pending → running → succeeded transitions.
- Added `npm run verify:quality-sidecar` as a clearer entrypoint for the same controlled sidecar verification.
- Verified image `75` with sidecar sample `id=4`, ending in `review_status=succeeded`, `quality_status=pass`, `confidence=0.8880`, `suggested_action=accept`.
- This validates the quality review state machine without calling real Coze/VLM or spending generation cost.

Slice 7H completed:

- Added `GET /api/generated-images/[imageId]/quality-review` as a read-only debug endpoint for checking the latest quality review on one image.
- Added `GET /api/workflow-runs/[workflowRunId]/quality-reviews` as a read-only debug endpoint for listing quality reviews under one workflow run.
- Responses reuse the existing API envelope and expose only quality review state/summary, with no credentials or new external workflow calls.
- Real Coze/VLM workflow calls remain disabled.

Slice 7G completed:

- Changed mock quality sidecar execution from synchronous completion inside the generation flow to a detached boundary: generation now creates a pending review and schedules mock processing separately.
- RDS sidecar creation now returns the pending row immediately, then marks running/succeeded in the detached task.
- Latest quality review lookup now includes pending/running records so the lineage drawer can truthfully show in-progress state instead of hiding it.
- Extended `npm run verify:quality-reviews` with `--write-pending-sample --image-id=<id>` for manual pending-state verification.
- Real Coze/VLM workflow calls remain disabled.

Slice 7F completed:

- Added `scripts/migrate_quality_reviews.cjs` and `npm run migrate:quality-reviews` as an idempotent migration entrypoint for `db/005_image_quality_reviews.sql`.
- Migration safety: the script first checks whether `image_quality_reviews` already exists; the change only creates a new table and indexes, and rollback is `DROP TABLE image_quality_reviews` before production data depends on it.
- Verification plan: run `npm run verify:quality-reviews`, then explicitly run `npm run verify:quality-reviews -- --write-sample --image-id=<id>` to create and read back one mock review row.
- Real Coze/VLM workflow calls remain disabled.

Slice 7E completed:

- Added `scripts/verify_quality_reviews.cjs` and `npm run verify:quality-reviews` for read-only table/index verification.
- The verification script reports `tableExists:false` as a healthy not-yet-migrated state instead of failing the pipeline.
- The same script supports an explicit `--write-sample --image-id=<id>` mode after migration to create and read back one mock review row.
- Real Coze/VLM workflow calls remain disabled, and the online migration has still not been executed.

Slice 7D completed:

- Added a quality review repository facade with mock and RDS implementations.
- Generation success now creates mock sidecar quality reviews after images are saved; sidecar failures are logged and never block candidate display.
- The lineage API returns the latest quality review, and the lineage drawer shows a read-only quality summary.
- Real Coze/VLM workflow calls remain disabled.

Slice 7C completed:

- Added `db/005_image_quality_reviews.sql` with the standalone `image_quality_reviews` table and first-pass indexes.
- Added `lib/repositories/rds-image-quality-reviews.ts` with create pending, mark running, mark succeeded, mark failed/timeout/skipped, retry count, latest-by-image, and list-by-workflow-run methods.
- Kept generation jobs unchanged; no real Coze workflow, VLM call, or main generation path change was introduced.

Slice 7B completed:

- Added TypeScript contracts for image quality review inputs, results, statuses, scores, reject reasons, and human decisions.
- Added a mockable quality workflow adapter at `lib/services/coze-quality-workflow.ts`.
- The adapter returns deterministic mock review results and keeps real Coze workflow availability disabled.

Slice 6 completed:

- `GET /api/generated-images/[imageId]/lineage` now returns `WorkflowLineageViewModel` with `run`, `sections`, and empty-state metadata.
- History lineage drawer renders parent/current/sibling/child sections from the unified view model instead of stitching old/new fields in the UI.

Slice 7K completed:

- Added `docs/adr/0006-coze-workflow-api-spike.md` documenting the Coze workflow API surface (low-code vs AI programming), auth (PAT), sync/async modes, cost model, and required credentials.
- Implemented `realCozeQualityWorkflowAdapter` in `lib/services/coze-quality-workflow.ts` with sync-mode API call, timeout (120s), error handling, and response mapping to existing `ImageQualityReviewResult`.
- `isCozeQualityWorkflowAvailable()` now checks `COZE_PAT` and `COZE_QUALITY_WORKFLOW_ID` env vars instead of hardcoded `false`.
- `getQualityWorkflowAdapter()` auto-selects real or mock adapter based on env var presence.
- No real Coze workflow has been created; no real VLM calls; no costs incurred. Adapter is dormant until env vars are set.

Slice 7L completed:

- Created a real Coze Coding project (type=workflow) for image quality review via `coze code project create`.
  - Project "电商图片质检工作流", project_id `7651556067633315881`, space `lhs`.
  - VLM model: doubao-seed-1-8-251228. Analyzes clarity, background, centering, watermark.
  - Deployed to `https://zzwkr6vvr4.coze.site`. API: `POST /run` with SAT token auth.
  - Successfully tested with a real image via curl — VLM returned valid JSON.
- Rewrote `realCozeQualityWorkflowAdapter` to match the actual Coze Coding project `/run` API:
  - Endpoint: `POST <COZE_QUALITY_WORKFLOW_URL>/run`
  - Auth: `COZE_QUALITY_SAT_TOKEN` (Bearer scheme)
  - Input: `{ product_image: { url } }`
  - Output: `{ quality_status, confidence, suggestion, dimensions, run_id }`
  - Dimension mapping: clarity→visualQuality, background→brandCompliance, centering→productFidelity, watermark→templateFidelity (÷100 to normalize 0-1).
- Env vars changed from `COZE_PAT`/`COZE_QUALITY_WORKFLOW_ID` to `COZE_QUALITY_SAT_TOKEN`/`COZE_QUALITY_WORKFLOW_URL`.
- Updated `.env.example` with new env vars.
- Updated ADR 0006 with actual API contract and dimension mapping table.
- Adapter remains dormant (env vars not set on production → mock adapter still used).

## 2026-06-15 (Slice 8)

Slice 8 completed:

- Added `QualityBadge` type for compact quality summary on history card items.
- Added `getLatestByImageIds` batch query method to the quality review repository interface, with mock and RDS implementations.
- RDS implementation uses `ROW_NUMBER() OVER (PARTITION BY image_id ORDER BY created_at DESC, id DESC)` for efficient latest-per-image lookup.
- Modified `GET /api/generated-images` to batch-fetch quality badges for all images on the current page and include them in the response items.
- Updated `GeneratedImageHistory` component to render color-coded quality status badges on each history card:
  - Green: 质检通过 (pass)
  - Red: 质检不通过 (fail)
  - Amber: 质检待审 (review) / 质检中 (pending/running)
  - Badge also shows confidence percentage when review succeeded.
- Quality badges are non-blocking: if a review is missing or skipped, no badge is shown.
- This completes the quality review feedback loop: generate → VLM sidecar review → visible status on history cards.

Git history cleaned up: local main rebased onto origin/main (1524572), eliminating the 74-commit divergence from earlier parallel sessions.
