# 电商视觉自助工作台 V2 (ecommerce-visual-self-service-v2)

面向电商运营与设计协作的图片生成/改版工作台。

## 技术栈

- Next.js 16 (App Router, standalone output)
- React 19 + TypeScript
- Tailwind 4 + ShadCN UI + 原生 CSS 变量
- PostgreSQL (Prisma) + 火山引擎 TOS
- 生图模型：火山方舟 Seedream 5.0 Pro
- 飞书 OAuth 登录（`contact:user.base:readonly`）

## 角色与权限

| 角色 | 默认入口 | 能力 |
| --- | --- | --- |
| operator | `/operator` | 运营工作台：生图/改图、图库（自己+公开）、批量管理 |
| designer | `/designer` | 设计师工作台（待完善） |
| admin | `/operator` | 全功能：可查看/删除/改可见性/打标签任意图片、批量操作 |

账密兜底（仅本地/兜底，登录页已隐藏入口）：
- `operator@shop.local / operator123`
- `designer@shop.local / designer123`
- `admin@shop.local / admin123`

## 常用脚本

```bash
npm run dev         # 本地开发
npm run build       # 生产构建（输出 .next/standalone）
npm run typecheck   # tsc --noEmit
npm run db:generate # prisma generate
npm run db:migrate  # 开发环境迁移
```

## 部署（ECS）

在 ECS release 目录：

```bash
npm ci
npx prisma generate
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/ 2>/dev/null || true
pm2 delete evss-web; pm2 start ecosystem.config.js --only evss-web
```

环境变量见 `.env.example`。

## 目录结构

```
src/
  app/                # Next.js App Router
    api/              # 路由处理（auth/assets/generation/layer-templates/image-crop）
    operator/         # 运营工作台
    designer/         # 设计师工作台
    admin/            # 管理后台（占位）
    login/            # 飞书 OAuth 登录
  components/         # React 组件（含 ui/ 基础组件）
  lib/
    auth/             # JWT、飞书 OAuth、API 鉴权
    db/               # Prisma 客户端
    providers/        # 生图模型（seedream / openai / mock）
    render/           # 图层合成引擎
    tos/              # TOS 客户端
    worker/           # 异步任务 worker
    types/            # 共享类型
  middleware.ts       # 路由级权限校验
  scripts/worker.ts   # worker 入口
prisma/               # schema / migrations / seed
```

## 标签系统

- 标签存储在 `assets.metadata_json.tags: string[]`（无需 schema 迁移）
- 图库支持标签 chip 筛选、搜索框同时匹配文件名/标签、批量加/删标签
- API：`POST /api/assets/batch`，action: `delete | set_visibility | add_tags | remove_tags`
