# Aliyun Deployment Notes

## Target Shape

- ECS runs the Next.js app behind Nginx or a managed load balancer.
- RDS MySQL stores templates, tags, reference images, generated image metadata, and generation jobs.
- OSS stores original uploads, template base assets, generated candidates, thumbnails, and export images.

## Required Environment Variables

```bash
NEXT_PUBLIC_APP_NAME="电商视觉自助台"
DATABASE_URL="mysql://user:password@rds-host:3306/ecommerce_visual"
TEMPLATE_REPOSITORY_MODE="rds"
OSS_REGION="oss-cn-hangzhou"
OSS_BUCKET="ecommerce-visual-assets"
OSS_PUBLIC_BASE_URL="https://ecommerce-visual-assets.oss-cn-hangzhou.aliyuncs.com"
OSS_UPLOAD_TOKEN_MODE="aliyun"
OSS_ACCESS_KEY_ID=""
OSS_ACCESS_KEY_SECRET=""
```

## Adapter Boundary

- `lib/oss.ts` owns upload-token and signed-url generation. It returns mock URLs in local development.
- `lib/repositories/templates.ts` owns template persistence and switches between mock and RDS by `TEMPLATE_REPOSITORY_MODE`.
- `lib/repositories/rds-templates.ts` maps `layer_templates` rows to the domain `LayerTemplate` contract.
- `generated_images` is prepared in `db/001_initial_schema.sql` for the history gallery.
- API routes should use these adapters rather than touching OSS/RDS directly.

## RDS Repository Mode

Local development defaults to `TEMPLATE_REPOSITORY_MODE="mock"`. ECS can switch to `rds` after dependencies are installed and `DATABASE_URL` is configured.

```bash
npm install
TEMPLATE_REPOSITORY_MODE="rds" npm run start
```

The RDS implementation currently covers:

- `GET /api/layer-templates`
- `GET /api/layer-templates/{id}`
- `PATCH /api/layer-templates/{id}`

Prompt templates still use the mock repository in this slice.

## First ECS Bring-up Checklist

1. Create RDS database and run `db/001_initial_schema.sql`.
2. Create OSS bucket and configure lifecycle policy for generated candidates.
3. Fill `.env` from the variables above.
4. Run `npm install`, `npm run typecheck`, and `npm run build` on ECS local disk.
5. Set `TEMPLATE_REPOSITORY_MODE="rds"`.
6. Start with `npm run start` or a process manager.
