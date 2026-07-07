# ADR 0004: 第一个扣子工作流节点选择自动质检旁路

## 状态

草案，Slice 7 预研结论

## Stage Map

Stage 1: 读取现状 → 已核对自助工作台、生成 API、Grsai 服务、运行路径 API、ADR 0001/0002/0003。
Stage 2: 节点评估 → 对比模板换产品、局部重绘、文字修改、自动质检四类节点。
Stage 3: 方案草案 → 建议第一个扣子工作流节点选择「自动质检旁路」，不是直接迁移生图。
Stage 4: 可失败验证 → 检查输入输出边界、失败/超时、人审回传、旧链路兼容是否覆盖。

## 背景

ADR 0001 已决定：Web 保持为视觉工作流操作台，扣子 / Agent 负责 AI 节点封装、自然语言入口、自动调度、条件分支和生产总结。ADR 0002 已把最小运行关系落在 `generated_images`，为后续质检飞轮保留 `human_decision` 等字段。ADR 0003 要求复杂切片先做 stage map 和可失败验证。

扣子低代码工作流适合功能类请求，可通过开始节点定义输入参数，经过一系列节点处理后由结束节点返回结果；节点具备输入输出，画布中可以看到数据流转和任务顺序。同时，使用付费节点时，即使整体失败，已成功运行的付费节点仍可能计费。因此第一个接入点应避免影响主生图链路，并尽量选择可旁路、可重试、可观察的节点。

当前项目中，`POST /api/generation-jobs` 已统一承载模板换产品、局部重绘、文字修改和标准生成；三类主生图能力在 `lib/repositories/generation-jobs.ts` 中通过 `mode` 分流构造 prompt，并最终调用 Grsai。运行结果已保存 `operationTrace`、`inputsSnapshot`、`workflowType`、`workflowRunId`、`workflowStep`、`parentImageId` 等字段。

## 候选节点评估

| 候选节点 | 稳定性 | 输入输出清晰度 | 成本与失败风险 | 人审依赖 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 模板换产品 | 中 | 中高：产品图、模板图、商品区域、候选数 | 高：直接消耗生图成本，失败影响主流程 | 中：候选选择依赖人 | 不适合作为第一个迁移节点，当前 Web + Grsai 链路已稳定，迁移风险大 |
| 局部重绘 | 中低 | 中：父图、框选区域、指令、可选参考图 | 高：区域精度和参考图约束容易失败 | 高：强依赖用户框选和人工判断 | 不适合首个节点，适合后续在 Web 保留交互后封装执行层 |
| 文字修改 | 中 | 中：模板图、原文字、新文字、补充指令 | 中：成本低于多候选生图，但 OCR/文字定位不稳定 | 中：仍需人工确认改字准确 | 可作为第二批候选，但首个接入价值不如质检 |
| 自动质检旁路 | 高 | 高：候选图、promptTrace、参考图、constraintPreset | 中：可异步、可失败不阻塞主流程 | 中：低置信进入人审，能反哺数据 | 推荐作为第一个扣子工作流节点 |

## 决策

第一个扣子工作流接入节点选择「自动质检旁路」，而不是把现有模板换产品、局部重绘或文字修改直接迁移到扣子工作流。

原因：

1. **旁路安全**：质检失败不影响用户拿到候选图；最多影响评分展示和后续推荐。
2. **输入输出清晰**：输入是已生成候选图和已有 `operationTrace`；输出是多维评分、置信度、建议动作和拒因。
3. **契合数据飞轮**：可把 `vlmScores + humanDecision + rejectReason` 作为后续训练/阈值校准样本。
4. **最小侵入**：现有 `POST /api/generation-jobs` 不改；生成成功后异步触发或后续补跑质检即可。
5. **能验证**：可以先对历史图或最新候选图跑 dry-run，验证字段完整性和评分结构，不必消耗主生图链路。

## 输入输出边界

### Web / 后端传给扣子工作流

建议输入对象：

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `imageId` | `generated_images.id` | 候选图 ID |
| `candidateImageUrl` | `generated_images.thumbnail_url` 或 OSS 签名 URL | 待质检图片 |
| `workflowType` | `generated_images.workflow_type` / `operation_trace.workflowType` | 生成类型 |
| `workflowRunId` | `generated_images.workflow_run_id` | 所属运行链路 |
| `workflowStep` | `generated_images.workflow_step` | 当前节点 |
| `promptTrace` | `generated_images.operation_trace.prompt` | 最终发送给生图模型的 prompt |
| `referenceImages` | `generated_images.operation_trace.referenceUrls` | 产品图、模板图、父图或局部参考图 |
| `referenceImageHashes` | `generated_images.operation_trace.referenceImageHashes` | 参考图哈希 |
| `constraintPreset` | `generated_images.operation_trace.constraintPreset` | 约束类型 |
| `inputsSnapshot` | `generated_images.inputs_snapshot` | 用户输入快照 |
| `createdAt` | `generated_images.created_at` | 生成时间 |

