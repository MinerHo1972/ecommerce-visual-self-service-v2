# 任务拆解：电商视觉工作流操作台 2.0 MVP

## 总体策略

- 先做产品语义和入口收敛，让用户先感知「这是工作流操作台」。
- 再补运行路径和历史成图视角，让现有数据先可理解。
- 然后补最小工作流数据关系，为后续扣子工作流和自动化打基础。
- 暂不做通用拖拽编辑器、全量扣子工作流迁移、复杂权限和完整成品库。

## 任务清单

## Slice 1：自助工作台工作流化首屏

- 类型：AFK
- 目标：让用户进入自助工作台时，明确知道当前正在跑「商品图套模板」工作流。
- 用户价值：用户不再把页面理解成零散工具，而是理解成一个有步骤的视觉生产流程。
- 涉及范围：UI / 文案 / 文档
- 前置依赖：无
- 要做什么：
  - 在自助工作台顶部显示工作流名称「商品图套模板」。
  - 增加当前流程说明：选择产品图、模板图、框选区域、生成候选、判断下一步。
  - 将候选结果区域的操作文案统一为「下一步动作」。
  - 保持现有生成、反馈、下载、局部重绘、继续优化能力不变。
- 验收标准：
  - [ ] 用户进入自助工作台能看到「商品图套模板」。
  - [ ] 页面能解释这是一条工作流，而不是单个工具。
  - [ ] 候选图仍能反馈、下载、局部重绘、继续优化。
  - [ ] 不出现「最终图」概念。
  - [x] TypeScript 检查通过。
- 不包含：
  - 不新增数据库字段。
  - 不接入扣子工作流。
  - 不调整真实生成逻辑。
- 建议执行者：主 agent

## Slice 2：工作流模板轻量入口

- 类型：AFK
- 目标：新增一个轻量「工作流模板」入口，展示产品 2.0 的固定工作流方向。
- 用户价值：用户能看到未来能力不是散落工具，而是一组可复用流程。
- 涉及范围：UI / 路由状态 / 文案 / 文档
- 前置依赖：Slice 1 可并行，但建议先完成 Slice 1
- 要做什么：
  - 在左侧导航或自助工作台内增加「工作流模板」入口。
  - 展示首批模板卡片：商品图套模板、历史成图继续优化、局部重绘修瑕疵、批量上新图生产、文字修改与模板复用。
  - 将「商品图套模板」标记为已可用，并支持进入自助工作台。
  - 其他模板标记「即将接入」或「部分能力已可用」。
  - 避免未接入模板被误点击执行。
- 验收标准：
  - [ ] 用户能看到固定工作流模板列表。
  - [ ] 已可用和即将接入状态清楚区分。
  - [ ] 点击「商品图套模板」能进入自助工作台。
  - [ ] 未接入模板不会触发失败请求。
- 不包含：
  - 不做拖拽编辑器。
  - 不让用户自由配置节点。
  - 不接入真实批量生成。
- 建议执行者：主 agent

## Slice 3：分支路径升级为运行路径文案

- 类型：AFK
- 目标：将当前「分支路径」进一步解释为「运行路径」，减少用户理解成本。
- 用户价值：用户能看懂一张图从哪里来、同批还有什么、还能从哪里继续。
- 涉及范围：UI / 文案 / 历史成图 / 文档
- 前置依赖：无
- 要做什么：
  - 将前台入口从「分支路径」逐步调整为「运行路径」或「分支/运行路径」。
  - 抽屉说明用工作流语言解释：输入、AI 处理、候选、人审、下一步动作。
  - 保留父图、当前图、同批候选、子分支四块基础展示。
  - 路径内图片继续支持带回工作台和下载。
  - 旧数据继续按现有兼容逻辑展示。
- 验收标准：
  - [ ] 历史成图中路径入口文案更贴近工作流。
  - [ ] 抽屉说明能解释父图、当前图、同批候选、子分支。
  - [ ] 旧历史图片仍能打开路径抽屉。
  - [ ] 路径内「带回工作台」「下载」仍可用。
