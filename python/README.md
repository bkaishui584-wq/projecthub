# ProjectHub Python

Python/Flask version of the ProjectHub backend. The browser frontend is unchanged and is served from `static/`.

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Open `http://localhost:8787`.

Data is stored in SQLite (`data/projecthub.sqlite3`) with transactional state saves and revision-based stale-write protection. Uploaded files are stored as blobs in the same SQLite database.

Production:

```bash
gunicorn -c gunicorn.conf.py app:app
```

AI can use any OpenAI-compatible endpoint:

```ini
PY_LLM_BASE_URL=https://api.deepseek.com/v1
PY_LLM_API_KEY=...
PY_LLM_MODEL=deepseek-chat
PY_LLM_LABEL=DeepSeek
PY_LLM_JSON_MODE=1
```

If no model is configured, the built-in deterministic local fallback is used.

## Render 部署

Render 使用 Docker 时，服务会自动读取平台分配的 `PORT`。建议配置：

```ini
ADMIN_NICKNAME=白开水
ADMIN_PASSWORD=<从安全环境变量提供>
DATA_DIR=/app/data
TRUST_PROXY=1
```

免费实例的本地磁盘是临时的，重新部署或实例重建后 SQLite 数据可能丢失。长期生产使用需要持久磁盘，或把存储层迁移到 PostgreSQL。
