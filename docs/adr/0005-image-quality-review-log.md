# ADR 0005: image_quality_reviews 质检日志表与事件结构

## 状态

草案，Slice 7A 数据结构设计

## Stage Map

Stage 1: 读取现状 → 已核对 ADR 0002/0004、现有 `generated_images` 最小工作流字段、当前 TypeScript 图片类型和 RDS repository 写入方式。
Stage 2: 定义数据边界 → 将机器质检、人审回传和扣子 workflow trace 放入独立日志表，不塞进 `generated_images` 主表。
Stage 3: 设计可落地结构 → 明确字段、枚举、索引、写入时机、补跑策略和 API 展示边界。
Stage 4: 可失败验证 → 检查是否不改主生成链路、不触发扣子/VLM 费用、不破坏旧图兼容。

## 背景

ADR 0004 已决定第一个扣子工作流节点选择「自动质检旁路」。质检节点的目标不是替代人工，也不是在第一阶段自动拦截生成结果，而是为每张候选图积累可追溯的机器评分、置信度、拒因和人审反馈。

ADR 0002 已将运行关系最小化落在 `generated_images`：`workflow_type`、`workflow_run_id`、`workflow_step`、`parent_image_id`、`parent_asset_type`、`human_decision`。这些字段适合支撑运行路径查询，但不适合继续承载 VLM 评分、扣子运行 trace、重试记录和人审拒因。质检结果具有多次运行、多版本评分、人审覆盖和外部 workflow trace 的特征，应独立建表或事件流保存。

## 决策

新增独立质检日志表 `image_quality_reviews`，记录候选图的机器质检结果、人审回传和外部扣子工作流运行信息。

第一阶段只设计结构，不执行真实数据库迁移，不调用真实扣子工作流，不改 `POST /api/generation-jobs` 主链路。

## 表设计

建议迁移文件后续命名为 `db/005_image_quality_reviews.sql`。

```sql
CREATE TABLE image_quality_reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  image_id BIGINT NOT NULL,
  workflow_run_id VARCHAR(64) NULL,
  workflow_type VARCHAR(64) NULL,
  workflow_step VARCHAR(64) NULL,
  review_source VARCHAR(32) NOT NULL DEFAULT 'coze_workflow',
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  quality_status VARCHAR(32) NULL,
  confidence DECIMAL(5,4) NULL,
  vlm_scores JSON NULL,
  reject_reasons JSON NULL,
  suggested_action VARCHAR(32) NULL,
  prompt_trace JSON NULL,
  reference_images JSON NULL,
  reference_image_hashes JSON NULL,
  candidate_image_url TEXT NULL,
  constraint_preset VARCHAR(64) NULL,
  inputs_snapshot JSON NULL,
  human_decision VARCHAR(32) NULL,
  human_reject_reason TEXT NULL,
  human_reviewer VARCHAR(128) NULL,
  coze_workflow_run_id VARCHAR(128) NULL,
  raw_trace_url TEXT NULL,
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_quality_reviews_image_id (image_id),
  INDEX idx_quality_reviews_workflow_run (workflow_run_id),
  INDEX idx_quality_reviews_review_status (review_status),
  INDEX idx_quality_reviews_quality_status (quality_status),
  INDEX idx_quality_reviews_created_at (created_at)
);
```

暂不添加外键约束。原因是当前线上 runtime 自动迁移策略以低风险加列为主，项目也需要兼容历史数据、软删除图和后续离线补跑。应用层通过 `image_id` 关联 `generated_images.id` 即可。

## 字段语义