- 不包含：
  - 不做树状连线图。
  - 不做全量多代递归追踪。
  - 不新增 workflow 表。
- 建议执行者：主 agent

## Slice 4：历史成图增加运行视角

- 类型：AFK
- 目标：在不重构历史成图的前提下，增加「这张图属于哪类流程」的轻量展示。
- 用户价值：用户浏览历史图片时，不只是看图，还能知道它来自什么生产过程。
- 涉及范围：UI / 数据映射 / 旧数据兼容
- 前置依赖：Slice 3
- 要做什么：
  - 在历史成图卡片或详情中显示来源类型，例如「商品图套模板」「历史生成」「局部重绘」。
  - 对旧数据没有工作流字段时显示兼容来源，不显示空白。
  - 预留按工作流类型筛选的位置或文案，但不一定实现完整筛选。
  - 确保下载、移入回收站、带回工作台不回退。
- 验收标准：
  - [ ] 历史图片能显示来源类型或兼容来源。
  - [ ] 旧数据没有 workflow 字段时不会报错或空白。
  - [ ] 原有历史成图操作仍正常。
  - [ ] 页面加载性能不明显变差。
- 不包含：
  - 不改名整个「历史成图」页面为「历史运行」，除非用户另行确认。
  - 不做复杂筛选和统计报表。
- 建议执行者：主 agent

## Slice 5：最小工作流数据关系设计与落地

- 类型：HITL
- 目标：为新生成链路补充 workflow/run/step/parentAsset 的最小关系字段或兼容结构。
- 用户价值：后续能把图片生成、继续优化、局部重绘串成可追踪运行路径。
- 涉及范围：数据 / API / repository / 生成保存逻辑 / 兼容迁移文档
- 前置依赖：需要先阅读现有 generation-jobs 和 generated-images repository；字段方案需要用户确认后再落地。
- 要做什么：
  - 读取现有生成任务、历史成图、inputs_snapshot、parentImageId 相关代码。
  - 提出最小字段方案：是新增表，还是先扩展 generated_images / generation_jobs。
  - 明确新字段如何写入、如何查询、如何兼容旧数据。
  - 用户确认后再做代码落地。
- 验收标准：
  - [x] 有一份字段方案说明：`docs/adr/0002-minimal-workflow-relations.md`。
  - [x] 用户确认采用哪种落地方式：先扩展 `generated_images`，暂不新增完整 workflow 多表。
  - [x] 新生成数据能保存最小运行关系。
  - [x] 旧数据展示不受影响。
  - [ ] TypeScript 检查通过。
- 不包含：
  - 未确认前不直接改数据库结构。
  - 不回填历史数据。
  - 不接入扣子工作流。
- 建议执行者：主 agent + 用户确认

## Slice 6：工作流运行路径查询边界

- 类型：AFK
- 目标：为运行路径抽屉提供更清晰的数据组装边界，便于后续替换成 workflow 数据。
- 用户价值：用户看到的路径更稳定，开发后续不再在 UI 里拼复杂逻辑。
- 涉及范围：API / 数据映射 / UI 调用 / 测试
- 前置依赖：Slice 5 的字段方案，或先基于现有字段做兼容封装
- 要做什么：
  - 梳理当前父图、同批候选、子分支的查询逻辑。
  - 封装一个运行路径数据结构。
  - UI 只消费统一结构，不直接关心旧字段或新字段。
  - 保留旧数据兼容逻辑。
- 验收标准：
  - [x] 路径抽屉能通过统一结构渲染。
  - [x] 旧数据和新数据都能进入同一展示模型。
  - [x] 没有父图或没有子分支时有清晰空状态。
- 不包含：
  - 不做复杂图形化树。
  - 不强制要求新 workflow 表已存在。
- 建议执行者：主 agent

## Slice 7：扣子工作流接入预研切片

