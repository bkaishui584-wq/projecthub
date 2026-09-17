# ProjectHub Changelog

## V2 加固版

### Added

- PostgreSQL 状态和文件 Blob 存储层 `storage.js`。
- 旧 JSON 数据首次启动自动迁移。
- `DATABASE_URL`、`DATABASE_SSL`、`DATABASE_POOL_MAX` 配置。
- 自动化测试套件 `test/`。
- 申请取消、申请冷却和申请频率限制。
- 消息编辑和编辑状态显示。
- `npm run db:check` 存储与数据数量检查。
- AI 每日用户/全站预算、Prompt 版本和 AI 状态字段。
- 数据库恢复与迁移文档。

### Changed

- 生产环境不再允许无数据库启动。
- 健康检查会检查存储依赖。
- 上传文件改由统一存储层读写。
- 消息时间改为由标准时间戳在浏览器本地格式化。
- 会话 token 改为哈希后存储。
- 项目负责人不能撤回其他成员的消息。
- Render Blueprint 改为要求独立 PostgreSQL。
- Docker 构建使用 `package-lock.json` 和 `npm ci`。

### Security

- 增加 PostgreSQL revision 乐观锁，修复滚动部署时旧实例覆盖新数据的问题。

- 修复公开话题 AI 私有内容泄露。
- 修复消息撤回越权。
- 增加全站文件容量限制。
- 增加 AI 费用/资源预算。
- 增强 AI Prompt 不可信内容隔离和结构校验。