| 字段 | 含义 |
| --- | --- |
| `image_id` | 被质检的 `generated_images.id` |
| `workflow_run_id` | 候选图所属运行链路，用于按一次生产流程聚合质检结果 |
| `workflow_type` | 生成类型，如 `template_replace`、`partial_repaint`、`template_text_edit` |
| `workflow_step` | 当前图片所在步骤，如 `generate_candidates`、`partial_repaint` |
| `review_source` | 质检来源，首期为 `coze_workflow`，后续可扩展 `manual`、`mock`、`offline_batch` |
| `review_status` | 质检任务状态：`pending`、`running`、`succeeded`、`failed`、`timeout`、`skipped` |
| `quality_status` | 质检路由结果：`pass`、`fail`、`review` |
| `confidence` | 0-1 置信度，使用 `DECIMAL(5,4)` 避免浮点展示误差 |
| `vlm_scores` | 多维评分 JSON，包括产品保真、品牌合规、模板遵循、视觉质量、产品数量一致性 |
| `reject_reasons` | 机器判定失败或需人审的原因数组 |
| `suggested_action` | 建议动作：`accept`、`retry`、`manual_review` |
| `prompt_trace` | 从 `operation_trace` 复制的 prompt 和关键生成参数快照 |
| `reference_images` | 产品图、模板图、父图或局部参考图 URL 列表 |
| `reference_image_hashes` | 参考图 hash，便于后续样本去重 |
| `candidate_image_url` | 质检时使用的候选图 URL，可为签名 URL 或稳定 OSS URL |
| `constraint_preset` | 生成约束，如模板保真、产品突出、修瑕疵等 |
| `inputs_snapshot` | 用户原始输入快照，用于复盘和离线分析 |
| `human_decision` | 人审结果：`accepted`、`rejected`、`overridden`、`ignored` |
| `human_reject_reason` | 人工拒因或补充说明 |
| `human_reviewer` | 人审操作者标识，首期可为空 |
| `coze_workflow_run_id` | 扣子侧 workflow 运行 ID |
| `raw_trace_url` | 扣子侧 trace 链接或排查入口 |
| `error_code` / `error_message` | 外部质检失败的错误摘要 |
| `retry_count` | 自动重试次数，首期上限 1 |

## JSON 结构约定

`vlm_scores` 建议结构：

```json
{
  "productFidelity": 0.92,
  "brandCompliance": 0.85,
  "templateFidelity": 0.88,
  "visualQuality": 0.9,
  "productCount": 1
}
```

`reject_reasons` 建议结构：

```json
[
  "product_shape_changed",
  "template_text_drift"
]
```

第一阶段不强制把 JSON 拆成列。原因是评分维度还会随质检 prompt 和业务策略调整；等至少积累一批真实样本后，再考虑把高频筛选维度结构化。

## 索引策略

首期只保留查询和运维必要索引：

- `idx_quality_reviews_image_id`：历史成图卡片或详情页按图片查最新质检记录。
- `idx_quality_reviews_workflow_run`：按一次工作流运行聚合候选图质检结果。
- `idx_quality_reviews_review_status`：后台轮询或补偿任务扫描 `pending/running/failed`。
- `idx_quality_reviews_quality_status`：后续筛选「需人审 / 失败 / 通过」图片。
- `idx_quality_reviews_created_at`：离线批处理、审计和清理。

不在首期加 JSON 虚拟列索引，避免 RDS 迁移复杂化。

## 写入时机

推荐分三段写入：

1. **生成成功后创建 pending 记录**
   - 每张候选图保存成功后，根据 `GeneratedImage` 和 `operationTrace` 创建一条 `review_status=pending` 的质检日志。
   - 如果图片缺少 `operationTrace` 或候选图 URL，则写 `review_status=skipped`，不触发外部调用。
2. **质检开始时更新 running**
   - 记录 `started_at`、`coze_workflow_run_id`，并保留本次传给扣子工作流的输入快照。
3. **质检完成后写结果**
   - 成功：写 `review_status=succeeded`、`quality_status`、`confidence`、`vlm_scores`、`reject_reasons`、`suggested_action`、`finished_at`。
   - 失败：写 `review_status=failed` 或 `timeout`、`error_code`、`error_message`、`finished_at`。

首期不要求在 `POST /api/generation-jobs` 同步执行这些步骤。真正落地时应通过异步旁路或后续补偿任务触发，避免增加用户等待时间。