- 类型：HITL
- 方法约束：按 `docs/adr/0003-stage-verified-execution.md` 先写 stage map 和可失败验证，不直接改线上生成链路。
- 目标：选出第一个最适合封装为扣子工作流的节点，并形成接入方案。
- 用户价值：避免盲目迁移，先找到投入产出比最高的后端封装点。
- 涉及范围：产品判断 / 技术方案 / API 边界 / 风险评估
- 前置依赖：用户确认优先节点候选
- 要做什么：
  - 比较模板换产品、局部重绘、文字修改、自动质检四类节点。
  - 从稳定性、输入输出清晰度、调用成本、失败重试、人审依赖角度评估。
  - 形成「第一个接入扣子工作流节点」建议。
  - 写成技术方案或 ADR 草案。
- 验收标准：
  - [x] 明确第一个接入节点：自动质检旁路，详见 `docs/adr/0004-first-coze-workflow-node-quality-gate.md`。
  - [x] 明确 Web 与扣子工作流之间的输入输出边界。
  - [x] 明确失败、超时、重试、人审回传策略。
- 不包含：
  - 不在本切片实际接入扣子工作流。
  - 不改线上生成链路。
- 建议执行者：主 agent + 用户确认

## Slice 7A：质检日志表 / 事件结构设计

- 类型：AFK
- 方法约束：按 `docs/adr/0003-stage-verified-execution.md` 先写 stage map 和可失败验证，不直接创建真实扣子工作流。
- 目标：把自动质检旁路的输入输出落成可存储、可查询、可人审回流的数据模型。
- 用户价值：后续能把 VLM 评分、人审判断、拒因和扣子 trace 变成可复盘、可筛选、可训练的数据资产。
- 涉及范围：数据设计 / API 边界 / 旧图补跑策略 / 风险控制
- 前置依赖：Slice 7 已确认第一个节点为自动质检旁路。
- 要做什么：
  - 设计 `image_quality_reviews` 表或事件结构。
  - 明确字段、枚举、索引、写入时机、幂等重试和旧图补跑策略。
  - 明确它与 `generated_images`、`workflow_run_id`、`human_decision` 的边界。
  - 写成 ADR 草案。
- 验收标准：
  - [x] 明确质检日志结构：`docs/adr/0005-image-quality-review-log.md`。
  - [x] 明确字段、索引、状态机、写入时机。
  - [x] 明确旧图补跑和跳过策略。
  - [x] 明确不改主生成链路、不调用真实扣子/VLM 节点。
- 不包含：
  - 不执行真实数据库迁移。
  - 不接真实扣子工作流。
  - 不产生 VLM 或外部节点费用。
  - 不改 `POST /api/generation-jobs` 主链路。
- 建议执行者：主 agent

## Slice 7B：质检 TypeScript contract + mock adapter

- 类型：AFK
- 目标：先建立质检工作流的代码契约和可替换 adapter，避免真实扣子 workflow 接入前污染主链路。
- 验收标准：
  - [x] 在 `lib/types.ts` 定义质检输入、结果、状态、评分、拒因和人审类型。
  - [x] 在 `lib/services/coze-quality-workflow.ts` 提供 mockable adapter。
  - [x] 真实 Coze workflow availability 保持 disabled，避免误触发外部调用或费用。
- 不包含：
  - 不调用真实扣子工作流。
  - 不调用 VLM。
  - 不改主生成链路。
- 建议执行者：主 agent

## Slice 7C：RDS repository + SQL 迁移草案

- 类型：AFK
- 目标：把 `image_quality_reviews` 从 ADR 结构落到可提交的 SQL 迁移草案和 RDS repository 边界。
- 验收标准：
  - [x] 新增 `db/005_image_quality_reviews.sql`。
  - [x] 新增 `lib/repositories/rds-image-quality-reviews.ts`。
  - [x] Repository 支持 create pending、mark running、mark succeeded、mark failed/timeout/skipped、retry count、get latest by image、list by workflow run。
  - [x] 不改 `POST /api/generation-jobs` 主链路，不调用真实扣子/VLM 节点。
- 不包含：
  - 不执行线上数据库迁移。
  - 不触发异步质检。
  - 不做 UI 展示。
