# ProjectHub 永久部署指南

> 临时链接（trycloudflare）只在你电脑开机时有效。想要**永久固定网址**，需要把项目部署到云端。
> 本项目是标准 Node.js 应用（零第三方依赖），以下三种方式都可以。

---

## 方式一：Render（最快、免费、网址永久）

**特点**：免费实例网址永久固定；闲置 15 分钟后休眠，下次访问需等待约 30 秒；**data/ 是临时的**，重新部署会清空数据。

1. 注册 https://render.com （用邮箱或 GitHub 登录）
2. 把本项目上传到自己的 GitHub 仓库（新建仓库 → 上传 projecthub-site 目录下的全部文件）
3. Render 控制台 → New → Blueprint → 选择该仓库（会自动读取项目里的 render.yaml）
4. 部署时按提示填写环境变量：ADMIN_PASSWORD 必填（填一个足够长的随机密码，这是管理员登录密码），其余已在 render.yaml 中预设
5. 等待 2–3 分钟，Render 会分配永久网址：https://<你的服务名>.onrender.com
6. 想保留数据：升级为付费实例并在服务设置里挂载磁盘到 /app/data

---

## 方式二：Zeabur / Railway（亚洲访问快、数据可持久、少量费用）

**特点**：支持 Docker 部署；可挂载持久卷，**数据不会丢**；国内访问速度较好。

1. 注册 https://zeabur.com 或 https://railway.com
2. 新建项目 → 从 Git 仓库部署（平台会自动识别项目根目录的 Dockerfile）
3. 添加持久卷（Volume），挂载路径填 /app/data（保证账号与聊天记录不丢）
4. 在平台的环境变量里设置：NODE_ENV=production、TRUST_PROXY=1、ADMIN_PASSWORD=<你的强密码>
5. 部署完成后在平台里绑定域名，即可得到永久网址

---

## 方式三：国内云服务器 + Docker（最稳、国内访问最快）

**特点**：完全自主可控、数据持久、无冷启动；学生机通常每月十几元。

1. 购买一台云服务器（阿里云/腾讯云/华为云学生机即可，1核2G 足够）
2. 安装 Docker 与 Docker Compose
3. 把项目上传到服务器并进入项目目录
4. 在服务器上创建 .env 文件（不要提交到 Git），写入：NODE_ENV=production、TRUST_PROXY=1、ADMIN_PASSWORD=<你的强密码>
5. 执行：docker compose up -d --build
6. 用 Caddy 反向代理并自动签发 HTTPS 证书（配置：your-domain.com { reverse_proxy 127.0.0.1:8787 }）
7. 完成后的 https://your-domain.com 就是永久网址（需要一个域名，几十元/年）

---

## 部署后必做三件事

1. **设置强管理员密码**：通过环境变量 ADMIN_PASSWORD 提供；代码中没有任何默认密码
2. **确认 HTTPS**：云平台一般默认提供；自建服务器请用 Caddy/Nginx 配证书（项目会自动下发 HSTS）
3. **确认数据目录持久化**：把卷挂到 /app/data，否则重新部署会清空账号与聊天记录

## 常见问题

- 为什么不能直接用现在的临时链接？它依赖你本机运行，关机即失效。
- 免费方案数据会丢吗？Render 免费实例会；Zeabur/Railway 挂载卷后不会；自建服务器不会。
- 需要改代码吗？不需要，项目已包含 Dockerfile、render.yaml、package.json，可直接部署。
- AI 功能需要额外配置吗？不配置也能用（内置本地演示模式）；要接真实模型就在平台环境变量加 DEEPSEEK_API_KEY 或 LLM_BASE_URL/LLM_API_KEY/LLM_MODEL。
