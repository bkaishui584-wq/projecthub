# ProjectHub

面向大学生的线上项目协作社区。后端使用 Flask、SQLite、原生 JavaScript 和 SSE，不依赖前端框架。

## 本地启动

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```

打开 `http://localhost:8787`。

`.env` 只保存在本机或部署平台，不进入 ZIP、Git 或备份文件。管理员密码必须通过 `ADMIN_PASSWORD` 配置一个长随机值。生产环境缺少该变量时不要启动服务。

## Agent 模型配置

ProjectHub Agent 可以连接兼容 OpenAI Chat Completions 的模型接口，也可以使用本地模型。生产密钥只放在环境变量中。

```ini
PY_LLM_BASE_URL=https://your-model-endpoint.example/v1
PY_LLM_API_KEY=replace-with-a-secret
PY_LLM_MODEL=your-model-name
```

没有配置模型时，Agent 分析接口会安全失败并返回 503，不会伪造研究结论。不要把真实 API Key 写入 README、代码或示例配置。

## 测试

```powershell
python -m py_compile app.py storage.py security.py
python -m unittest discover -s tests -v
node --check static\script.js
node --check static\agent.js
python scripts\backup_projecthub.py --check
```

浏览器发布前至少验证：注册、登录、创建公开和私密项目、审批申请、聊天、撤回、引用、@ 提醒、文件上传与删除、公告已读、项目状态、负责人转移、举报、申诉、退出和重登。

## 数据与备份

默认数据库路径是 `./data/projecthub.sqlite3`。备份脚本使用 `sqlite3.Connection.backup()` 生成一致性副本，不复制 `.env` 或密钥。

```powershell
python scripts\backup_projecthub.py
python scripts\backup_projecthub.py --keep 14
```

备份写入 `./backups`，默认轮换并保留至少 7 份。可以通过环境变量调整路径：

```ini
DATABASE_PATH=./data/projecthub.sqlite3
BACKUP_DIR=./backups
BACKUP_KEEP=14
```

恢复前先停止应用：

```powershell
Copy-Item .\data\projecthub.sqlite3 .\data\projecthub.before-restore.sqlite3
Copy-Item .\backups\projecthub-YYYYMMDD-HHMMSS.sqlite3 .\data\projecthub.sqlite3
python app.py
```

确认健康检查、登录和关键项目数据正常后再删除临时副本。

## 部署

Render 或 Railway 使用持久卷时必须把数据库放在持久卷路径，并配置：

```ini
DATABASE_PATH=/var/data/projecthub.sqlite3
DATA_DIR=/var/data
BACKUP_DIR=/var/data/backups
ADMIN_NICKNAME=白开水
ADMIN_PASSWORD=replace-with-a-long-random-password
PY_LLM_BASE_URL=
PY_LLM_API_KEY=
PY_LLM_MODEL=
```

启动命令：

```bash
gunicorn -c gunicorn.conf.py app:app
```

平台重启、重新部署或实例替换时，临时文件系统会丢失数据。Render 免费实例默认没有持久磁盘，SQLite 会随实例重建丢失；没有挂载持久卷就不要把 SQLite 当作正式生产数据库。当前项目已支持通过 DATABASE_PATH 指向持久卷，后续迁移 PostgreSQL 时保留状态存储边界即可。

## 回滚

1. 停止新版本实例。
2. 恢复最近一次已验证的数据库备份。
3. 切回上一版代码或镜像。
4. 检查 `/api/health`、登录、项目列表、聊天和文件访问。
5. 保留故障现场副本，确认稳定后再清理。

## 上线检查

- `.env` 未进入代码仓库、ZIP、日志或备份。
- `ADMIN_PASSWORD` 使用长随机值，未出现在任何文档。
- HTTPS、反向代理、可信代理和 Session Secret 配置正确。
- SQLite 文件和备份目录位于持久卷。
- 备份自检通过，至少保留 7 份，并实际完成一次恢复演练。
- `python -m unittest discover -s tests -v` 全部通过。
- 普通用户、项目成员、负责人和管理员的越权请求返回 401 或 403。
- 文件上传、聊天、公告、通知、状态转移、举报和申诉流程通过。
- 390px 手机宽度无横向溢出，聊天输入框不被遮挡。
- 用户协议和隐私政策已按实际运营主体完成法律审核。
## 图标资源

界面统一使用 Font Awesome Free 7.3.1，本地资源位于 `static/vendor/fontawesome`，授权文件随包提供。前端不依赖外部图标服务。