### 扣子工作流返回给 Web / 后端

建议输出对象：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `imageId` | number | 被质检图片 ID |
| `qualityStatus` | `pass` / `fail` / `review` | 质检结果路由 |
| `confidence` | number | 0-1 置信度 |
| `vlmScores.productFidelity` | number | 产品保真 |
| `vlmScores.brandCompliance` | number | 品牌合规 |
| `vlmScores.templateFidelity` | number | 模板遵循 |
| `vlmScores.visualQuality` | number | 视觉质量 |
| `vlmScores.productCount` | number | 产品数量/结构一致性 |
| `rejectReasons` | string[] | 失败或人审原因 |
| `suggestedAction` | `accept` / `retry` / `manual_review` | 后续建议 |
| `rawTraceUrl` | string? | 扣子侧运行记录或 Trace 链接 |
| `finishedAt` | string | 完成时间 |

## 失败、超时、重试策略

- 质检节点独立于生图主流程；主图生成成功后，即使质检失败，候选图仍保存和展示。
- 质检超时时写入 `qualityStatus=review` 或等待态，不自动删除候选图。
- 扣子工作流失败最多自动重试 1 次；仍失败则记录 `workflow_error`，不反复消耗费用。
- 低置信度结果只进入人审，不自动拦截或重试生图。
- 第一阶段不基于质检结果自动触发二次生成，避免成本失控。

## 人审回传策略

人审结果暂不直接改 `generated_images.human_decision` 的含义；建议新增独立质检日志表或事件流，保存机器判断和人工判断的对照。

推荐后续表：`image_quality_reviews`

关键字段：

- `id`
- `image_id`
- `workflow_run_id`
- `workflow_type`
- `prompt_trace`
- `reference_images`
- `candidate_image_url`
- `constraint_preset`
- `vlm_scores`
- `quality_status`
- `confidence`
- `reject_reasons`
- `suggested_action`
- `human_decision`
- `human_reject_reason`
- `coze_workflow_run_id`
- `raw_trace_url`
- `created_at`
- `finished_at`

## 兼容旧链路

- 旧图没有结构化字段时，可从 `operationTrace`、`inputsSnapshot` 和 tags 回退推断。
- 没有 `operationTrace` 的旧样本不进入自动质检，或只作为人工抽检样本。
- 现有 `GET /api/generated-images/[imageId]/lineage` 不需要修改；未来可在运行路径抽屉追加质检 section。
- 现有 `POST /api/generation-jobs` 不改入参、不改返回，不影响用户当前生成体验。

## 不选其他节点的原因

### 不先迁移模板换产品

模板换产品是主收入/主体验链路，涉及产品图、模板图、区域约束、候选数量、继续优化和下载。直接迁移会影响当前稳定链路，且扣子工作流失败会带来生图成本和用户等待风险。

### 不先迁移局部重绘

局部重绘强依赖 Web 框选交互。扣子工作流可以处理执行层，但不适合承载框选、预览、局部选择等高密度图片操作。

### 不先迁移文字修改

文字修改的输入比模板换产品简单，但文字定位、OCR 识别和字体风格保真仍存在不确定性。它适合作为第二批节点，在质检日志有基础后再接入。

## 下一步切片建议

### Slice 7A：质检日志数据结构设计

- 新增 `docs/adr/0005-image-quality-review-log.md`。
- 明确 `image_quality_reviews` 字段、索引、写入时机和旧图补跑策略。
- 不调用扣子工作流。

### Slice 7B：质检工作流调用适配层

- 新增后端服务边界，例如 `lib/services/coze-quality-workflow.ts`。
- 只定义 TypeScript contract 和 mock 实现。
- 不接真实扣子凭证，不触发外部费用。

### Slice 7C：异步旁路触发

- 在生成成功后可选触发质检任务。
- 失败不影响生成结果。
- 前端仅展示「待质检 / 需人审 / 通过 / 未接入」状态。

## 可失败验证

本 ADR 的验证检查：

- 是否比较了四类候选节点：已覆盖模板换产品、局部重绘、文字修改、自动质检。
- 是否明确第一个接入节点：选择自动质检旁路。
- 是否明确 Web 与扣子工作流输入输出边界：已列字段表。
- 是否明确失败、超时、重试、人审回传策略：已覆盖。
- 是否不改线上生成链路：本切片只写文档，不改代码。

## 未验证

- 未实际创建扣子低代码工作流。
- 未确认具体 VLM 节点可用性、计费和输出格式。
- 未验证扣子工作流外部 API 调用方式、鉴权方式和回调方式。
- 未跑真实候选图质检样本。

这些应进入 Slice 7A/7B，而不是在本预研切片里一次性完成。
