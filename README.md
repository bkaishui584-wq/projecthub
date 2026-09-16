# ProjectHub

面向大学生的线上项目协作社区：不出门、不见面，也能按专业方向找到队友，一起做项目。

## 聊天界面功能

- **消息引用**：鼠标移到任意消息上，点「引用」即可带着原文回复
- **消息撤回**：自己发的消息可以撤回（负责人可撤回群内任意消息），撤回后显示「撤回了一条消息」
- **复制消息**：一键复制某条消息内容
- **@ 成员**：点输入框左侧的 @ 按钮，或在输入框里打 @，会弹出成员列表；被 @ 的人会收到专门提醒
- **组内文件**：可上传 Word / jpg / png，上传者和负责人都能删除文件
- **AI 面板可折叠**：默认收成一条状态栏，点「展开」才看到方案草稿、投票和分工，聊天区不再拥挤
- **成员/文件抽屉**：默认收起，点右上角「成员 / 文件」滑出，聊天区域占满主界面
- **消息提醒**：顶部 🔔 会显示未读数量（类似微信），有人发消息、@你、申请加入、上传文件、AI 出新公告都会提醒，点击可直接跳到对应话题

## 功能一览

- 项目负责人：选择项目方向（可多选）→ 选择公开 / 私密 → 注册或登录 → 创建项目
- 项目成员：选择擅长方向 → 游客浏览或注册登录 → 在话题广场搜索并申请加入
- 申请加入需要负责人同意：申请会以「私信」形式出现在负责人的消息中心，可选择「欢迎加入」或「暂不考虑」
- 话题聊天室：支持多人实时聊天（服务器推送 + 轮询兜底）
- 组内文件：成员可以上传 Word 文档和 jpg / png 图片，组内成员都能查看
- 组内氛围：负责人在创建项目时填写，会显示在项目卡片和聊天侧边栏
- 成员标签：项目策划 / 技术成员 / 设计成员 / 文案·材料成员 / 调研成员 / 答辩成员；项目广场会显示当前项目还缺哪些标签
- 成员管理：负责人可以给成员设置标签，也可以把成员移出话题
- 项目编号：每个项目有一个隐藏的独特编号，只有负责人和管理员可见
- 项目名称唯一：重名会提示「该项目已存在」
- 账号系统：注册会记录昵称、年级、注册时间；支持登录、退出
- 管理员：拥有最高权限，可以删除任意项目、封禁 / 解封账号

## 接入 AI 助手（DeepSeek / 其他开源模型）

项目负责人可以在话题聊天界面决定是否引入 AI 助手：AI 不会主动发言，
只有负责人点击「开始思考」后才会工作。它支持：

1. 把组内聊天记录汇总成一份逻辑清晰的方案草稿；
2. 给出若干可发展方向，由成员**匿名投票**，票数最高的方案自动置顶为项目公告
   （成员也可以投「再想想」，该选项票数最高时 AI 静默、大家继续讨论）；
3. 完成 3 轮以上思考后，负责人会看到「就是你啦！！」，点击后 AI 会为每位成员
   分配任务、列出所需理论基础书目，并分别给出完成建议（成员只能看到自己的那一份）。

### 配置模型（可选）

默认情况下不配置任何 Key 也能跑，此时使用内置的「本地演示模式」生成内容。
想接入真实大模型，设置环境变量后再启动服务器即可：

> 说明：能接入的是**模型厂商的 API**，不是 ChatGPT 网页版（chatgpt.com）。
> ChatGPT 网页版/App 没有对外开放的接口，ChatGPT 订阅也不能当作 API 使用。

```powershell
# 方式一：OpenAI 官方 API（api.openai.com，需在 platform.openai.com 申请 API Key）
$env:OPENAI_API_KEY="sk-你的密钥"
$env:OPENAI_MODEL="gpt-5.6"      # 可选，默认 gpt-5.6
node server.js

# 方式二：DeepSeek（推荐，国内可直连）
$env:DEEPSEEK_API_KEY="sk-你的密钥"
node server.js

# 方式三：任意 OpenAI 兼容接口（含 vLLM、One-API、硅基流动、通义千问、智谱 GLM、Kimi 等）
$env:LLM_BASE_URL="https://your-endpoint/v1"
$env:LLM_API_KEY="your-key"
$env:LLM_MODEL="your-model"
node server.js

# 方式四：本地 Ollama
$env:OLLAMA_BASE_URL="http://localhost:11434"
$env:LLM_MODEL="qwen2.5:7b"
node server.js
```

