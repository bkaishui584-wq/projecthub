# ProjectHub 数据库迁移说明

## 目标

把原先与 Render Web Service 生命周期绑定的 JSON 文件存储迁移到独立 PostgreSQL，确保服务重启、休眠和重新部署不会丢失数据。

## 当前实现

- `storage.js` 提供统一存储接口。
- `STORAGE_DRIVER=auto` 时：有 `DATABASE_URL` 使用 PostgreSQL，没有则使用 JSON 文件。
- 生产环境默认拒绝 JSON 文件存储，除非显式设置 `ALLOW_EPHEMERAL_STORAGE=1`。
- PostgreSQL 使用两张表：
  - `projecthub_state`：保存当前完整状态快照，`id = 1`，字段为 `schema_version` 和 `state jsonb`。
  - `projecthub_file_blobs`：保存上传文件内容，字段为 `key`、`content bytea`、`updated_at`。
- 首次连接空数据库时，自动读取现有 `data/store.json` 并写入 `projecthub_state`。
- 启动时会把 `data/files/` 中仍存在的文件导入 `projecthub_file_blobs`。
- JSON 原文件和原上传目录不会被删除，作为回滚依据保留。

## 生产环境变量

```ini
NODE_ENV=production
STORAGE_DRIVER=auto
DATABASE_URL=postgresql://user:password@host:5432/projecthub
DATABASE_SSL=require
DATABASE_POOL_MAX=5
ADMIN_PASSWORD=<由 Secret 管理>
```

## 推荐迁移方式

在包含旧 `data/` 的项目目录中设置 `DATABASE_URL`，然后运行：

```bash
npm run db:migrate
```

该命令只会在云端状态表为空时导入旧数据，不会删除本机 `data/`。
如果新服务已先启动并只创建了管理员账号，可执行 `npm run db:import-local`：它会保留云端新管理员，合并本机用户、项目、消息和申请；发现远程已有项目内容时会拒绝覆盖。

## 迁移前步骤

1. 停止旧实例写入，或临时进入维护模式。
2. 备份 `data/store.json`、`data/store.json.bak`、`data/backups/` 和 `data/files/`。
3. 记录当前用户数、话题数、消息数、申请数、通知数和文件数。
4. 创建独立 PostgreSQL，授予应用账号建表和读写权限。
5. 在测试环境先用副本执行迁移，确认数量和内容。
6. 再配置生产 `DATABASE_URL` 并启动新实例。

## 回滚步骤

1. 保留旧 Web Service 配置和旧 `data/` 目录。
2. 若迁移验证失败，把 `STORAGE_DRIVER=file`、`ALLOW_EPHEMERAL_STORAGE=1` 临时设置回旧实例，继续使用旧 JSON 数据。
3. 不要删除 PostgreSQL 中的 `projecthub_state`，先保留现场。
4. 修复迁移问题后重新执行一次验证。

## 迁移后检查

```bash
npm run db:check
```

输出应显示 `ok: true`、`persistent: true`，且用户、话题、消息、申请和文件数量与迁移前一致。

## 验收条件

- 创建用户、项目、消息、申请、通知和文件。
- 重启服务并模拟新实例启动。
- 用户、项目、消息、申请和通知数量完全一致。
- 文件下载内容和上传时一致。
- 迁移前后管理员可以正常登录。
- 完成一次从 PostgreSQL 备份恢复到新数据库的演练。
