# ADR 0006: Coze Workflow API Spike for Quality Review

Status: Accepted (Slice 7K)
Date: 2026-06-15

## Context

Slice 7A–7J completed the mock quality review sidecar: TypeScript contracts, RDS repository, detached async boundary, debug API endpoints, debug UI panel, and controlled sidecar verification. The next step is connecting to a real Coze workflow that runs a VLM to score candidate images.

Before writing the real adapter, we need to understand the Coze workflow API surface and plan the integration.

## Research Findings

### Two Workflow API Types in Coze

Coze offers two distinct workflow development paths, each with a different API surface:

1. **Low-code workflow** (低代码工作流): Visual drag-and-drop in the Coze web IDE.
   - API: `POST https://api.coze.cn/v1/workflow/run`
   - Auth: PAT (Personal Access Token), header `Authorization: Bearer pat_xxxx`
   - Supports sync, stream, and async modes
   - `workflow_id` identifies the deployed workflow

2. **AI Programming workflow** (AI 编程工作流): Code-first workflow developed in Coze AI Programming (扣子编程), deployed to a custom domain.
   - API: `https://<your_domain>/run`, `/stream_run`, `/async_run`, `/task/{task_id}`
   - Auth: API Token created in the deployment page
   - Supports sync, stream, and async modes
   - Each deployment gets a unique domain

### Recommended Path: Low-code Workflow

For quality review, the low-code workflow is the better fit because:
- Simpler auth (PAT, no custom domain management)
- Direct `workflow_id` based API
- Can use built-in LLM/VLM nodes without writing code
- Async mode (`is_async: true`) returns `execute_id` for polling — aligns with our detached sidecar pattern

### API Contract (Sync Mode)

```
POST https://api.coze.cn/v1/workflow/run
Headers:
  Authorization: Bearer pat_xxxx
  Content-Type: application/json
Body:
{
  "workflow_id": "<workflow_id>",
  "parameters": {
    "candidate_image_url": "https://...",
    "reference_images": ["https://...", "https://..."],
    "workflow_type": "template_replace",
    "prompt": "..."
  }
}
Response (success):
{
  "code": 0,
  "cost": "0",
  "data": "{\"quality_status\":\"pass\",\"confidence\":0.88,...}",
  "debug_url": "https://www.coze.cn/work_flow?execute_id=...",
  "msg": "Success",
  "token": 98
}
```

### API Contract (Async Mode)

```
POST https://api.coze.cn/v1/workflow/run  (with is_async: true)
Response:
{
  "code": 0,
  "execute_id": "74248231384xxxx",
  "debug_url": "...",
  "msg": "Success"
}

GET https://api.coze.cn/v1/workflows/{workflow_id}/run_histories/{execute_id}
Headers: Authorization: Bearer pat_xxxx
Response:
{
  "code": 0,
  "data": [{
    "execute_status": "Success",
    "output": "...",
    "debug_url": "...",
    ...
  }]
}
```

### Cost Model

- LLM/VLM nodes (大模型节点) charge per model token
- Image generation nodes charge per call
- Partial workflow failure still bills successfully executed paid nodes
- Costs are deducted from Coze subscription points/credits

### Credentials Required

| Variable | Description | Source |
|---|---|---|
| `COZE_PAT` | Personal Access Token for API auth | Coze → Settings → API Tokens |
| `COZE_QUALITY_WORKFLOW_ID` | Workflow ID of the deployed quality review workflow | Coze workflow deployment page |

## Decision

### Slice 7K scope (initial spike — outdated)

The initial spike assumed the **low-code workflow** path (`POST https://api.coze.cn/v1/workflow/run` with PAT auth). See "API Revision" below for the actual path used.

### Slice 7L scope (real workflow created + adapter rewritten)

**What was done:**

1. **Created real Coze workflow** via `coze code project create --type workflow`:
   - Project: "电商图片质检工作流" (project_id: `7651556067633315881`)
   - Space: `lhs` (`7651564872240594996`)
   - VLM model: `doubao-seed-1-8-251228`
   - URL: https://code.coze.cn/p/7651556067633315881
   - Deployed to: `https://zzwkr6vvr4.coze.site`

2. **Tested the `/run` endpoint** with a real image — VLM analysis returned valid JSON.

3. **Rewrote `realCozeQualityWorkflowAdapter`** to match the actual API contract (see API Revision below).

### API Revision: Coze Coding project `/run` endpoint

The initial spike assumed the low-code workflow API. In practice, the workflow was created as a **Coze Coding project** (type=workflow), which uses a different API surface:

```
POST https://<domain>.coze.site/run
Headers:
  Authorization: Bearer <SAT Token>
  Content-Type: application/json
Body:
  { "product_image": { "url": "https://..." } }

Response (success — 200):
{
  "quality_status": "pass" | "fail" | "warning",
  "confidence": 0.88,
  "suggestion": "中文文字建议",
  "dimensions": {
    "clarity": 85,
    "background": 90,
    "centering": 80,
    "watermark": 100
  },
  "run_id": "uuid"
}

Response (error — 4xx/5xx):
{
  "detail": {
    "error_code": 201005,
    "error_message": "..."
  }
}
```

### Key differences from initial spike

| Aspect | Spike assumption (7K) | Actual API (7L) |
|---|---|---|
| API path | `POST /v1/workflow/run` | `POST <domain>/run` |
| Auth | PAT (`pat_xxx`) | SAT Token (`sat_xxx`) |
| Input | `workflow_id` + `parameters` object | `{ product_image: { url } }` |
| Output | `{ code, data: "json string" }` envelope | Direct JSON object |
| Env vars | `COZE_PAT`, `COZE_QUALITY_WORKFLOW_ID` | `COZE_QUALITY_SAT_TOKEN`, `COZE_QUALITY_WORKFLOW_URL` |

### Dimension mapping

The workflow's VLM scores dimensions on a 0-100 scale. We map them to our 0-1 `QualityVlmScores`:

| Workflow dimension | Our field | Mapping |
|---|---|---|
| `clarity` | `visualQuality` | ÷100 |
| `background` | `brandCompliance` | ÷100 |
| `centering` | `productFidelity` | ÷100 |
| `watermark` | `templateFidelity` | ÷100 |
| (n/a) | `productCount` | fixed 1.0 |

The workflow's `quality_status` "warning" maps to our `QualityStatus` "review".

### Credentials Required

| Variable | Description | Source |
|---|---|---|
| `COZE_QUALITY_SAT_TOKEN` | SAT Token for the deployed Coze Coding project | Coze CLI config / deployment page |
| `COZE_QUALITY_WORKFLOW_URL` | Base URL of deployed workflow (e.g. `https://xxx.coze.site`) | Coze Coding deployment |

### Not in this slice

- Activating the adapter (env vars not set on production)
- End-to-end test through the web UI
- Threshold tuning and cost monitoring

### Future slices

- **Slice 7M**: Activate the adapter on production (set env vars, end-to-end test)
- **Slice 7N**: Tune thresholds, retry policy, cost monitoring

## Consequences

- The real adapter calls the Coze Coding project `/run` endpoint (not the low-code workflow API)
- Env vars changed from `COZE_PAT`/`COZE_QUALITY_WORKFLOW_ID` to `COZE_QUALITY_SAT_TOKEN`/`COZE_QUALITY_WORKFLOW_URL`
- Adapter remains disabled by default (env vars empty → mock adapter)
- No new dependencies (uses Node.js built-in `fetch`)
- Dimension scores from VLM (0-100) are normalized to 0-1 for our contract