- 建议执行者：主 agent

## Slice 7D：异步旁路触发与 UI 只读展示

- 类型：AFK + HITL
- 目标：在不阻塞生成主链路的前提下，创建质检旁路记录，并在历史成图或运行路径中只读展示质检状态。
- 验收标准：
  - [x] 生成成功后能创建或排队质检记录，但失败不影响候选图展示。
  - [x] 历史成图或运行路径能显示最新质检状态。
  - [x] 真实 Coze/VLM 调用仍默认关闭，成本边界清晰。
- 不包含：
  - 不自动拦截、删除或重试候选图。
  - 不执行大批量旧图补跑。
- 建议执行者：主 agent

## Slice 7E：质检旁路硬化与手工验证

- 类型：AFK
- 目标：在考虑真实扣子/VLM 前，补齐旁路表存在性检查、错误边界和最小手工验证脚本。
- 验收标准：
  - [x] 表不存在或迁移未执行时，旁路失败只记录日志，不影响生成和运行路径查询。
  - [x] 有最小脚本验证路径：`npm run verify:quality-reviews` 只读检查表与索引，迁移后可用 `npm run verify:quality-reviews -- --write-sample --image-id=<id>` 创建样本质检记录并读取。
  - [x] 仍不接真实扣子/VLM 凭证，不产生外部费用。
- 不包含：
  - 不跑大批量补检。
  - 不自动质检拦截候选图。
  - 不执行线上数据库迁移。
- 建议执行者：主 agent

## Slice 7F：质检表迁移执行与持久化验证

- 类型：HITL + AFK
- 目标：在确认备份/回滚策略后，执行 `db/005_image_quality_reviews.sql`，并验证生成后的质检记录可持久化读取。
- 验收标准：
  - [x] 迁移前明确备份和回滚方式。
  - [x] `npm run verify:quality-reviews` 返回 `tableExists:true` 且包含预期索引。
  - [x] `--write-sample --image-id=<id>` 能创建并读取一条 mock review。
  - [x] `/api/generated-images/<id>/lineage` 在有记录时返回非空 `qualityReview`。
- 不包含：
  - 不接真实扣子/VLM。
  - 不批量补检历史图片。
- 建议执行者：主 agent + 用户确认迁移窗口

## Slice 7G：质检旁路异步化边界

- 类型：AFK
- 目标：把当前生成成功后同步 await 的 mock sidecar 改成可替换为异步 worker/队列的边界，为真实 Coze/VLM 接入前做延迟与失败隔离。
- 验收标准：
  - [x] 生成接口不等待真实质检执行。
  - [x] 质检任务状态可从 `pending` 到 `running` / `succeeded` / `failed` 更新。
  - [x] 运行路径能展示 pending/running 状态，不误导为已完成。
  - [x] 真实 Coze/VLM 仍保持 disabled。
- 不包含：
  - 不创建真实扣子 workflow。
  - 不调用 VLM。
  - 不做批量旧图补检。
- 建议执行者：主 agent

## Slice 7H：质检状态调试入口

- 类型：AFK
- 目标：提供一个最小调试入口，便于按图片 ID 或 workflowRunId 复查质检记录状态，减少只能通过 lineage 间接观察的问题。
- 验收标准：
  - [x] 可查询单图最新质检记录。
  - [x] 可查询单个 workflowRunId 下的质检记录列表。
  - [x] 不暴露敏感 prompt 或外部凭证。
  - [x] 真实 Coze/VLM 仍保持 disabled。
- 不包含：
  - 不做完整管理后台。
  - 不创建真实扣子 workflow。
- 建议执行者：主 agent

## Slice 7I：质检旁路真实生成触发验证

- 类型：AFK
- 目标：通过一次可控 sidecar 触发验证观察 mock 质检旁路从 pending 到 running/succeeded 的状态流转，验证 detached 边界不阻塞主生成链路；不为验证状态机额外消耗真实生图。
- 验收标准：
  - [x] 可通过显式验证命令创建新的质检记录。
  - [x] 调试入口可观察到 pending/running/succeeded 中的实际状态。
  - [x] 主候选图返回不等待真实 Coze/VLM。
  - [x] 真实 Coze/VLM 仍保持 disabled。
