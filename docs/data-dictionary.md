# 数据字典

## Asset 资产

| 业务字段 | API 字段 | 数据库字段 | 类型/约束 | 来源与默认值 | 生命周期与说明 |
|---|---|---|---|---|---|
| 资产 ID | `id` | `assets.id` | string, PK | `cuid()` | 永久唯一；重名和重复图片仍使用不同 ID。 |
| 资产类型 | `type` | `assets.type` | enum `AssetType` | 上传请求；本期批量上传为 `product_image` 或 `template_material` | 创建后本期不可编辑。`template_material` 是普通电商模板图，不是 `LayerTemplate`。 |
| 展示名称 | `display_name` | `assets.display_name` | string, 1-100 字符，trim 后非空 | 上传时由 `filename` 去掉最后一个扩展名；旧数据迁移回填 | 可编辑、允许重复；列表展示和主要名称搜索使用。 |
| 原始文件名 | `filename` | `assets.filename` | string, 非空 | 浏览器上传文件的 `File.name` | 创建后不可编辑；包含扩展名，用于追溯和兼容旧调用方。 |
| MIME | `mime_type` | `assets.mime_type` | enum-like string | 文件 MIME | 允许 jpeg/png/webp。 |
| 文件大小 | `size_bytes` | `assets.size_bytes` | bigint，<=20MB | 服务端实际 buffer 长度 | API 转安全 number 返回。 |
| 宽高 | `width`,`height` | 同名 | int，可空；上传图片实际必须 >=200 | 服务端解析图片 | 生成资产路径也应记录实际尺寸。 |
| 校验摘要 | `checksum` | `assets.checksum` | `sha256:<hex>` | 文件内容 | 用于完整性与追溯；本期不用于自动去重。 |
| 可见性 | `visibility` | `assets.visibility` | `private`/`public` | 默认 `private` | 所有者/管理员可修改，不改变所有者。 |
| TOS bucket | 不默认暴露 | `assets.tos_bucket` | string | 服务端环境 | 存储定位，不随改名变化。 |
| TOS key | 不默认暴露 | `assets.tos_key` | string, indexed with bucket | `buildTosKey(owner_id, filename)` | 存储定位，不随改名变化。 |
| 所有者 | `owner_id` | `assets.owner_id` | FK users.id | 当前登录用户 | 上传后本期不可转移。 |
| 标签 | `tags` | `assets.metadata_json.tags` | string[] | 默认空数组 | 由批量标签接口维护。 |
| 软删除 | 不默认暴露 | `deleted_at`,`deleted_by` | datetime/string? | 默认 null | 删除后列表与详情不可见，TOS 对象本期不物理删除。 |
| 创建/更新 | `created_at`,`updated_at` | 同名 | datetime | DB 自动 | 改名会更新 `updated_at`。 |

### 展示名称派生规则

以完整原始文件名为输入，只移除最后一个扩展名：

| 原始文件名 | 默认展示名称 |
|---|---|
| `coffee.jpg` | `coffee` |
| `coffee.hero.v2.png` | `coffee.hero.v2` |
| `.product` | `.product` |
| `image` | `image` |

若派生结果 trim 后为空，回退为原始文件名 trim 后的值；服务端仍执行 1 至 100 字符校验。超长默认名截断为前 100 个字符，不改变 `filename`。

### 数据库变更与迁移

1. 增加 `display_name String?`，先允许为空以兼容滚动部署。
2. 按上述派生规则批量回填所有未删除和已删除资产，保证历史追溯一致。
3. 新上传代码同时写入 `filename` 与 `display_name`。
4. 列表/详情响应使用 `display_name ?? derive(filename)`，避免迁移窗口返回空名称。
5. 确认无空值后改为 `display_name String` 非空。
6. 不重写 `filename`、`tos_key`、checksum 或历史 JSON 快照。

不建立 `display_name` 唯一索引。首期搜索量较小时沿现有查询实现；若改为数据库搜索，建议普通 B-tree 不能替代不区分大小写的包含查询，应根据 PostgreSQL 实际查询方案评估 `pg_trgm` 索引。

## 上传队列（客户端临时对象）

该对象不入数据库。

| 字段 | 类型 | 约束/说明 |
|---|---|---|
| `client_id` | string | 客户端生成，队列内唯一。 |
| `file` | File | 原始文件对象。 |
| `asset_type` | `product_image`/`template_material` | 整批一致。 |
| `default_display_name` | string | 按派生规则生成，用于预览和同批重名提示。 |
| `status` | `waiting`/`validating`/`uploading`/`succeeded`/`failed`/`canceled` | 队列状态。 |
| `progress` | number? | 0-100；底层无法提供真实上传进度时用不定进度，不伪造百分比。 |
| `asset_id` | string? | 成功后由上传响应写入。 |
| `error_code` | string? | 服务端或客户端稳定错误码。 |
| `error_message` | string? | 面向用户的单文件错误。 |
| `attempt` | number | 初始 0，每次实际请求递增。 |

## AuditLog 映射

| 操作 | `action` | `target_type` | `detail_json` |
|---|---|---|---|
| 单图改名 | `asset_display_name_changed` | `asset` | `{ "from": string, "to": string, "filename": string }` |
| 单图可见性 | `asset_visibility_changed` | `asset` | `{ "from": visibility, "to": visibility }` |
| 上传 | 建议新增 `asset_uploaded` | `asset` | `{ "type": AssetType, "filename": string, "display_name": string, "size_bytes": number }` |

审计公共字段由服务端写入：`actor_user_id`、`target_id`、`created_at`，可用时记录 `ip` 和 `user_agent`。审计写入失败不应回滚已经成功的资产修改，但必须进入服务端错误日志和监控。