## 幂等与重试

- 同一 `image_id` 可以有多条质检记录，用于保留不同版本策略或重跑结果。
- 默认展示最新一条 `review_status in ('succeeded', 'failed', 'timeout', 'skipped')` 的记录。
- 自动重试只针对同一条 review 更新 `retry_count`，上限 1。
- 如果质检 prompt、评分策略或扣子工作流版本变化，应新建一条 review，而不是覆盖旧记录。

## 旧图补跑策略

旧图补跑分三档：

1. **可自动补跑**：图片存在有效 URL，且 `operation_trace` 或兼容推断能得到 prompt、参考图和 workflow 类型。
2. **只做人审样本**：缺少 prompt trace，但图片 URL 可访问，可进入人工抽检或标注，不调用自动质检。
3. **跳过**：图片 URL 不可访问、已删除、已归档，或缺少必要输入。

补跑任务应按 `created_at` 分批，限制单批数量和费用预算。首期 ADR 不创建补跑脚本。

## 与现有表的关系

- `generated_images` 继续作为图片主表和运行路径主查询来源。
- `image_quality_reviews.image_id` 关联 `generated_images.id`。
- `image_quality_reviews.workflow_run_id` 冗余保存，便于不 join 主表时按运行链路聚合。
- `generated_images.human_decision` 暂不复用为质检人审字段，避免混淆「候选选择」与「质检判断」。
- 未来运行路径抽屉可以追加 `quality_review` section，但 Slice 7A 不改 UI。

## API 边界建议

后续 Slice 可新增只读接口：

- `GET /api/generated-images/[imageId]/quality-review`：返回该图最新质检记录。
- `GET /api/workflow-runs/[workflowRunId]/quality-reviews`：返回同一运行链路下所有候选图质检结果。

后续人审可新增写接口：

- `PATCH /api/image-quality-reviews/[reviewId]/human-decision`：写入 `human_decision` 和 `human_reject_reason`。

这些接口不在 Slice 7A 实现。

## 不做什么

- 不调用真实扣子工作流。
- 不调用 VLM 或产生外部费用。
- 不修改 `POST /api/generation-jobs` 主链路。
- 不自动拦截、删除或重试候选图。
- 不回填历史数据。
- 不把 VLM 评分字段塞进 `generated_images` 主表。

## 后续切片建议

### Slice 7B：TypeScript contract + mock adapter

- 新增 `ImageQualityReview`、`QualityReviewStatus`、`QualityStatus`、`QualitySuggestedAction` 类型。
- 新增 mockable 服务边界，例如 `lib/services/coze-quality-workflow.ts`。
- 只返回 mock 结果，不接真实凭证。

### Slice 7C：RDS repository + SQL 迁移

- 新增 `db/005_image_quality_reviews.sql`。
- 新增 repository 方法：create pending、mark running、mark succeeded、mark failed、get latest by image、list by workflow run。
- 运行 TypeScript 检查。

### Slice 7D：异步旁路触发与 UI 只读展示

- 生成成功后异步创建/触发质检。
- 历史成图或运行路径展示质检状态。
- 失败不影响候选图展示。

## 可失败验证

本 ADR 的验证检查：

- 是否保持 `generated_images` 主表职责清晰：已将质检日志独立为 `image_quality_reviews`。
- 是否覆盖 ADR 0004 的输入输出字段：已覆盖候选图、promptTrace、参考图、评分、拒因、建议动作、trace。
- 是否明确状态机：已定义 `review_status` 和 `quality_status`。
- 是否明确写入时机：已覆盖 pending、running、完成/失败。
- 是否明确旧图补跑：已分为自动补跑、人审样本、跳过。
- 是否避免真实外部调用和费用：Slice 7A 只做文档设计。

## 未验证

- 未创建真实 RDS 表。
- 未验证扣子工作流 API、鉴权、回调或 trace URL。
- 未跑真实 VLM 质检样本。
- 未验证前端展示形态。
- 未决定是否需要单独的后台任务队列。
