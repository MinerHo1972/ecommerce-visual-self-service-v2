# Assets API

## 通用约定

- 所有接口要求有效登录态。
- 素材管理对 `operator` 和 `designer` 使用相同 API 与权限规则。
- 读权限：所有者、管理员或公开资产。
- 写权限：仅所有者或管理员。
- 成功响应使用 `{ "data": ... }`；失败响应使用 `{ "error": { "code": string, "message": string, ... } }`。
- `display_name` 是展示名称，`filename` 永远是原始文件名。调用方不得用 `filename` 承载改名结果。

## POST /api/assets/upload

上传单张图片。批量体验由客户端队列以最大并发 3 多次调用本接口实现，服务端不新增一次接收 50 个文件的接口。

### 请求

`multipart/form-data`

| 字段 | 必填 | 说明 |
|---|---|---|
| `file` | 是 | jpeg/png/webp，<=20MB，尺寸 >=200x200。 |
| `type` | 是 | 本期 UI 发送 `product_image` 或 `template_material`；接口继续兼容既有 `reference_image`。 |

`display_name` 不由客户端上传，服务端从原始文件名派生，确保不同调用方规则一致。

### 201 响应

```json
{
  "data": {
    "id": "asset_id",
    "type": "product_image",
    "display_name": "coffee.hero",
    "filename": "coffee.hero.png",
    "mime_type": "image/png",
    "size_bytes": 123456,
    "width": 800,
    "height": 800,
    "checksum": "sha256:...",
    "visibility": "private",
    "owner_id": "user_id",
    "created_at": "2026-08-04T00:00:00.000Z"
  }
}
```

### 失败与重试

| HTTP | code | 含义 | 客户端策略 |
|---|---|---|---|
| 400 | `INVALID_INPUT` | 缺文件、类型、MIME、大小或尺寸不合法 | 不自动重试；显示文件级原因。 |
| 401 | `UNAUTHORIZED` | 未登录或 token 无效 | 暂停队列并要求重新登录。 |
| 413 | `PAYLOAD_TOO_LARGE` | 代理层拒绝超大请求（若发生） | 不重试。 |
| 500 | `INTERNAL_ERROR` | 存储或数据库异常 | 允许用户单独重试。 |

本接口当前没有客户端幂等键。客户端不得在请求结果未知时自动无限重试，因为服务端可能已完成落库但响应丢失。首期仅由用户显式重试；由此产生的重复资产符合“不自动去重”的业务规则。取消请求也不等价于服务端回滚。

## GET /api/assets

### 查询参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `page` | 1 | >=1。 |
| `pageSize` | 20 | 1-100。统一使用 camelCase；修正现有设计师调用的 `page_size`。 |
| `scope` | 默认可见范围 | `mine`、`public`、`private`；`all` 仅 admin 真正表示全部。 |
| `type` | 空 | `AssetType`。 |
| `visibility` | 空 | `public`/`private`。 |
| `q` | 空 | 新增；搜索 `display_name`、`filename` 和标签。 |

非管理员默认范围为“我的全部 + 他人的公开资产”。

### 列表项

迁移期同时返回：`id`、`type`、`display_name`、`filename`、`width`、`height`、`visibility`、`owner_id`、`owner`、`is_mine`、`tags`、`created_at`。

兼容规则：

- 服务端 `display_name` 为空时返回从 `filename` 派生的 fallback。
- 保留 `filename` 字段和原始语义，旧调用方不会字段缺失。
- 新 UI 一律显示 `display_name`；追溯视图可显示 `filename`。

## GET /api/assets/{id}

返回资产详情。字段包含列表项以及 `mime_type`、`size_bytes`、`checksum`、`metadata_json`。不得默认返回 TOS 密钥信息。

| HTTP | code | 含义 |
|---|---|---|
| 403 | `FORBIDDEN` | 非所有者/管理员访问私有资产。 |
| 404 | `NOT_FOUND` | 资产不存在或已软删除。 |

## PATCH /api/assets/{id}

增量修改单个资产。支持 `display_name` 和 `visibility`，至少提供一个字段；未提供的字段保持不变。

### 请求

```json
{
  "display_name": "夏季拿铁主图",
  "visibility": "public"
}
```

### 校验

- `display_name`：必须是 string，trim 后 1-100 字符；允许重复。
- `visibility`：`public` 或 `private`。
- 出现未知字段返回 400，避免客户端误以为字段已生效。
- 同时修改两个字段时，在单个数据库事务中完成；任一字段无效则均不修改。
- 仅所有者和管理员可调用，与资产是否公开无关。

### 200 响应

```json
{
  "data": {
    "id": "asset_id",
    "display_name": "夏季拿铁主图",
    "filename": "coffee-2026.png",
    "visibility": "public",
    "updated_at": "2026-08-04T00:00:00.000Z"
  }
}
```

### 错误

| HTTP | code | 含义 |
|---|---|---|
| 400 | `INVALID_INPUT` | 空请求、未知字段、名称为空/超长或可见性非法。 |
| 401 | `UNAUTHORIZED` | 未登录。 |
| 403 | `FORBIDDEN` | 不是所有者或管理员。 |
| 404 | `NOT_FOUND` | 资产不存在或已删除。 |
| 500 | `INTERNAL_ERROR` | 更新失败。 |

成功改名写审计 `asset_display_name_changed`，记录操作者、时间、改名前后名称及原始文件名。只修改可见性沿用 `asset_visibility_changed`；同时修改时分别记录两条审计，便于按动作查询。

## POST /api/assets/batch

沿用既有批量管理接口，支持 `delete`、`set_visibility`、`add_tags`、`remove_tags`，单次最多 200 个资产 ID。

- 本接口不用于上传，也不新增 `rename`。
- 任一已找到目标资产越权时整批 403，不做部分修改。
- 不存在或已删除的 ID 放入 `missing`；其余合法资产执行操作。
- 上传完成后，客户端使用成功响应中的资产 ID 进入批量选择，再调用本接口设置可见性和标签。

## DELETE /api/assets/{id}

仅所有者或管理员可软删除。删除数据库可见性但不物理删除 TOS 对象，保持既有行为。

## 预览与签名 URL 权限修正

`GET /api/assets/{id}/preview` 与 `GET /api/assets/{id}/signed-url` 必须统一执行“所有者、管理员或公开资产”检查。当前 preview 路由仅依赖登录态，属于既有越权读取风险，应作为本需求实现前的 P0 修复并补权限矩阵测试。

## 批量上传客户端调度伪协议

1. 队列最多接收 50 项并统一资产类型。
2. 客户端预校验后，从 `waiting` 中取最多 3 项并发调用单图上传。
3. 每个响应独立写入队列项的 `asset_id` 或错误。
4. 401 暂停启动新请求；其他失败不阻塞队列。
5. 用户重试只重置指定失败/取消项，不重复上传已成功项。
6. 完成时收集所有 `succeeded.asset_id`，刷新列表并自动选中。

这套调度是 UI 行为，不改变服务端单图接口的事务边界。
