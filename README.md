# 电商视觉自助台

模板驱动的电商改图自助台。第一阶段目标是跑通：设计师配置模板，运营套模板、改文字、抽卡选优、多尺寸导出和历史复用。

## Current Slice

- Next.js + React + TypeScript skeleton
- 618 / 双11 sample layer templates
- Canvas layered renderer
- Text AutoShrink and overflow checks
- Mock template and tag APIs
- Mock generated image history API and history gallery
- Mock OSS upload-token and signed-url APIs
- Template draft save API with in-memory persistence
- Optional RDS template repository selected by `TEMPLATE_REPOSITORY_MODE`
- Product image upload entry wired to upload-token flow
- Adapter boundaries for future Aliyun ECS/RDS/OSS deployment
- Initial RDS schema draft

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Aliyun Integration Boundary

- OSS signing: `lib/oss.ts`
- Template persistence: `lib/repositories/templates.ts`
- Deployment notes: `docs/aliyun-deployment.md`

## API Slice

- `GET /api/layer-templates`
- `GET /api/layer-templates/{id}`
- `PATCH /api/layer-templates/{id}`
- `POST /api/layer-templates/validate`
- `GET /api/generated-images`
- `POST /api/oss/upload-token`
- `POST /api/oss/signed-url`

## Source Documents

- PRD: `/产品文档/电商视觉自助台_PRD_v0.5.md`
- Task list: `/项目推进/电商视觉自助台_开发任务清单_v0.1.md`
- API contract: `/技术文档/电商视觉自助台_API契约_v0.1.md`
- Migration draft: `/技术文档/电商视觉自助台_RDS_Migration草案_v0.1.sql`
