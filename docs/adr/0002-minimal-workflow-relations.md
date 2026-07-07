# ADR 0002: 最小工作流关系先落在 generated_images

## 状态

已采纳并进入 Slice 5A 落地

## 背景

产品 2.0 已经从「生图工具」升级为「电商视觉工作流操作台」。当前线上已经具备运行路径展示和 Prompt Trace：

- `generation_jobs` 表示一次抽卡任务。
- `generated_images.job_id` 表示同批候选关系。
- `generated_images.inputs_snapshot.parentImageId` 表示继续优化或局部重绘的父图。
- `generated_images.operation_trace` 保存真实发送给 Grsai 的 prompt、参考图、约束、尺寸、候选数等。
- 运行路径接口目前在 UI/API 层临时拼装父图、当前图、同批候选、后续分支。

问题是 workflow/run/step/parentAsset 关系仍散落在 JSON 和 tags 中，不利于后续查询、质检节点、扣子工作流接入和人审标注飞轮。

Coco 对未来质检节点的建议是：质检不是一个好/坏分类器，而是一条「多维 VLM 评分 + 置信度路由 + 人审回流」链路。训练样本应包含 `promptTrace + referenceImages + candidateImage + constraintPreset + vlmScores + humanDecision + rejectReason`。因此本 ADR 只把运行关系放入 `generated_images`，不把 VLM 评分日志塞进图片主表；后续质检日志应单独建表或事件流。

## 决策

短期不新增完整 workflow/run/step 多表模型，先在 `generated_images` 上补最小结构化关系字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `workflow_type` | VARCHAR(64) NULL | 工作流类型，如 `template_replace`、`partial_repaint`、`template_text_edit`、`standard_generation` |
| `workflow_run_id` | VARCHAR(64) NULL | 一条可追踪运行链路 ID；首轮生成可等于 `job_id`，继续优化沿用父图的 run id |
| `workflow_step` | VARCHAR(64) NULL | 当前图片对应节点，如 `generate_candidates`、`human_selected_iteration`、`partial_repaint` |
| `parent_image_id` | BIGINT NULL | 父级历史成图 ID，替代 JSON 中的 `inputs_snapshot.parentImageId` 作为主查询字段 |
| `parent_asset_type` | VARCHAR(32) NULL | 父资产类型，当前主要是 `generated_image`，后续可扩展 `product`、`template`、`upload` |
| `human_decision` | VARCHAR(32) NULL | 人审决策，如 `selected`、`rejected`、`feedback_only`，先预留，可后续写入 |

`operation_trace` 继续保留完整 prompt 和参数快照，不把大 JSON 拆散成多列。

## 写入策略

新生成图片写入时：

1. 根据 `payload.inputs.mode` 写入 `workflow_type`。
2. 根据 `payload.inputs.parentImageId` 写入 `parent_image_id`。
3. 如果存在父图：读取父图的 `workflow_run_id`，沿用；如果父图没有，则回退父图 `job_id`。
4. 如果不存在父图：`workflow_run_id = job_id`。
5. 根据模式写入 `workflow_step`：
   - `template_replace` → `generate_candidates`
   - `template_text_edit` → `template_text_edit`
   - `partial_repaint` → `partial_repaint`
   - 继续优化但仍是模板换产品 → `human_selected_iteration`
6. `parent_asset_type` 当前仅在有 `parent_image_id` 时写 `generated_image`。
7. `human_decision` 初期可为空，后续在用户选中候选、反馈、带回工作台时再补写。

## 查询策略

运行路径接口优先读结构化字段：

- 父图：`parent_image_id`。
- 同批候选：`job_id`。
- 后续分支：`parent_image_id = current.id`。
- 同一运行链路：`workflow_run_id = current.workflow_run_id`。

兼容旧数据时，若结构化字段为空：

- `parent_image_id` 回退读取 `inputs_snapshot.parentImageId`。
- `workflow_type` 回退读取 `operation_trace.workflowType`、`inputs_snapshot.mode`、tags。
- `workflow_run_id` 回退为 `job_id`。
- `workflow_step` 回退为由 mode/tags 推断的展示标签。

## 为什么不现在新增 workflow_runs / workflow_steps 表

完整三表模型更清晰，但当前 MVP 的关键问题是让「图片生成链路」可查询、可追溯、可进入质检飞轮。现在新增多表会带来：

- 迁移复杂度高，旧数据映射成本高。
- 代码改动面更大，容易影响正在稳定的生成链路。
- 工作流模板、扣子工作流节点边界还没最终确认，过早建表可能返工。

因此先采用「generated_images 最小关系字段 + operation_trace 完整快照」方案。等 Slice 7 确认扣子工作流接入节点后，再考虑抽出 `workflow_runs` 和 `workflow_steps`。

## 后续落地切片

确认本 ADR 后，建议分两步做：

1. Slice 5A：只加字段、TypeScript 类型、repository 写入和兼容读取，不改 UI。
2. Slice 6：把运行路径接口封装成统一结构，UI 只消费标准模型。

## 验收标准

- 新生成图片有结构化 `workflow_type`、`workflow_run_id`、`workflow_step`。
- 继续优化/局部重绘图片有 `parent_image_id`。
- 旧数据字段为空时仍能通过 JSON/tags 兼容展示。
- 运行路径接口可以从结构化字段优先查询。
- TypeScript 检查通过。