如果需要 AI 联网检索（Google 等公开资料），额外配置：

```powershell
$env:TAVILY_API_KEY="tvly-你的密钥"
```

启动后打开网页，在聊天界面会显示当前使用的模型名称。

## 接入本机开源模型（Qwen / GLM / DeepSeek 开源版）

推荐用 **Ollama** 在本机跑开源中文模型，完全免费、不需要 Key、不联网也能用：

1. 安装 Ollama： https://ollama.com/download
2. 拉取一个开源中文模型（RTX 5060 / 8GB 显存推荐 7B）：

   ```bash
   ollama pull qwen2.5:7b
   # 或者更小的：ollama pull qwen2.5:3b
   ```

3. 启动本项目：

   ```bash
   node server.js
   ```

服务器会自动探测本机这几个端口上的 OpenAI 兼容服务，**无需任何配置**：

| 端口 | 常见运行时 |
| --- | --- |
| 11434 | Ollama |
| 1234 | LM Studio |
| 9997 | Xinference |
| 8080 | llama.cpp server |

探测成功后，网页 AI 面板里的「模型」会显示成实际模型名（例如 qwen2.5:7b）；
如果没检测到，就继续用内置的本地演示模式。

也可以手动指定：

```powershell
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="qwen2.5:7b"
node server.js
```

## 管理员账号

管理员账号在**首次启动**时创建，密码只能通过环境变量提供，代码中**不存在任何默认密码**：

```powershell
$env:ADMIN_NICKNAME="your-admin-name"       # 可选，默认 白开水
$env:ADMIN_PASSWORD="<足够长的随机强密码>"   # 必填：首次初始化或轮换密码时
node server.js
```

- 若系统中还没有管理员账号，且未提供 `ADMIN_PASSWORD`，服务会**明确拒绝启动**；
- 管理员已存在时，启动过程**不会**修改其密码、角色或封禁状态；
- 需要更换密码时执行一次性轮换（会让该账号的旧会话失效）：

```powershell
$env:ADMIN_PASSWORD="<新的强密码>"
node server.js --rotate-admin-password
```

- 出于安全考虑，任何日志都不会输出密码；
- 历史上曾在源码/文档中出现过的密码一律视为**已泄露**，必须更换，不要继续使用。

## 本地运行

需要 Node.js 18 及以上版本。

```bash
node server.js
```

然后打开： http://localhost:8787

端口可通过环境变量修改：

```bash
PORT=3000 node server.js
```

## 数据存储

所有账号、项目、申请、聊天记录和文件元数据都保存在 `data/store.json`，
上传的文件保存在 `data/files/`，服务器重启后数据仍在。删除 `data/` 目录即可清空所有数据。

## 部署到公网（让其他人访问）

这是一个标准的 Node.js 应用，可以部署到任何支持 Node 的平台，例如
Render、Railway、Fly.io、Zeabur、阿里云 / 腾讯云服务器等：

1. 把整个项目上传到代码仓库（GitHub / Gitee 均可）；
2. 在平台上新建 Web Service，启动命令填 `node server.js`；
3. 平台会自动注入 `PORT` 环境变量，无需额外配置；
4. 部署完成后得到的域名，就是其他人可以访问和加入的网址。

> 注意：`data/` 是运行时数据，已经在 `.gitignore` 中忽略。
> 如果需要持久化存储，请在平台上挂载磁盘，或把数据换成数据库。

## 临时公网链接（本机）

双击 `start-public.ps1`，会同时启动本地服务器和 Cloudflare 临时隧道，
并在窗口里打印一个 `trycloudflare.com` 网址。关闭窗口后公网链接失效。

## 目录结构

```
项目根目录
├── index.html            前端页面结构（单页应用）
├── styles.css            前端样式
├── script.js             前端交互：登录注册、广场、申请、聊天、文件、标签、AI 面板、通知
├── server.js             后端：Node 内置模块实现，含账号/权限/项目/消息/文件/通知 API + SSE
├── ai.js                 AI 调用层：本机开源模型自动发现 + DeepSeek / OpenAI / 兼容接口 + 本地回退
├── package.json          项目信息与启动脚本（零第三方依赖）
├── .env.example          环境变量示例（仅占位符，不含真实密钥）
├── Dockerfile            容器镜像构建
├── docker-compose.yml    一键容器部署（数据挂载到 ./data）
├── start-public.ps1      Windows 一键启动本地服务 + 临时公网隧道
├── data/                 运行时数据目录（自动生成，已在 .gitignore 忽略）
├── README.md             说明文档
└── .gitignore / .dockerignore
```

