# ProjectHub 永久部署指南

> 临时链接（trycloudflare）只在你电脑开机时有效。想要永久固定网址，需要把项目部署到云端。

---

## 生产部署前提

- Node.js 18 以上。
- 独立 PostgreSQL 数据库。
- `ADMIN_PASSWORD` 通过平台 Secret 设置。
- 不要把 `.env`、API Key、Token 或管理员密码提交到 Git。

生产环境如果只有 Render 临时文件系统而没有 `DATABASE_URL`，服务会拒绝启动，这是为了避免重新部署时静默丢失全部数据。

---

## 方式一：Render（推荐）

1. 注册 https://render.com 并登录。
2. 把项目上传到 GitHub/Gitee 仓库。
3. Render 控制台 → New → Blueprint → 选择该仓库。
4. 创建或关联独立 PostgreSQL，复制连接串到 `DATABASE_URL`。
5. 在本地先执行旧数据迁移（需要从本机包含旧 `data/` 的目录运行）：

```powershell
$env:NODE_ENV="production"
$env:STORAGE_DRIVER="auto"
$env:DATABASE_URL="postgresql://..."
$env:DATABASE_SSL="require"
npm run db:migrate
npm run db:check
```
6. 设置 `ADMIN_PASSWORD` 为新的强随机密码。
7. 部署完成后访问 `/api/health`，确认健康检查通过。
8. 创建测试用户、项目、消息和文件，然后重新部署一次，确认数据仍然存在。

不要用 Web Service 的临时磁盘代替数据库。`render.yaml` 已要求 `DATABASE_URL`。

---

## 方式二：Zeabur / Railway

1. 创建项目并从 Git 仓库部署。
2. 添加 PostgreSQL，平台会提供 `DATABASE_URL`。
3. 设置环境变量：
   - `NODE_ENV=production`
   - `TRUST_PROXY=1`
   - `STORAGE_DRIVER=auto`
   - `DATABASE_URL=<平台提供的连接串>`
   - `DATABASE_SSL=require`（按平台要求调整）
   - `ADMIN_PASSWORD=<新的强随机密码>`
4. 部署后执行健康检查和重启持久化测试。

---

## 方式三：国内云服务器 + Docker

1. 准备云服务器，安装 Docker 与 Docker Compose。
2. 准备 PostgreSQL，创建 `projecthub` 数据库和独立应用账号。
3. 在服务器创建 `.env`，设置数据库连接和管理员 Secret，不要提交到 Git。
4. 执行：

```bash
docker compose up -d --build
```

5. 用 Caddy/Nginx 反向代理并配置 HTTPS。
6. 验证数据库连接、备份和恢复流程。

---

## 部署后检查

1. `/api/health` 返回 200。
2. 管理员用轮换后的新密码登录。
3. 旧密码不能登录。
4. 创建用户、项目、消息、申请和文件。
5. 重启或重新部署 Web Service。
6. 验证上述数据全部还在。
7. 验证普通用户无法访问管理员 API。
8. 验证消息作者以外的人不能撤回消息。

## 环境变量重点

| 变量 | 作用 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串，生产必填 |
| `DATABASE_SSL` | `require` / `verify-full` / `disable` |
| `STORAGE_DRIVER` | `auto`、`postgres` 或仅开发使用的 `file` |
| `ADMIN_PASSWORD` | 首次初始化或显式轮换管理员密码 |
| `ALLOWED_ORIGINS` | 跨域白名单，同源部署留空 |
| `AI_DAILY_USER` / `AI_DAILY_GLOBAL` | AI 预算保护 |

## 常见问题

- 免费方案数据会丢吗？如果使用平台临时磁盘会丢；正确配置 PostgreSQL 后不会。
- 重启后为什么服务拒绝启动？生产环境未配置 `DATABASE_URL`，这是防止静默数据丢失的保护。
- AI 需要额外配置吗？不配置可使用本地演示模式；需要真实模型时配置 DeepSeek 或 OpenAI-compatible endpoint。
- 上传文件在哪？PostgreSQL 模式下保存在 `projecthub_file_blobs`，不会只依赖临时文件系统。