- 不包含：
  - 不创建真实扣子 workflow。
  - 不调用 VLM 或产生费用。
  - 不做大批量旧图补检。
- 建议执行者：主 agent

## Slice 7J：质检调试 UI 增强

- 类型：AFK
- 目标：把质检旁路的可观察性从 API/脚本推进到运行路径 UI，让开发者和后续 agent 能直接看到质检状态和调试入口。
- 验收标准：
  - [x] 运行路径弹窗展示质检状态、reviewId、workflowRunId、来源、建议动作、置信度和更新时间。
  - [x] 可在弹窗内刷新当前图片的质检状态。
  - [x] 可复制图片级和 workflowRun 级质检调试 API 路径。
  - [x] UI 只读，不触发真实 Coze/VLM、不重试、不拦截候选图。
- 不包含：
  - 不做完整管理后台。
  - 不创建真实扣子 workflow。
  - 不新增写入/重跑/删除入口。
- 建议执行者：主 agent

## Slice 7K：真实 Coze workflow API spike

- 类型：AFK
- 目标：研究 Coze 工作流 API 接入路径，实现真实 adapter，但不激活、不产生费用。
- 验收标准：
  - [x] 新增 `docs/adr/0006-coze-workflow-api-spike.md`，记录 API 类型、认证、同步/异步、成本模型、所需凭证。
  - [x] 实现 `realCozeQualityWorkflowAdapter`，包含 sync 模式调用、120s 超时、错误处理、debug_url 捕获。
  - [x] `isCozeQualityWorkflowAvailable()` 从硬编码 `false` 改为检查 `COZE_PAT` + `COZE_QUALITY_WORKFLOW_ID` 环境变量。
  - [x] `getQualityWorkflowAdapter()` 根据环境变量自动选择真实或 mock adapter。
  - [x] 未创建真实 Coze workflow，未调用 VLM，未产生费用。
- 不包含：
  - 不创建真实扣子 workflow（需在扣子 Web IDE 手动操作）。
  - 不设置环境变量激活 adapter。
  - 不做异步模式轮询。
  - 不做重试/熔断策略。
- 建议执行者：主 agent

## Slice 7L：真实 Coze workflow 创建 + adapter 重写

- 类型：AFK
- 目标：用 coze CLI 创建真实的质检 workflow 项目，部署并测试 `/run` API，重写 adapter 对接实际 API 契约。
- 验收标准：
  - [x] 通过 `coze code project create --type workflow` 创建"电商图片质检工作流"项目。
  - [x] 项目部署成功，生产域名可用。
  - [x] 通过 curl 调用 `POST /run` 端点，VLM 返回有效 JSON（quality_status/confidence/suggestion/dimensions/run_id）。
  - [x] 重写 `realCozeQualityWorkflowAdapter` 对接实际 API（SAT token 认证、`{ product_image: { url } }` 输入、直接 JSON 输出）。
  - [x] 维度映射：clarity→visualQuality, background→brandCompliance, centering→productFidelity, watermark→templateFidelity（÷100 归一化）。
  - [x] 环境变量改为 `COZE_QUALITY_SAT_TOKEN` + `COZE_QUALITY_WORKFLOW_URL`。
  - [x] 更新 `.env.example`。
  - [x] 更新 ADR 0006 记录实际 API 契约。
  - [x] 未在生产设置环境变量，adapter 保持休眠（默认走 mock）。
- 不包含：
  - 不在生产激活 adapter（不设置 env vars）。
  - 不做 Web UI 端到端测试。
  - 不做阈值调优和成本监控。
- 建议执行者：主 agent

## Slice 8：产品 2.0 文档索引与开发状态同步