> 说明：本项目是纯 Node.js 实现，**没有 Python 依赖，因此不需要 requirements.txt**。
> 前后端未拆分目录：前端是静态文件（index.html / styles.css / script.js），后端是 server.js + ai.js。

## 环境变量

所有配置都通过环境变量注入，完整示例见 `.env.example`：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口，默认 8787 |
| `ADMIN_NICKNAME` / `ADMIN_PASSWORD` | 管理员昵称与初始密码；密码**必须**由环境变量提供，代码与文档中不含任何默认密码 |
| `ALLOWED_ORIGINS` | 允许跨域的 Origin 白名单（逗号分隔）；留空表示不开放跨域 |
| `TRUST_PROXY` | 置于 Nginx / Cloudflare 之后时设为 `1`，以便限流与审计使用真实 IP |
| `MAX_BODY_BYTES` / `MAX_JSON_*` / `MAX_FILE_BYTES` / `RATE_*` / `MAX_SSE_*` / `MAX_AI_CONCURRENT` | 请求体、JSON 结构、上传、限流、SSE 连接、AI 并发的安全上限（详见 `.env.example`） |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | 本机开源模型（也可不配置，自动探测 11434/1234/9997/8080） |
| `DEEPSEEK_API_KEY` | DeepSeek 官方 API |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI 官方 API（Responses API） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 任意 OpenAI 兼容服务 |
| `TAVILY_API_KEY` | 可选，联网检索 |

## 安全边界（已内置）

服务端已建立可配置的基础安全边界，全部阈值可用环境变量覆盖（见 `.env.example`）：

| 类别 | 机制 |
| --- | --- |
| 请求体 | `MAX_BODY_BYTES` 预检 `Content-Length` + 流式累计上限，超限立即 413 并断开 |
| JSON 结构 | 深度 / 数组长度 / 对象字段数 / 字符串长度上限，非法 JSON 返回 400 |
| 上传 | 扩展名白名单 + Magic Number 真实类型校验 + 单文件大小 + 单项目文件数 + 单用户总容量 + 上传频率限制 |
| 限流 | 登录（IP + 账号失败锁定）、注册、发言、上传、AI、API 总量，均返回 429 与 `Retry-After` |
| 并发 | 全局 + 单 IP 在途请求上限，超出返回 503；AI 单独并发闸门 |
| 超时与回收 | 请求超时、请求体读取超时、SSE 心跳与空闲回收、过期会话与票据定期清理 |
| SSE | 一次性短期票据鉴权 + 全站/单 IP 连接上限 + 按成员定向推送（不再全局广播） |
| AI | 单项目调用频率上限 + 全局并发上限 + 调用超时 + 异常审计 |
| 审计日志 | 登录成败、管理员操作、项目增删、成员变更、文件上传删除、权限拒绝、限流与崩溃均写入 `logs/audit.log`（不含密码与 Token） |

## 安全说明（交付前请知悉）

- 仓库与压缩包中**不包含任何真实密钥**：没有 `.env`，代码只读取环境变量；
- `data/` 目录是运行时数据（账号、密码哈希、聊天记录、上传文件），已在 `.gitignore` 中忽略，**打包时不会带出**；
- 密码使用 Node `crypto.scryptSync` 加盐哈希存储，API 返回的用户对象不含密码字段；
- 管理员账号默认密码写在代码里作为兜底，**上线前请通过 `ADMIN_PASSWORD` 环境变量覆盖**；
- 项目当前不含 HTTPS、邮箱验证、验证码、登录失败锁定等生产能力，如需正式对外请在此基础上加固。

## 目录结构

```
index.html       页面结构
styles.css       样式
script.js        前端交互（登录、申请、聊天、文件、标签、管理后台）
server.js        Node 服务器：账号系统 + 数据 API + 文件上传 + SSE 实时同步
data/store.json  运行时数据（自动生成）
start-public.ps1 一键启动本地服务 + 临时公网链接
```
