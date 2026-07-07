# 电商生图工作台 V2 启动说明

## 定位

本仓库是从 `MinerHo1972/ecommerce-visual-self-service` 独立出来的 V2 版本，用于后续独立开发和部署到新租用的阿里云 ECS 环境。

## V2 开发原则

- 不污染现有 V1 仓库，V1 继续作为历史基线和回滚参考。
- V2 面向正式 ECS 部署，默认按生产化架构演进。
- 图片、模板、生成结果、导出包进入 OSS；RDS 只存结构化元数据和 OSS object key。
- 优先补齐业务文档、数据字典、API 契约、部署说明，再进入大规模编码。

## 基础架构方向

- Web/App：Next.js + React + Tailwind + ShadCN UI
- Database：RDS PostgreSQL 或 MySQL
- Object Storage：阿里云 OSS 私有 Bucket
- Runtime：ECS + Docker Compose + Nginx/Caddy
- Future：按需增加 Redis/队列/CDN/GPU 任务机

## 首批改造方向

1. 公共资产区：产品图、模板图、品牌素材。
2. 个人工作区：个人生成图默认私有，可主动共享。
3. 版本链路：保留 v1/v2/v3、父子关系、prompt、参数、批注。
4. 生成任务：任务状态、失败重试、结果归档。
5. OSS 持久化：上传、预览、导出、生命周期策略。
6. RDS Schema：用户、资产、模板、生成任务、生成图片、版本关系、操作日志。

## 当前状态

- 已从 V1 源仓库创建独立 V2 起点。
- 下一步应先整理 V2 PRD / 数据模型 / ECS 部署方案，再拆开发切片。