- 类型：AFK
- 目标：让后续 agent 或开发者能快速找到产品 2.0 的方向、PRD、任务和决策。
- 用户价值：减少上下文丢失，方便继续协作。
- 涉及范围：文档 / 记忆 / 项目状态
- 前置依赖：当前任务文档完成
- 要做什么：
  - 在 `docs/development-status.md` 中索引任务拆解文档。
  - 必要时在项目记忆中追加产品 2.0 文档沉淀摘要。
  - 保持 `CONTEXT.md`、PRD、ADR、issues 文档互相可定位。
- 验收标准：
  - [ ] 从 development-status 能找到产品 2.0 文档链路。
  - [ ] 后续 agent 不需要重问产品 2.0 基本方向。
- 不包含：
  - 不提交 GitHub Issue。
  - 不创建外部项目管理任务。
- 建议执行者：主 agent

## 依赖顺序

### 可立即开始

- Slice 1：自助工作台工作流化首屏
- Slice 2：工作流模板轻量入口
- Slice 3：分支路径升级为运行路径文案
- Slice 8：产品 2.0 文档索引与开发状态同步

### 建议在前置完成后开始

- Slice 4：历史成图增加运行视角，依赖 Slice 3。
- Slice 6：工作流运行路径查询边界，依赖 Slice 5 或先做兼容封装。

### 需要用户确认

- Slice 5：最小工作流数据关系设计与落地。
- Slice 7：扣子工作流接入预研切片。

## 推荐第一批开发顺序

1. Slice 1：自助工作台工作流化首屏。
2. Slice 3：分支路径升级为运行路径文案。
3. Slice 2：工作流模板轻量入口。
4. Slice 4：历史成图增加运行视角。
5. Slice 5：最小工作流数据关系设计与落地。

这个顺序的好处是先让用户感知产品 2.0，再逐步补数据基础，避免一上来陷入数据库和工作流引擎设计。

## 风险与卡点

- 数据模型过早做大，会拖慢 2.0 感知层推进。
- 工作流模板入口如果做得太像拖拽编辑器，会偏离 MVP。
- 「历史成图」是否改名为「历史运行」仍需确认，建议暂时不改名。
- 扣子工作流接入要先选节点，不要一次性迁移整条链路。
- 新字段落地前必须确认与现有 RDS schema、repository、OSS 持久化逻辑兼容。


## Slice 4.5：生图操作快照 / Prompt Trace

- 类型：AFK
- 目标：记录每次真实发送给 Grsai 的完整生图请求快照，为运行路径追溯和后续质检节点提供训练特征。
- 用户价值：用户不仅能看到图片从哪来，还能看到当时 AI 收到的完整 prompt、约束预设、参考图顺序和候选参数；后续可形成 `prompt + 参数 → 候选图 → 人审决策` 的标注飞轮。
- 涉及范围：数据 / API / 历史成图运行路径 / UI
- 前置依赖：Slice 3；可优先于 Slice 4 实施
- 要做什么：
  - 在生成保存逻辑中构造 `operationTrace`，保存最终拼接后的完整 prompt，而不是 prompt 模板。
  - 保存 `workflowType`、`operationMode`、`constraintPreset`、`referenceUrls`、`referenceImageHashes`、`size`、`count`、`parentImageId`、`provider`、`createdAt`。
  - `constraintPreset` 单独结构化记录，例如「更像模板原图」「产品更突出」「修瑕疵」「模板文字保真」。
  - `referenceImageHashes` 优先使用图片内容 sha256；读取失败时回退为 URL 指纹。
  - 在运行路径抽屉中默认展示摘要，并折叠展示完整 prompt。
- 验收标准：
  - [ ] 新生成图片能在 `generated_images.operation_trace` 中保存完整最终 prompt。
  - [ ] 运行路径抽屉能看到「本次生图操作」摘要。
  - [ ] 点开「查看生图参数」能看到约束预设、引用图 hash 和完整 prompt。
  - [ ] 旧数据没有 `operationTrace` 时页面不报错。
  - [ ] TypeScript 检查通过。
- 不包含：
  - 不回填历史旧图的 prompt trace。
  - 不直接训练质检模型。
  - 不新增通用工作流编辑器。