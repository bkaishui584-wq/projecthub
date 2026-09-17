/* ProjectHub 多人协作服务器
 * 除 PostgreSQL 驱动 pg 外，仅使用 Node 内置模块。提供静态页面 + 账号系统 + 共享数据 API + SSE 实时同步。
 * 启动：node server.js   默认端口 8787（可用环境变量 PORT 覆盖）
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

/* 读取项目根目录的 .env（可选）：仅填充尚未设置的环境变量。
 * 这样 ADMIN_PASSWORD 等敏感配置只保存在 .env（已在 .gitignore 中忽略），
 * 源码与示例配置中不存在任何默认密码。 */
(function loadDotEnv() {
  try {
    const file = path.join(__dirname, ".env");
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
      const text = line.trim();
      if (!text || text.charAt(0) === "#") return;
      const idx = text.indexOf("=");
      if (idx < 0) return;
      const key = text.slice(0, idx).trim();
      let value = text.slice(idx + 1).trim();
      if (value.length >= 2 && ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') || (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
  } catch (e) { /* .env 是可选文件 */ }
})();

const crypto = require("crypto");
const AI = require("./ai");
const SEC = require("./security");
const STORAGE = require("./storage");

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const LOG_DIR = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.join(ROOT, "logs");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PORT = process.env.PORT || 8787;
const ALLOWED_FILE_EXT = [".doc", ".docx", ".jpg", ".jpeg", ".png"];
const EXT_FAMILY = { ".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".docx": "zip", ".doc": "ole" };
/* 通过 Magic Number 判断真实文件类型，防止改扩展名伪装 */
function sniffFile(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return "jpg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) return "zip";
  if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) return "ole";
  return null;
}
const ROLE_TAGS = ["项目策划", "技术成员", "设计成员", "文案/材料成员", "调研成员", "答辩成员"];
const MAJOR_IDS = ["m1","m2","m3","m4","m5","m6","m7","m8","m9","m10","m11","m12","m13","m14","m15","m16","m17","m18","m19","m20","m21","m22","m23","m24","m25","m26","m27","m28"];
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const WEAK_PASSWORDS = ["1234567890","12345678","123456789","password","password1","qwerty123","abc123456","1111111111","0000000000","admin12345","iloveyou123","a123456789"];
function validatePasswordPolicy(pw) {
  if (typeof pw !== "string" || !pw) return "请填写密码";
  if (pw.length < PASSWORD_MIN) return "密码至少需要 " + PASSWORD_MIN + " 位";
  if (pw.length > PASSWORD_MAX) return "密码不能超过 " + PASSWORD_MAX + " 位";
  if (WEAK_PASSWORDS.indexOf(pw.toLowerCase()) >= 0) return "密码过于简单，请更换";
  if (/^(.)\1+$/.test(pw)) return "密码不能是重复字符";
  return null;
}

/* 管理员账号：昵称可配置；密码只来自环境变量，代码中不存在任何默认密码 */
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const ADMIN_NICKNAME = process.env.ADMIN_NICKNAME || "白开水";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

function emptyDb() {
  return { users: {}, sessions: {}, topics: [], messages: {}, applications: [], files: {}, notifications: {}, reports: [] };
}

function normalizeDb(parsed) {
  const base = emptyDb();
  const src = parsed && typeof parsed === "object" ? parsed : {};
  return {
    users: src.users || base.users,
    sessions: src.sessions || base.sessions,
    topics: Array.isArray(src.topics) ? src.topics : base.topics,
    messages: src.messages || base.messages,
    applications: Array.isArray(src.applications) ? src.applications : base.applications,
    files: src.files || base.files,
    notifications: src.notifications || base.notifications,
    reports: Array.isArray(src.reports) ? src.reports : base.reports
  };
}

let db = emptyDb();
let storage = null;
let storageReady = false;

/* ---- 基础安全边界实例 ---- */
const audit = SEC.createAudit(path.join(LOG_DIR, "audit.log"));
const rateLimiter = new SEC.RateLimiter();
const inflight = new SEC.Inflight(SEC.LIMITS.maxInflightGlobal, SEC.LIMITS.maxInflightPerIp);
const aiInflight = new SEC.Inflight(SEC.LIMITS.maxAiConcurrent, 1);
const sseHub = new SEC.SseHub(SEC.LIMITS.maxSseTotal, SEC.LIMITS.maxSsePerIp);
const sseTickets = new Map();          // ticket -> { userId, expiresAt }
const loginFailures = new Map();       // 账号维度失败计数 -> { count, until }

let saveTimer = null;
let saveChain = Promise.resolve();
let lastSaveError = null;

function snapshotDb() {
  return JSON.parse(JSON.stringify(db));
}

function enqueueSave() {
  if (!storageReady || !storage) return Promise.reject(new Error("持久化存储尚未初始化"));
  const snapshot = snapshotDb();
  const operation = saveChain.then(async () => {
    await storage.saveState(snapshot);
    lastSaveError = null;
  });
  const settled = operation.catch((e) => {
    lastSaveError = e;
    console.error("[STORAGE] 保存失败：" + (e && e.message));
  });
  saveChain = settled;
  return operation;
}

function saveDb() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  return enqueueSave();
}

/* 高频写入合并：300ms 内的多次变更合并为一次持久化。 */
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    enqueueSave().catch(() => {});
  }, 300);
  if (saveTimer.unref) saveTimer.unref();
}

async function flushDb() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; enqueueSave().catch(() => {}); }
  await saveChain;
  if (lastSaveError) throw lastSaveError;
}

/* ---------- 密码与登录 ---------- */
function makeSalt() { return crypto.randomBytes(16).toString("hex"); }
function hashPassword(password, salt) { return crypto.scryptSync(String(password), salt, 64).toString("hex"); }
function verifyPassword(user, password) {
  try {
    const h = hashPassword(password, user.salt);
    const a = Buffer.from(h, "hex");
    const b = Buffer.from(user.hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;   // 7 天
const MAX_SESSIONS_PER_USER = 20;
/* ---------- 私密话题密码：加盐哈希存储 + 旧数据迁移 ---------- */
function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function setTopicPassword(topic, plain) {
  topic.passwordSalt = makeSalt();
  topic.passwordHash = hashPassword(plain, topic.passwordSalt);
  delete topic.password;
}
function verifyTopicPassword(topic, plain) {
  if (typeof plain !== "string" || !/^[0-9]{6}$/.test(plain)) return false;
  if (topic.passwordHash && topic.passwordSalt) {
    return safeEqualStr(hashPassword(plain, topic.passwordSalt), topic.passwordHash);
  }
  if (typeof topic.password === "string" && topic.password) {
    const ok = safeEqualStr(plain, topic.password);
    if (ok) { setTopicPassword(topic, plain); scheduleSave(); }   // 惰性升级为哈希
    return ok;
  }
  return false;
}
/* 启动时一次性迁移：把历史明文密码改为哈希（密码本身不变，用户无感） */
async function migrateSessionTokens() {
  let changed = false;
  const next = {};
  Object.keys(db.sessions).forEach((key) => {
    const session = db.sessions[key];
    if (!session || typeof session !== "object") return;
    if (session.hashed) {
      next[key] = session;
    } else {
      next[sessionKey(key)] = Object.assign({}, session, { hashed: true });
      changed = true;
    }
  });
  db.sessions = next;
  if (changed) await saveDb();
  return changed;
}

async function migrateTopicPasswords() {
  let count = 0;
  db.topics.forEach((t) => {
    if (typeof t.password === "string" && t.password && !t.passwordHash) {
      setTopicPassword(t, t.password);
      count += 1;
    }
  });
  if (count > 0) {
    await saveDb();
    audit.log("topic_password_migrated", { detail: String(count), result: "ok" });
  }
  return count;
}

function sessionKey(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }

function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  db.sessions[sessionKey(token)] = { userId: userId, createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_TTL_MS, hashed: true };
  const mine = Object.keys(db.sessions).filter((t) => db.sessions[t].userId === userId);
  if (mine.length > MAX_SESSIONS_PER_USER) {
    mine.sort((a, b) => (db.sessions[a].createdAt || 0) - (db.sessions[b].createdAt || 0));
    mine.slice(0, mine.length - MAX_SESSIONS_PER_USER).forEach((t) => { delete db.sessions[t]; });
  }
  return token;
}
function userByToken(token) {
  if (!token) return null;
  const key = sessionKey(token);
  const sess = db.sessions[key];
  if (!sess) return null;
  if (sess.expiresAt && Date.now() > sess.expiresAt) { delete db.sessions[key]; return null; }
  sess.lastSeenAt = Date.now();
  return db.users[sess.userId] || null;
}
/* 认证来源：① Authorization: Bearer（API 客户端）② HttpOnly Cookie（浏览器）。
   URL 查询参数传 Token 的方式已彻底移除。 */
const SESSION_COOKIE = "ph_session";
const CSRF_COOKIE = "ph_csrf";

function parseCookies(req) {
  const out = {};
  const header = String(req.headers["cookie"] || "");
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) { try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; } }
  });
  return out;
}
function authToken(req) {
  const header = String(req.headers["authorization"] || "");
  if (header.indexOf("Bearer ") === 0) return { token: header.slice(7).trim(), via: "bearer" };
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE]) return { token: cookies[SESSION_COOKIE], via: "cookie" };
  return { token: "", via: "" };
}
function authUser(req) {
  const info = authToken(req);
  return info.token ? userByToken(info.token) : null;
}
function authVia(req) { return authToken(req).via; }
function issueCsrfToken() { return crypto.randomBytes(24).toString("hex"); }
function setSessionCookies(req, res, token, csrf) {
  const secure = SEC.isSecureRequest(req) ? "; Secure" : "";
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader("Set-Cookie", [
    SESSION_COOKIE + "=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + maxAge + secure,
    CSRF_COOKIE + "=" + csrf + "; SameSite=Lax; Path=/; Max-Age=" + maxAge + secure
  ]);
}
function clearSessionCookies(res) {
  res.setHeader("Set-Cookie", [
    SESSION_COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    CSRF_COOKIE + "=; SameSite=Lax; Path=/; Max-Age=0"
  ]);
}
/* SSE 专用：一次性、短期票据（不属于会话凭据） */
function issueSseTicket(userId) {
  const ticket = crypto.randomBytes(24).toString("hex");
  sseTickets.set(ticket, { userId: userId, expiresAt: Date.now() + SEC.LIMITS.sseTicketTtlMs });
  return ticket;
}
function consumeSseTicket(ticket) {
  if (!ticket) return null;
  const t = sseTickets.get(ticket);
  if (!t) return null;
  sseTickets.delete(ticket);
  if (Date.now() > t.expiresAt) return null;
  return t.userId;
}
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, nickname: u.nickname, grade: u.grade, role: u.role, banned: !!u.banned, createdAt: u.createdAt, directions: Array.isArray(u.directions) ? u.directions : [] };
}
function createUser(nickname, password, grade, role, directions) {
  const salt = makeSalt();
  const user = {
    id: newId("u"),
    nickname: nickname,
    nicknameLower: nickname.toLowerCase(),
    grade: grade || "",
    salt: salt,
    hash: hashPassword(password, salt),
    role: role || "user",
    banned: false,
    directions: Array.isArray(directions) ? directions.slice(0, 5) : [],
    createdAt: Date.now()
  };
  db.users[user.id] = user;
  return user;
}
function findUserByNickname(nickname) {
  const key = String(nickname || "").trim().toLowerCase();
  return Object.keys(db.users).map((k) => db.users[k]).find((u) => u.nicknameLower === key) || null;
}
/* 管理员初始化：
 * - 不存在管理员时：必须提供 ADMIN_PASSWORD（否则直接拒绝启动），创建一次；
 * - 已存在管理员时：启动过程绝不修改其密码/角色/封禁状态；
 * - 需要更换密码时，显式执行 node server.js --rotate-admin-password（一次性轮换并让旧会话失效）。
 */
async function ensureAdmin(options) {
  const rotate = !!(options && options.rotate);
  const admin = findUserByNickname(ADMIN_NICKNAME);
  if (!admin) {
    if (!ADMIN_PASSWORD) {
      console.error("[FATAL] 系统中还没有管理员账号，必须通过环境变量 ADMIN_PASSWORD 提供初始密码。");
      console.error("        示例： ADMIN_PASSWORD='<强密码>' node server.js");
      process.exit(1);
    }
    const created = createUser(ADMIN_NICKNAME, ADMIN_PASSWORD, "管理员", "admin");
    audit.log("admin_created", { target: ADMIN_NICKNAME, result: "ok" });
    await saveDb();
    return created;
  }
  if (rotate) {
    if (!ADMIN_PASSWORD) {
      console.error("[FATAL] 轮换管理员密码需要设置 ADMIN_PASSWORD。");
      process.exit(1);
    }
    admin.salt = makeSalt();
    admin.hash = hashPassword(ADMIN_PASSWORD, admin.salt);
    admin.role = "admin";
    Object.keys(db.sessions).forEach((t) => { if (db.sessions[t].userId === admin.id) delete db.sessions[t]; });
    audit.log("admin_password_rotated", { actorName: ADMIN_NICKNAME, result: "ok" });
    await saveDb();
    return admin;
  }
  return admin;
}

function newId(prefix) { return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 16); }

function makeProjectCode() {
  let code;
  do {
    code = String(Math.floor(10000000 + Math.random() * 89999999));
  } while (db.topics.some((t) => t.code === code));
  return code;
}

/* ---------- 站内通知（类似微信消息提醒） ---------- */
function notify(userId, payload) {
  if (!userId) return null;
  if (!db.notifications[userId]) db.notifications[userId] = [];
  const item = Object.assign({ id: newId("n"), at: Date.now(), read: false }, payload);
  db.notifications[userId].unshift(item);
  if (db.notifications[userId].length > 200) db.notifications[userId] = db.notifications[userId].slice(0, 200);
  sseHub.sendToUsers([userId], "notify", { notification: item });
  scheduleSave();
  return item;
}
function notifyOthers(topic, exceptUserId, payload) {
  topic.members.forEach((m) => { if (m.id !== exceptUserId) notify(m.id, payload); });
}

/* ---------- SSE 定向推送（按权限） ---------- */
function auditDenied(user, topic, path) {
  audit.log("permission_denied", {
    actorId: user ? user.id : "",
    actorName: user ? user.nickname : "",
    topicId: topic ? topic.id : "",
    path: path,
    result: "deny"
  });
}
function topicAudience(topic) { return topic.members.map((m) => m.id); }
function broadcastTopic(topic, event, data) { sseHub.sendToUsers(topicAudience(topic), event, data); }
function broadcastPing(event, data) { sseHub.sendToAllAuthed(event, data); }

function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
}
/* 只有命中白名单的 Origin 才回显 CORS 头；默认同源与无 Origin 请求不受影响 */
/* 判定请求是否来自本站自身（同源请求浏览器也会带 Origin 头） */
function isSameOrigin(req, origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const hosts = [String(req.headers.host || "")];
    if (SEC.LIMITS.trustProxy && req.headers["x-forwarded-host"]) {
      String(req.headers["x-forwarded-host"]).split(",").forEach((h) => hosts.push(h.trim()));
    }
    return hosts.some((h) => h && h === u.host);
  } catch (e) { return false; }
}

function corsHeadersFor(origin) {
  const list = allowedOrigins();
  if (!list.length) return {};                       // 未配置白名单 = 不开放跨域
  if (origin && list.indexOf(origin) >= 0) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,PATCH,OPTIONS"
    };
  }
  return {};
}

function sendJson(res, code, obj) {
  const headers = Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }, res.corsHeaders || {});
  SEC.applySecurityHeaders(res, headers, res.secReq);
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
}

async function readBody(req, opts) {
  const result = await SEC.readJsonBody(req, opts);
  if (!result.ok) {
    const err = new Error(result.error || "请求体不合法");
    err.status = result.status || 400;
    err.expose = true;
    throw err;
  }
  return result.data;
}

/* ---------- 数据视图 ---------- */
function publicTopic(topic) {
  const copy = Object.assign({}, topic);
  delete copy.password;
  delete copy.passwordHash;
  delete copy.passwordSalt;
  delete copy.ai;
  copy.pendingApplications = db.applications.filter((a) => a.topicId === topic.id && a.status === "pending").length;
  return copy;
}
function findTopic(id) { return db.topics.find((t) => t.id === id); }
function isMember(topic, userId) { return topic.members.some((m) => m.id === userId); }
function isOwner(topic, user) { return !!(user && (topic.creatorId === user.id || user.role === "admin")); }
function missingTags(topic) {
  const filled = topic.members.map((m) => m.tag).filter(Boolean);
  return (topic.neededRoles || []).filter((r) => !filled.includes(r));
}
function defaultAi() {
  return { enabled: false, status: "idle", phase: "ANALYZE", rounds: 0, promptVersion: AI.PROMPT_VERSION || "v2.0", draft: "", options: [], announcement: null, deep: null, source: "local", model: "本地演示模式", updatedAt: 0 };
}
function ensureAi(topic) {
  if (!topic.ai || typeof topic.ai !== "object") topic.ai = defaultAi();
  if (!Array.isArray(topic.ai.options)) topic.ai.options = [];
  if (typeof topic.ai.rounds !== "number") topic.ai.rounds = 0;
  if (!topic.ai.phase) topic.ai.phase = "ANALYZE";
  if (!topic.ai.promptVersion) topic.ai.promptVersion = AI.PROMPT_VERSION || "v2.0";
  return topic.ai;
}
function aiView(topic, user) {
  const ai = ensureAi(topic);
  const base = { enabled: !!ai.enabled, status: ai.status || "idle", phase: ai.phase || "ANALYZE", rounds: ai.rounds || 0, promptVersion: ai.promptVersion || AI.PROMPT_VERSION || "v2.0", config: AI.publicConfig() };
  if (!ai.enabled) return base;
  const member = user && isMember(topic, user.id);
  const owner = isOwner(topic, user);
  if (!member && !owner) return Object.assign(base, { error: "只有话题成员才能使用 AI 助手" });
  const myId = user ? user.id : "";
  const voters = {};
  const options = ai.options.map((o) => {
    (o.votes || []).forEach((v) => { voters[v] = 1; });
    return { id: o.id, title: o.title, desc: o.desc, reason: o.reason, votes: (o.votes || []).length };
  });
  const mine = ai.options.find((o) => (o.votes || []).indexOf(myId) >= 0);
  let deepMine = null;
  if (ai.deep && ai.deep.items && user) deepMine = ai.deep.items.find((it) => it.memberId === user.id) || null;
  return Object.assign(base, {
    draft: ai.draft || "",
    announcement: ai.announcement || null,
    options: options,
    myVote: mine ? mine.id : "",
    voters: Object.keys(voters).length,
    totalMembers: topic.members.length,
    canDeep: (ai.rounds || 0) >= 3 && owner,
    deepMine: deepMine,
    deepAll: owner ? ai.deep : null,
    source: ai.source || "local",
    model: ai.model || "本地演示模式",
    updatedAt: ai.updatedAt || 0
  });
}
/* AI 输出视为不可信数据：清洗控制字符并限制长度 */
function consumeAiBudget(userId) {
  const checks = [
    ["ai-user:" + userId, SEC.LIMITS.aiPerUser, SEC.LIMITS.aiDailyWindowMs],
    ["ai-global", SEC.LIMITS.aiPerGlobal, SEC.LIMITS.aiDailyWindowMs]
  ];
  for (const item of checks) {
    const result = rateLimiter.consume(item[0], item[1], item[2]);
    if (!result.allowed) return result;
  }
  return { allowed: true, retryAfter: 0 };
}

function cleanAiText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}
function cleanAiList(list, maxItems, maxLen) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, maxItems).map((x) => cleanAiText(x, maxLen)).filter(Boolean);
}

function closeVoting(topic) {
  const ai = ensureAi(topic);
  let max = -1;
  let winners = [];
  ai.options.forEach((o) => {
    const n = (o.votes || []).length;
    if (n > max) { max = n; winners = [o]; }
    else if (n === max) winners.push(o);
  });
  let winner = winners.find((o) => o.id === "rethink") || winners[0] || null;
  ai.rounds = (ai.rounds || 0) + 1;
  if (!winner || winner.id === "rethink") {
    ai.status = "rethink";
    ai.phase = "CLARIFY";
  } else {
    ai.status = "decided";
    ai.phase = "RECOMMEND";
    ai.announcement = { text: winner.title + "：" + (winner.desc || ""), optionId: winner.id, round: ai.rounds, at: Date.now() };
  }
  ai.updatedAt = Date.now();
  if (ai.status === "rethink") {
    topic.members.forEach((m) => notify(m.id, { type: "announcement", topicId: topic.id, topicTitle: topic.title, from: "AI 助手", text: "本轮投票选择了「再想想」，大家继续讨论吧" }));
  } else if (ai.announcement) {
    topic.members.forEach((m) => notify(m.id, { type: "announcement", topicId: topic.id, topicTitle: topic.title, from: "AI 助手", text: "新公告：" + ai.announcement.text.slice(0, 60) }));
  }
  return ai;
}

function topicSummary(topic) {
  const copy = publicTopic(topic);
  copy.missingTags = missingTags(topic);
  return copy;
}

/* ---------- 静态文件（白名单：只暴露前端必需的 4 个文件） ---------- */
const STATIC_WHITELIST = ["/index.html", "/styles.css", "/script.js", "/favicon.svg", "/privacy.html", "/terms.html"];

function serveStatic(req, res, url) {
  try {
    const decoded = SEC.safeDecode(url.pathname);
    if (decoded === null) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return;
    }
    const pathname = (decoded === "/" || decoded === "") ? "/index.html" : decoded;
    if (STATIC_WHITELIST.indexOf(pathname) < 0) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const target = path.join(ROOT, pathname);
    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(target).toLowerCase();
      const headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300"
      };
      SEC.applySecurityHeaders(res, headers, res.secReq);
      res.writeHead(200, headers);
      fs.createReadStream(target).pipe(res);
    });
  } catch (e) {
    try {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Error");
    } catch (e2) {}
  }
}

/* ---------- 管理员初始化 / 显式密码轮换 ---------- */
const ROTATE_ADMIN = process.argv.indexOf("--rotate-admin-password") >= 0 || process.argv.indexOf("--init-admin") >= 0;

/* ---------- HTTP 服务 ---------- */
const server = http.createServer(async (req, res) => {
  res.secReq = req;
  const ip = SEC.clientIp(req);
  const origin = req.headers.origin || "";
  const originList = allowedOrigins();
  res.corsHeaders = corsHeadersFor(origin);

  /* 跨站写请求防护：带 Origin 且不在白名单的写操作直接拒绝 */
  const sameOrigin = isSameOrigin(req, origin);
  if (origin && !sameOrigin && originList.indexOf(origin) < 0 && req.method !== "GET" && req.method !== "OPTIONS") {
    audit.log("cors_rejected", { ip: ip, result: "deny", detail: origin.slice(0, 120) });
    sendJson(res, 403, { error: "请求来源不被允许" });
    return;
  }

  /* 并发闸门：全局 + 单 IP */
  const gate = inflight.enter(ip);
  if (!gate.ok) {
    audit.log("inflight_rejected", { ip: ip, result: "deny" });
    res.setHeader("Retry-After", "1");
    sendJson(res, 503, { error: gate.reason });
    return;
  }

  try {
    /* 拒绝协议相对/权威形式（如 //.env、//evil.example/.env）的请求地址：
       这类写法会被 URL 解析器当作"主机"部分，导致路由语义与预期不一致 */
    const rawUrl = String(req.url || "");
    if (rawUrl.charAt(0) === "/" && rawUrl.charAt(1) === "/") {
      audit.log("bad_request_target", { ip: ip, path: rawUrl.slice(0, 60), result: "deny" });
      sendJson(res, 400, { error: "请求地址不合法" });
      return;
    }
    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

    /* SSE：一次性短期票据鉴权 + 连接数上限 + 空闲回收 */
    if (url.pathname === "/api/events") {
      const userId = consumeSseTicket(url.searchParams.get("ticket") || "");
      if (!userId) { sendJson(res, 401, { error: "实时连接鉴权失败，请重新连接" }); return; }
      const added = sseHub.add(res, userId, ip);
      if (!added.ok) { sendJson(res, 503, { error: added.reason }); return; }
      const headers = Object.assign({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }, res.corsHeaders || {});
      SEC.applySecurityHeaders(res, headers, res.secReq);
      res.writeHead(200, headers);
      res.write("retry: 3000\n\n");
      res.write("event: hello\ndata: {}\n\n");
      const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch (e) {} }, 20000);
      const idle = setTimeout(() => { try { res.end(); } catch (e) {} }, SEC.LIMITS.sseIdleMs);
      req.on("close", () => { clearInterval(ping); clearTimeout(idle); sseHub.remove(added.id); });
      return;
    }

    /* 普通 API：先做单 IP 总量限流 */
    if (url.pathname.indexOf("/api/") === 0) {
      const rl = rateLimiter.consume("api:" + ip, SEC.LIMITS.apiPerIp, SEC.LIMITS.apiWindowMs);
      if (!rl.allowed) {
        audit.log("rate_limited", { ip: ip, path: url.pathname.slice(0, 80), result: "deny" });
        res.setHeader("Retry-After", String(rl.retryAfter));
        sendJson(res, 429, { error: "请求过于频繁，请稍后再试" });
        return;
      }
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (e) {
    if (e && e.expose && e.status) { sendJson(res, e.status, { error: e.message }); return; }
    console.error("[REQ-ERROR] " + (e && e.message));
    try { sendJson(res, 500, { error: "服务器内部错误" }); } catch (e2) {}
  } finally {
    inflight.leave(ip);
  }
});

server.requestTimeout = SEC.LIMITS.requestTimeoutMs;
server.headersTimeout = Math.min(20000, SEC.LIMITS.requestTimeoutMs);
server.keepAliveTimeout = 65000;

let shuttingDown = false;
async function shutdown(signal, exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  let code = typeof exitCode === "number" ? exitCode : 0;
  audit.log("shutdown", { detail: signal, result: code === 0 ? "ok" : "error" });
  try {
    if (storageReady) await flushDb();
  } catch (e) {
    console.error("[STORAGE] 关闭前保存失败：" + (e && e.message));
    if (code === 0) code = 1;
  }
  try { if (storage) await storage.close(); } catch (e) {}
  server.close(() => process.exit(code));
  const forced = setTimeout(() => process.exit(code), 5000);
  if (forced.unref) forced.unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM", 0));
process.once("SIGINT", () => shutdown("SIGINT", 0));

/* 兜底：未捕获异常/未处理拒绝 → 记录并安全退出，交由进程守护重启 */
process.on("unhandledRejection", (err) => {
  audit.log("unhandled_rejection", { detail: String(err && err.message).slice(0, 200), result: "fatal" });
  console.error("[FATAL] 未处理的 Promise 拒绝：" + (err && err.message));
  shutdown("unhandled_rejection", 1);
});
process.on("uncaughtException", (err) => {
  audit.log("uncaught_exception", { detail: String(err && err.message).slice(0, 200), result: "fatal" });
  console.error("[FATAL] 未捕获异常：" + (err && err.message));
  shutdown("uncaught_exception", 1);
});

/* 定期清理：过期会话 + 过期 SSE 票据 */
setInterval(() => {
  const now = Date.now();
  let changed = false;
  Object.keys(db.sessions).forEach((t) => {
    const sess = db.sessions[t];
    if (sess && sess.expiresAt && now > sess.expiresAt) { delete db.sessions[t]; changed = true; }
  });
  for (const [k, v] of sseTickets) { if (now > v.expiresAt) sseTickets.delete(k); }
  for (const [key, fail] of loginFailures) {
    const last = fail && fail.until > now ? fail.until : ((fail && fail.updatedAt) || 0);
    if (!last || now - last > SEC.LIMITS.loginWindowMs) loginFailures.delete(key);
  }
  if (changed) saveDb().catch(() => {});
}, 10 * 60 * 1000).unref();



/* ================= API ================= */
function viewTopic(topic, user) {
  const copy = topicSummary(topic);
  ensureAi(topic);
  copy.aiEnabled = !!topic.ai.enabled;
  copy.aiRounds = topic.ai.rounds || 0;
  const viewerIsMember = !!(user && isMember(topic, user.id));
  if (!isOwner(topic, user)) {
    delete copy.code;
    delete copy.pendingApplications;
  }
  /* 私密话题：非成员只能看到"存在、可搜索、需要密码"，不暴露成员身份与简介细节 */
  if (topic.type === "private" && !viewerIsMember && !isOwner(topic, user)) {
    copy.memberCount = topic.members.length;
    copy.members = [];
    copy.memberHidden = true;
    copy.desc = "";
    copy.vibe = "";
    copy.required = [];
  }
  return copy;
}

async function removeTopicData(topicId) {
  const metas = (db.files[topicId] || []).slice();
  delete db.files[topicId];
  delete db.messages[topicId];
  db.topics = db.topics.filter((t) => t.id !== topicId);
  db.applications = db.applications.filter((a) => a.topicId !== topicId);
  return metas;
}

async function purgeStoredFiles(metas, topicId) {
  for (const file of metas || []) {
    try { await storage.deleteFile(file.storedName); } catch (e) {
      audit.log("file_delete_failed", { topicId: topicId, target: file.id, result: "error", detail: String(e && e.message).slice(0, 120) });
    }
  }
}

async function migrateLocalFilesToStorage() {
  if (!storage || typeof storage.migrateLocalFile !== "function") return 0;
  let migrated = 0;
  const metas = Object.keys(db.files).flatMap((topicId) => db.files[topicId] || []);
  for (const file of metas) {
    const localPath = path.join(FILES_DIR, file.storedName);
    if (await storage.migrateLocalFile(file.storedName, localPath)) migrated += 1;
  }
  if (migrated > 0) audit.log("files_migrated_to_storage", { detail: String(migrated), result: "ok" });
  return migrated;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const m = req.method || "GET";
  const p1 = parts[1] || "";
  const user = authUser(req);
  const via = authVia(req);

  /* 双提交 Cookie 校验：Cookie 认证的写操作必须带匹配的 X-CSRF-Token */
  if (user && via === "cookie" && ["POST", "PATCH", "DELETE"].indexOf(m) >= 0) {
    const cookies = parseCookies(req);
    const header = String(req.headers["x-csrf-token"] || "");
    if (!cookies[CSRF_COOKIE] || !header || !safeEqualStr(header, cookies[CSRF_COOKIE])) {
      audit.log("csrf_rejected", { actorId: user.id, ip: SEC.clientIp(req), path: url.pathname.slice(0, 60), result: "deny" });
      sendJson(res, 403, { error: "请求校验失败，请刷新页面后重试" });
      return;
    }
  }

  /* 路径片段安全解码：非法编码返回 400，而不是抛出异常 */
  const part = (i) => {
    const v = SEC.safeDecode(parts[i]);
    if (v === null) {
      const err = new Error("请求路径编码不合法");
      err.status = 400;
      err.expose = true;
      throw err;
    }
    return v;
  };

  if (m === "OPTIONS") { sendJson(res, 204, {}); return; }

  /* ---- 健康检查：检查持久化依赖，不只检查进程存活 ---- */
  if (p1 === "health" && m === "GET") {
    try {
      const health = storage ? await storage.health() : { ok: false };
      if (!health.ok) { sendJson(res, 503, { ok: false }); return; }
      if (IS_PROD) { sendJson(res, 200, { ok: true }); return; }
      sendJson(res, 200, { ok: true, driver: health.driver, persistent: !!health.persistent, topics: db.topics.length, users: Object.keys(db.users).length });
    } catch (e) {
      audit.log("health_failed", { detail: String(e && e.message).slice(0, 160), result: "error" });
      sendJson(res, 503, { ok: false });
    }
    return;
  }

  /* ---- SSE 一次性票据（短期、单次使用，避免把会话凭据放进 URL） ---- */
  if (p1 === "sse" && parts[2] === "ticket" && m === "POST") {
    if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
    if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
    const ticket = issueSseTicket(user.id);
    sendJson(res, 200, { ticket: ticket, expiresInMs: SEC.LIMITS.sseTicketTtlMs });
    return;
  }

  /* ---- AI 配置信息 ---- */
  if (p1 === "ai" && parts[2] === "config" && m === "GET") {
    if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
    await AI.resolveConfig();
    const cfg = AI.publicConfig();
    sendJson(res, 200, { config: { provider: cfg.provider, label: cfg.label, model: cfg.model, configured: !!cfg.configured } });
    return;
  }

  /* ---- 注册 ---- */
  if (p1 === "register" && m === "POST") {
    const ip = SEC.clientIp(req);
    const rl = rateLimiter.consume("register:" + ip, SEC.LIMITS.registerPerIp, SEC.LIMITS.registerWindowMs);
    if (!rl.allowed) {
      audit.log("rate_limited", { ip: ip, path: "/api/register", result: "deny" });
      res.setHeader("Retry-After", String(rl.retryAfter));
      sendJson(res, 429, { error: "注册过于频繁，请稍后再试" });
      return;
    }
    const body = await readBody(req);
    const nickname = String(body.nickname || "").trim();
    const password = String(body.password || "");
    const grade = String(body.grade || "").trim();
    const directions = Array.isArray(body.directions) ? body.directions.filter((x) => typeof x === "string").slice(0, 5) : [];
    if (nickname.length < 2 || nickname.length > 16) { sendJson(res, 400, { error: "昵称需要 2-16 个字符" }); return; }
    const pwError = validatePasswordPolicy(password);
    if (pwError) { sendJson(res, 400, { error: pwError }); return; }
    if (!grade) { sendJson(res, 400, { error: "请选择大学几年级" }); return; }
    if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) { sendJson(res, 403, { error: "该昵称不可使用" }); return; }
    if (findUserByNickname(nickname)) { sendJson(res, 409, { error: "该昵称已被注册，请直接登录" }); return; }
    const u = createUser(nickname, password, grade, "user", directions);
    const token = createSession(u.id);
    const csrf = issueCsrfToken();
    setSessionCookies(req, res, token, csrf);
    await saveDb();
    audit.log("register_success", { actorId: u.id, actorName: nickname, ip: SEC.clientIp(req), result: "ok" });
    const payload = { user: publicUser(u), csrf: csrf };
    if (String(req.headers["x-client"] || "") === "api") payload.token = token;   // 仅 API 客户端获取 Token
    sendJson(res, 200, payload);
    return;
  }

  /* ---- 登录 ---- */
  if (p1 === "login" && m === "POST") {
    const ip = SEC.clientIp(req);
    const ipLimit = rateLimiter.consume("login-ip:" + ip, SEC.LIMITS.loginPerIp, SEC.LIMITS.loginWindowMs);
    if (!ipLimit.allowed) {
      audit.log("rate_limited", { ip: ip, path: "/api/login", result: "deny" });
      res.setHeader("Retry-After", String(ipLimit.retryAfter));
      sendJson(res, 429, { error: "登录尝试过于频繁，请稍后再试" });
      return;
    }
    const body = await readBody(req);
    const nickname = String(body.nickname || "").trim();
    const password = String(body.password || "");
    const accountKey = nickname.toLowerCase();

    /* 账号维度失败锁定 */
    let fail = loginFailures.get(accountKey);
    if (fail && fail.until && fail.until <= Date.now()) { loginFailures.delete(accountKey); fail = null; }   // 锁定期已过则重新计数
    if (fail && fail.until > Date.now()) {
      const wait = Math.ceil((fail.until - Date.now()) / 1000);
      audit.log("login_locked", { actorName: nickname, ip: ip, result: "deny" });
      res.setHeader("Retry-After", String(wait));
      sendJson(res, 429, { error: "该账号尝试次数过多，请 " + Math.ceil(wait / 60) + " 分钟后再试" });
      return;
    }

    const u = findUserByNickname(nickname);
    const passwordOk = !!(u && verifyPassword(u, password));
    if (!passwordOk) {
      const prev = fail ? (fail.count || 0) : 0;
      const count = prev + 1;
      const windowMs = SEC.LIMITS.loginWindowMs;
      loginFailures.set(accountKey, { count: count, until: count >= SEC.LIMITS.loginPerAccount ? Date.now() + windowMs : 0, updatedAt: Date.now() });
      audit.log("login_failed", { actorName: nickname, ip: ip, result: "deny", detail: "bad-credentials" });
      sendJson(res, 401, { error: "昵称或密码不正确" });
      return;
    }
    if (u.banned) {
      audit.log("login_denied", { actorId: u.id, actorName: u.nickname, ip: ip, result: "deny", detail: "banned" });
      sendJson(res, 403, { error: "该账号已被封禁" });
      return;
    }
    loginFailures.delete(accountKey);
    const token = createSession(u.id);
    const csrf = issueCsrfToken();
    setSessionCookies(req, res, token, csrf);
    await saveDb();
    audit.log(u.role === "admin" ? "admin_login" : "login_success", { actorId: u.id, actorName: u.nickname, ip: ip, result: "ok" });
    const payload = { user: publicUser(u), csrf: csrf };
    if (String(req.headers["x-client"] || "") === "api") payload.token = token;
    sendJson(res, 200, payload);
    return;
  }

  /* ---- 退出 ---- */
  if (p1 === "logout" && m === "POST") {
    const token = authToken(req).token;
    clearSessionCookies(res);
    const key = token ? sessionKey(token) : "";
    if (key && db.sessions[key]) {
      const sess = db.sessions[key];
      delete db.sessions[key];
      await saveDb();
      audit.log("logout", { actorId: sess.userId, ip: SEC.clientIp(req), result: "ok" });
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  /* ---- 当前用户 ---- */
  if (p1 === "me" && m === "GET") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }
  if (p1 === "me" && m === "PATCH") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const body = await readBody(req);
    if (Array.isArray(body.directions)) user.directions = body.directions.filter((x) => MAJOR_IDS.indexOf(x) >= 0).slice(0, 5);
    if (typeof body.grade === "string" && body.grade) user.grade = body.grade.slice(0, 12);
    await saveDb();
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  /* ---- 话题列表 / 创建 ---- */
  if (p1 === "topics" && parts.length === 2 && m === "GET") {
    sendJson(res, 200, { topics: db.topics.map((t) => viewTopic(t, user)) });
    return;
  }
  if (p1 === "topics" && parts.length === 2 && m === "POST") {
    if (!user) { sendJson(res, 401, { error: "请先登录再创建项目" }); return; }
    if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁，无法创建项目" }); return; }
    const body = await readBody(req);
    const title = String(body.title || "").trim().slice(0, 60);
    const desc = String(body.desc || "").trim().slice(0, 300);
    const vibe = String(body.vibe || "").trim().slice(0, 60);
    const directions = Array.isArray(body.directions) ? body.directions.filter((x) => MAJOR_IDS.indexOf(x) >= 0).slice(0, 5) : [];
    const required = Array.isArray(body.required) ? body.required.filter((x) => MAJOR_IDS.indexOf(x) >= 0).slice(0, 5) : [];
    const neededRoles = Array.isArray(body.neededRoles) ? body.neededRoles.filter((x) => ROLE_TAGS.indexOf(x) >= 0).slice(0, 6) : [];
    const type = body.type === "private" ? "private" : "public";
    const limit = Math.max(2, Math.min(50, parseInt(body.limit, 10) || 6));
    const password = String(body.password || "");

    if (!title) { sendJson(res, 400, { error: "请填写项目名称" }); return; }
    if (!directions.length) { sendJson(res, 400, { error: "请至少选择一个项目方向" }); return; }
    if (type === "public" && !required.length) { sendJson(res, 400, { error: "公开话题需要设置加入成员所需的方向" }); return; }
    if (type === "private" && !isSixDigits(password)) { sendJson(res, 400, { error: "私密话题需要设置 6 位数字密码" }); return; }
    if (db.topics.some((t) => t.title.trim().toLowerCase() === title.toLowerCase())) { sendJson(res, 409, { error: "该项目已存在" }); return; }

    const topic = {
      id: newId("t"),
      code: makeProjectCode(),
      creatorId: user.id,
      title: title,
      desc: desc,
      vibe: vibe,
      directions: directions,
      required: type === "public" ? required : [],
      neededRoles: neededRoles,
      type: type,
      passwordHash: "",
      passwordSalt: "",
      limit: limit,
      members: [{ id: user.id, nickname: user.nickname, grade: user.grade, tag: "" }],
      ai: defaultAi(),
      createdAt: Date.now()
    };
    if (type === "private") setTopicPassword(topic, password);
    db.topics.unshift(topic);
    db.messages[topic.id] = [];
    db.files[topic.id] = [];
    await saveDb();
    audit.log("topic_created", { actorId: user.id, actorName: user.nickname, topicId: topic.id, target: title, result: "ok", detail: type });
    broadcastPing("topics", { action: "created", topicId: topic.id });
    sendJson(res, 200, { topic: viewTopic(topic, user) });
    return;
  }

  /* ---- 消息中心 / 我的申请 ---- */
  if (p1 === "inbox" && m === "GET") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const list = db.applications
      .filter((a) => { const t = findTopic(a.topicId); return t && t.creatorId === user.id; })
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => {
        const t = findTopic(a.topicId) || {};
        return Object.assign({}, a, { topicTitle: t.title || "已删除项目", topicCode: t.code || "" });
      });
    sendJson(res, 200, { applications: list });
    return;
  }
  if (p1 === "my-applications" && m === "GET") {
    if (!user) { sendJson(res, 200, { applications: [] }); return; }
    const latest = new Map();
    db.applications
      .filter((a) => a.userId === user.id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((a) => latest.set(a.topicId, a));
    const list = Array.from(latest.values()).map((a) => ({ topicId: a.topicId, applicationId: a.id, status: a.status, at: a.createdAt, decidedAt: a.decidedAt || 0 }));
    sendJson(res, 200, { applications: list });
    return;
  }

  /* ---- 站内通知 ---- */
  if (p1 === "notifications" && parts.length === 2 && m === "GET") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const list = db.notifications[user.id] || [];
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit"), 10) || 60));
    sendJson(res, 200, { notifications: list.slice(0, limit), unread: list.filter((n) => !n.read).length });
    return;
  }
  if (p1 === "notifications" && parts[2] === "read" && m === "POST") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const body = await readBody(req);
    const list = db.notifications[user.id] || [];
    list.forEach((n) => {
      if (body.all || (Array.isArray(body.ids) && body.ids.indexOf(n.id) >= 0)) n.read = true;
    });
    scheduleSave();
    sendJson(res, 200, { ok: true, unread: list.filter((n) => !n.read).length });
    return;
  }

  /* ---- 内容举报（用户提交） ---- */
  if (p1 === "reports" && parts.length === 2 && m === "POST") {
    if (!user) { sendJson(res, 401, { error: "请先登录再举报" }); return; }
    if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
    const rl = rateLimiter.consume("report:" + user.id, 5, 60 * 60 * 1000);
    if (!rl.allowed) { sendJson(res, 429, { error: "举报过于频繁，请稍后再试" }); return; }
    const body = await readBody(req);
    const reason = cleanAiText(body.reason, 60);
    const detail = cleanAiText(body.detail, 500);
    const topicId = cleanAiText(body.topicId, 40);
    const targetUserId = cleanAiText(body.targetUserId, 40);
    if (!reason) { sendJson(res, 400, { error: "请选择举报类型" }); return; }
    const topic = topicId ? findTopic(topicId) : null;
    const report = {
      id: newId("r"), reporterId: user.id, reporterName: user.nickname,
      topicId: topic ? topic.id : "", topicTitle: topic ? topic.title : "",
      targetUserId: targetUserId || "", reason: reason, detail: detail,
      status: "open", createdAt: Date.now(), handledAt: 0, handledBy: ""
    };
    db.reports.unshift(report);
    if (db.reports.length > 500) db.reports = db.reports.slice(0, 500);
    await saveDb();
    audit.log("report_submitted", { actorId: user.id, topicId: report.topicId, targetId: report.targetUserId, reason: reason, result: "ok" });
    Object.keys(db.users).forEach((k) => { if (db.users[k].role === "admin") notify(k, { type: "report", topicId: report.topicId, topicTitle: report.topicTitle, from: user.nickname, text: "收到一条举报：" + reason }); });
    sendJson(res, 200, { ok: true, id: report.id });
    return;
  }
  if (p1 === "admin" && parts[2] === "reports" && parts.length === 3 && m === "GET") {
    if (!user || user.role !== "admin") { auditDenied(user, null, "admin"); sendJson(res, 403, { error: "需要管理员权限" }); return; }
    sendJson(res, 200, { reports: db.reports.slice(0, 200) });
    return;
  }
  if (p1 === "admin" && parts[2] === "reports" && parts[4] === "resolve" && m === "POST") {
    if (!user || user.role !== "admin") { auditDenied(user, null, "admin"); sendJson(res, 403, { error: "需要管理员权限" }); return; }
    const rep = db.reports.find((r) => r.id === part(3));
    if (!rep) { sendJson(res, 404, { error: "举报不存在" }); return; }
    rep.status = "resolved";
    rep.handledAt = Date.now();
    rep.handledBy = user.nickname;
    await saveDb();
    audit.log("report_resolved", { actorId: user.id, targetId: rep.id, result: "ok" });
    sendJson(res, 200, { report: rep });
    return;
  }

  /* ---- 管理员 ---- */
  if (p1 === "admin" && parts[2] === "users" && parts.length === 3 && m === "GET") {
    if (!user || user.role !== "admin") { auditDenied(user, null, "admin"); sendJson(res, 403, { error: "需要管理员权限" }); return; }
    const users = Object.keys(db.users).map((k) => {
      const u = db.users[k];
      return Object.assign(publicUser(u), { topicCount: db.topics.filter((t) => t.creatorId === u.id).length });
    }).sort((a, b) => a.createdAt - b.createdAt);
    sendJson(res, 200, { users: users });
    return;
  }
  if (p1 === "admin" && parts[2] === "users" && parts[4] === "ban" && m === "POST") {
    if (!user || user.role !== "admin") { auditDenied(user, null, "admin"); sendJson(res, 403, { error: "需要管理员权限" }); return; }
    const target = db.users[parts[3]];
    if (!target) { sendJson(res, 404, { error: "用户不存在" }); return; }
    if (target.role === "admin") { sendJson(res, 403, { error: "不能封禁管理员账号" }); return; }
    const body = await readBody(req);
    target.banned = !!body.banned;
    if (target.banned) {
      Object.keys(db.sessions).forEach((tok) => { if (db.sessions[tok].userId === target.id) delete db.sessions[tok]; });
    }
    await saveDb();
    audit.log(target.banned ? "admin_ban_user" : "admin_unban_user", { actorId: user.id, actorName: user.nickname, targetId: target.id, target: target.nickname, result: "ok" });
    sendJson(res, 200, { user: publicUser(target) });
    return;
  }

  /* ---- 话题内的操作 ---- */
  if (p1 === "topics" && parts.length >= 3) {
    const topic = findTopic(part(2));
    if (!topic) { sendJson(res, 404, { error: "话题不存在" }); return; }
    const action = parts[3] || "";

    if (!action && m === "GET") { sendJson(res, 200, { topic: viewTopic(topic, user) }); return; }

    if (!action && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "topic:delete"); sendJson(res, 403, { error: "只有项目负责人或管理员才能删除该项目" }); return; }
      const removedFiles = await removeTopicData(topic.id);
      await saveDb();
      await purgeStoredFiles(removedFiles, topic.id);
      audit.log("topic_deleted", { actorId: user.id, actorName: user.nickname, topicId: topic.id, target: topic.title, result: "ok", detail: isOwner(topic, user) && topic.creatorId !== user.id ? "by-admin" : "by-owner" });
      broadcastPing("topics", { action: "deleted", topicId: topic.id });
      sendJson(res, 200, { ok: true });
      return;
    }

    /* ===== AI 助手 ===== */
    if (action === "ai" && parts.length === 4 && m === "GET") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "toggle" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "ai:toggle"); sendJson(res, 403, { error: "只有项目负责人才能设置 AI 助手" }); return; }
      const body = await readBody(req);
      const ai = ensureAi(topic);
      ai.enabled = !!body.enabled;
      if (!ai.enabled) { ai.status = "idle"; ai.options = []; }
      ai.updatedAt = Date.now();
      await saveDb();
      broadcastTopic(topic, "ai", { topicId: topic.id });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "think" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "ai:think"); sendJson(res, 403, { error: "只有项目负责人才能让 AI 开始思考" }); return; }
      const ai = ensureAi(topic);
      if (!ai.enabled) { sendJson(res, 400, { error: "还没有引入 AI 助手" }); return; }
      if (ai.status === "thinking") { sendJson(res, 400, { error: "AI 正在思考中，请稍等" }); return; }
      if ((ai.rounds || 0) >= 10) { sendJson(res, 400, { error: "已达到 10 轮思考上限，请先确认方案或结束 AI 思考" }); return; }
      const aiRl = rateLimiter.consume("ai:" + topic.id, SEC.LIMITS.aiPerTopic, SEC.LIMITS.aiWindowMs);
      if (!aiRl.allowed) {
        audit.log("rate_limited", { actorId: user.id, topicId: topic.id, path: "ai:think", result: "deny" });
        res.setHeader("Retry-After", String(aiRl.retryAfter));
        sendJson(res, 429, { error: "AI 调用过于频繁，请稍后再试" });
        return;
      }
      const aiBudget = consumeAiBudget(user.id);
      if (!aiBudget.allowed) {
        audit.log("rate_limited", { actorId: user.id, topicId: topic.id, path: "ai:think", result: "deny" });
        res.setHeader("Retry-After", String(aiBudget.retryAfter));
        sendJson(res, 429, { error: "AI 今日调用额度已用完，请稍后再试" });
        return;
      }
      const aiGate = aiInflight.enter("ai");
      if (!aiGate.ok) { sendJson(res, 503, { error: aiGate.reason }); return; }
      await AI.resolveConfig();
      ai.status = "thinking";
      ai.phase = "ANALYZE";
      ai.promptVersion = AI.PROMPT_VERSION || "v2.0";
      ai.draft = "";
      ai.options = [];
      ai.updatedAt = Date.now();
      await saveDb();
      broadcastTopic(topic, "ai", { topicId: topic.id });
      const msgs = db.messages[topic.id] || [];
      try {
        ai.phase = "RESEARCH";
        const draftRes = await AI.generateDraft(topic, msgs);
        ai.phase = "GENERATE";
        const dirRes = await AI.generateDirections(topic, msgs, draftRes.draft);
        ai.draft = cleanAiText(draftRes.draft, 8000);
        ai.source = draftRes.source;
        ai.model = draftRes.model;
        ai.options = (dirRes.directions || []).slice(0, 4).map((d, i) => ({
          id: "o" + (i + 1),
          title: cleanAiText(d.title || ("方向 " + (i + 1)), 80),
          desc: cleanAiText(d.desc, 600),
          reason: cleanAiText(d.reason, 200),
          votes: []
        }));
        ai.options.push({ id: "rethink", title: "再想想", desc: "这些方向都不太符合预期，想继续和组员讨论。", reason: "", votes: [] });
        ai.status = "voting";
        ai.phase = "WAIT_FOR_LEADER";
      } catch (e) {
        console.error("[AI] 思考失败：", e.message);
        audit.log("ai_error", { actorId: user.id, topicId: topic.id, result: "error", detail: String(e.message).slice(0, 120) });
        ai.status = "idle";
      } finally {
        aiInflight.leave("ai");
      }
      ai.updatedAt = Date.now();
      await saveDb();
      broadcastTopic(topic, "ai", { topicId: topic.id });
      audit.log("ai_think", { actorId: user.id, topicId: topic.id, result: "ok", detail: ai.model || "" });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "vote" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      const ai = ensureAi(topic);
      if (!ai.enabled) { sendJson(res, 400, { error: "该项目还没有引入 AI 助手" }); return; }
      if (ai.status !== "voting") { sendJson(res, 400, { error: "现在不在投票阶段" }); return; }
      if (!isMember(topic, user.id)) { sendJson(res, 403, { error: "只有话题成员才能投票" }); return; }
      const body = await readBody(req);
      const optionId = String(body.optionId || "");
      const opt = ai.options.find((o) => o.id === optionId);
      if (!opt) { sendJson(res, 400, { error: "选项不存在" }); return; }
      ai.options.forEach((o) => { o.votes = (o.votes || []).filter((v) => v !== user.id); });
      opt.votes.push(user.id);
      const voters = {};
      ai.options.forEach((o) => (o.votes || []).forEach((v) => { voters[v] = 1; }));
      if (Object.keys(voters).length >= topic.members.length) closeVoting(topic);
      ai.updatedAt = Date.now();
      scheduleSave();
      broadcastTopic(topic, "ai", { topicId: topic.id });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "close" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "ai:close"); sendJson(res, 403, { error: "只有项目负责人才能结束投票" }); return; }
      const ai = ensureAi(topic);
      if (ai.status !== "voting") { sendJson(res, 400, { error: "现在不在投票阶段" }); return; }
      closeVoting(topic);
      await saveDb();
      broadcastTopic(topic, "ai", { topicId: topic.id });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "deep" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "ai:deep"); sendJson(res, 403, { error: "只有项目负责人才能发起深度分工" }); return; }
      const ai = ensureAi(topic);
      if (!ai.enabled) { sendJson(res, 400, { error: "还没有引入 AI 助手" }); return; }
      if ((ai.rounds || 0) < 3) { sendJson(res, 400, { error: "需要先完成 3 轮以上的思考与投票" }); return; }
      const deepRl = rateLimiter.consume("ai:" + topic.id, SEC.LIMITS.aiPerTopic, SEC.LIMITS.aiWindowMs);
      if (!deepRl.allowed) {
        audit.log("rate_limited", { actorId: user.id, topicId: topic.id, path: "ai:deep", result: "deny" });
        res.setHeader("Retry-After", String(deepRl.retryAfter));
        sendJson(res, 429, { error: "AI 调用过于频繁，请稍后再试" });
        return;
      }
      const aiBudget = consumeAiBudget(user.id);
      if (!aiBudget.allowed) {
        audit.log("rate_limited", { actorId: user.id, topicId: topic.id, path: "ai:deep", result: "deny" });
        res.setHeader("Retry-After", String(aiBudget.retryAfter));
        sendJson(res, 429, { error: "AI 今日调用额度已用完，请稍后再试" });
        return;
      }
      const deepGate = aiInflight.enter("ai");
      if (!deepGate.ok) { sendJson(res, 503, { error: deepGate.reason }); return; }
      await AI.resolveConfig();
      ai.status = "thinking";
      ai.phase = "DECOMPOSE";
      ai.updatedAt = Date.now();
      await saveDb();
      broadcastTopic(topic, "ai", { topicId: topic.id });
      const msgs = db.messages[topic.id] || [];
      try {
        const deepRes = await AI.generateDeepPlan(topic, msgs, ai.draft);
        const safeItems = (deepRes.items || []).slice(0, 50).map((it) => ({
          memberId: it.memberId,
          nickname: cleanAiText(it.nickname, 24),
          task: cleanAiText(it.task, 400),
          books: cleanAiList(it.books, 6, 120),
          suggestion: cleanAiText(it.suggestion, 500)
        }));
        ai.deep = { at: Date.now(), items: safeItems, source: deepRes.source, model: deepRes.model };
        ai.status = "assigned";
        ai.phase = "ASSIGN";
      } catch (e) {
        console.error("[AI] 深度思考失败：", e.message);
        audit.log("ai_error", { actorId: user.id, topicId: topic.id, path: "ai:deep", result: "error", detail: String(e.message).slice(0, 120) });
        ai.status = "decided";
      } finally {
        aiInflight.leave("ai");
      }
      ai.updatedAt = Date.now();
      await saveDb();
      broadcastTopic(topic, "ai", { topicId: topic.id });
      audit.log("ai_deep", { actorId: user.id, topicId: topic.id, result: "ok", detail: ai.model || "" });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    /* 申请加入 */
    if (action === "applications" && parts.length === 4 && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录再申请加入" }); return; }
      if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
      if (isMember(topic, user.id)) { sendJson(res, 400, { error: "你已经是该话题成员" }); return; }
      if (topic.members.length >= topic.limit) { sendJson(res, 400, { error: "该项目已经满员" }); return; }
      const applyRl = rateLimiter.consume("apply:" + user.id, SEC.LIMITS.applicationPerUser, SEC.LIMITS.applicationWindowMs);
      if (!applyRl.allowed) {
        audit.log("rate_limited", { actorId: user.id, topicId: topic.id, path: "applications:create", result: "deny" });
        res.setHeader("Retry-After", String(applyRl.retryAfter));
        sendJson(res, 429, { error: "申请提交过于频繁，请稍后再试" });
        return;
      }
      const existing = db.applications.find((a) => a.topicId === topic.id && a.userId === user.id && a.status === "pending");
      if (existing) { sendJson(res, 200, { application: existing, duplicated: true }); return; }
      const previous = db.applications
        .filter((a) => a.topicId === topic.id && a.userId === user.id && (a.status === "rejected" || a.status === "cancelled"))
        .sort((a, b) => (b.decidedAt || b.createdAt) - (a.decidedAt || a.createdAt))[0];
      if (previous && SEC.LIMITS.applicationReapplyCooldownMs > 0) {
        const availableAt = (previous.decidedAt || previous.createdAt) + SEC.LIMITS.applicationReapplyCooldownMs;
        if (availableAt > Date.now()) {
          const waitSeconds = Math.ceil((availableAt - Date.now()) / 1000);
          res.setHeader("Retry-After", String(waitSeconds));
          sendJson(res, 429, { error: "暂不能重复申请，请等待冷却结束后再试", retryAfter: waitSeconds });
          return;
        }
      }
      const body = await readBody(req);
      if (topic.type === "private") {
        if (!verifyTopicPassword(topic, String(body.password || ""))) {
          audit.log("topic_password_rejected", { actorId: user.id, topicId: topic.id, result: "deny" });
          sendJson(res, 403, { error: "密码不正确，请向负责人确认" }); return;
        }
      } else {
        const my = Array.isArray(user.directions) ? user.directions : [];
        const ok = (topic.required || []).some((r) => my.indexOf(r) >= 0);
        if (!ok) { sendJson(res, 403, { error: "你的方向与该项目要求不匹配" }); return; }
      }
      const app = {
        id: newId("a"),
        topicId: topic.id,
        userId: user.id,
        nickname: user.nickname,
        grade: user.grade,
        message: String(body.message || "").trim().slice(0, 200),
        status: "pending",
        createdAt: Date.now(),
        decidedAt: 0
      };
      db.applications.push(app);
      await saveDb();
      notify(topic.creatorId, { type: "apply", topicId: topic.id, topicTitle: topic.title, from: user.nickname, text: "申请加入你的项目" + (app.message ? "：" + app.message.slice(0, 40) : "") });
      sseHub.sendToUsers([topic.creatorId], "applications", { action: "created", applicationId: app.id, topicId: topic.id });
      sendJson(res, 200, { application: app });
      return;
    }

    /* 申请人取消自己的待处理申请 */
    if (action === "applications" && parts.length === 4 && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      const app = db.applications
        .filter((a) => a.topicId === topic.id && a.userId === user.id && a.status === "pending")
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!app) { sendJson(res, 404, { error: "没有可取消的申请" }); return; }
      app.status = "cancelled";
      app.decidedAt = Date.now();
      await saveDb();
      notify(topic.creatorId, { type: "application_cancelled", topicId: topic.id, topicTitle: topic.title, from: user.nickname, text: "取消了对该项目的加入申请" });
      sseHub.sendToUsers([topic.creatorId, user.id], "applications", { action: "cancelled", applicationId: app.id, topicId: topic.id });
      sendJson(res, 200, { application: app });
      return;
    }

    /* 负责人查看某个话题的申请 */
    if (action === "applications" && parts.length === 4 && m === "GET") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "applications:read"); sendJson(res, 403, { error: "只有项目负责人才能查看申请" }); return; }
      const list = db.applications.filter((a) => a.topicId === topic.id).sort((a, b) => b.createdAt - a.createdAt);
      sendJson(res, 200, { applications: list });
      return;
    }

    /* 聊天记录 */
    if (action === "messages" && m === "GET") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") { auditDenied(user, topic, "messages:read"); sendJson(res, 403, { error: "只有话题成员才能查看聊天" }); return; }
      const all = db.messages[topic.id] || [];
      const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit"), 10) || 200));
      sendJson(res, 200, { messages: all.slice(-limit), total: all.length, limit: limit });
      return;
    }
    if (action === "messages" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") {
        audit.log("permission_denied", { actorId: user.id, topicId: topic.id, path: "messages:post", result: "deny" });
        sendJson(res, 403, { error: "只有话题成员才能发言" });
        return;
      }
      if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
      const msgRl = rateLimiter.consume("msg:" + user.id, SEC.LIMITS.messagePerUser, SEC.LIMITS.messageWindowMs);
      if (!msgRl.allowed) {
        audit.log("rate_limited", { actorId: user.id, topicId: topic.id, path: "messages:post", result: "deny" });
        res.setHeader("Retry-After", String(msgRl.retryAfter));
        sendJson(res, 429, { error: "发言过于频繁，请稍后再试" });
        return;
      }
      const body = await readBody(req);
      const text = String(body.text || "").trim().slice(0, 1000);
      if (!text) { sendJson(res, 400, { error: "消息不能为空" }); return; }

      /* 引用某条消息 */
      let replyTo = null;
      if (body.replyTo && body.replyTo.id) {
        const src = (db.messages[topic.id] || []).find((x) => x.id === String(body.replyTo.id));
        if (src) {
          replyTo = { id: src.id, authorName: src.authorName, text: src.recalled ? "该消息已被撤回" : String(src.text || "").slice(0, 80) };
        }
      }

      const messageAt = Date.now();
      const message = {
        id: newId("m"), author: user.id, authorName: user.nickname, text: text,
        replyTo: replyTo, mentions: [], recalled: false, time: new Date(messageAt).toISOString(), at: messageAt
      };

      /* @ 成员 */
      const mentioned = topic.members.filter((m) => m.id !== user.id && m.nickname && text.indexOf("@" + m.nickname) >= 0);
      message.mentions = mentioned.map((m) => m.id);

      if (!db.messages[topic.id]) db.messages[topic.id] = [];
      db.messages[topic.id].push(message);
      scheduleSave();

      /* 通知其他成员（类似微信消息提醒） */
      const preview = text.length > 60 ? text.slice(0, 60) + "…" : text;
      topic.members.forEach((m) => {
        if (m.id === user.id) return;
        const hit = mentioned.some((x) => x.id === m.id);
        notify(m.id, {
          type: hit ? "mention" : "message",
          topicId: topic.id,
          topicTitle: topic.title,
          from: user.nickname,
          text: (hit ? "有人 @ 你：" : "") + preview,
          messageId: message.id
        });
      });

      broadcastTopic(topic, "message", { topicId: topic.id, message: message });
      sendJson(res, 200, { message: message });
      return;
    }

    /* 编辑消息：仅作者本人，且不能编辑已撤回消息 */
    if (action === "messages" && parts.length === 5 && m === "PATCH") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") { sendJson(res, 403, { error: "只有话题成员才能编辑消息" }); return; }
      const msg = (db.messages[topic.id] || []).find((x) => x.id === part(4));
      if (!msg) { sendJson(res, 404, { error: "消息不存在" }); return; }
      if (msg.author !== user.id) { auditDenied(user, topic, "messages:edit"); sendJson(res, 403, { error: "只能编辑自己发送的消息" }); return; }
      if (msg.recalled) { sendJson(res, 400, { error: "已撤回的消息不能编辑" }); return; }
      const msgRl = rateLimiter.consume("msg:" + user.id, SEC.LIMITS.messagePerUser, SEC.LIMITS.messageWindowMs);
      if (!msgRl.allowed) { res.setHeader("Retry-After", String(msgRl.retryAfter)); sendJson(res, 429, { error: "操作过于频繁，请稍后再试" }); return; }
      const body = await readBody(req);
      const text = String(body.text || "").trim().slice(0, 1000);
      if (!text) { sendJson(res, 400, { error: "消息不能为空" }); return; }
      msg.text = text;
      msg.mentions = topic.members.filter((m) => m.id !== user.id && m.nickname && text.indexOf("@" + m.nickname) >= 0).map((m) => m.id);
      msg.edited = true;
      msg.editedAt = Date.now();
      await saveDb();
      broadcastTopic(topic, "message", { topicId: topic.id, message: msg });
      sendJson(res, 200, { message: msg });
      return;
    }

    /* 撤回消息：作者本人或负责人 / 管理员 */
    if (action === "messages" && parts.length === 5 && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      const msgId = part(4);
      const list = db.messages[topic.id] || [];
      const msg = list.find((x) => x.id === msgId);
      if (!msg) { sendJson(res, 404, { error: "消息不存在" }); return; }
      const mine = msg.author === user.id;
      if (!mine) { auditDenied(user, topic, "messages:recall"); sendJson(res, 403, { error: "只能撤回自己发送的消息" }); return; }
      if (!msg.recalled) {
        msg.recalled = true;
        msg.recalledAt = Date.now();
        msg.recalledBy = mine ? "自己" : "负责人";
        msg.text = "";
        msg.mentions = [];
        scheduleSave();
        broadcastTopic(topic, "message", { topicId: topic.id, message: msg });
      }
      sendJson(res, 200, { message: msg });
      return;
    }

    /* 组内文件 */
    if (action === "files" && m === "GET") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") { auditDenied(user, topic, "files:list"); sendJson(res, 403, { error: "只有话题成员才能查看文件" }); return; }
      sendJson(res, 200, { files: (db.files[topic.id] || []).map((f) => Object.assign({}, f, { url: "api/files/" + f.id })) });
      return;
    }
    if (action === "files" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") {
        audit.log("permission_denied", { actorId: user.id, topicId: topic.id, path: "files:upload", result: "deny" });
        sendJson(res, 403, { error: "只有话题成员才能上传文件" });
        return;
      }
      if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
      const upRl = rateLimiter.consume("upload:" + user.id, SEC.LIMITS.uploadPerUser, SEC.LIMITS.uploadWindowMs);
      if (!upRl.allowed) {
        audit.log("rate_limited", { actorId: user.id, topicId: topic.id, path: "files:upload", result: "deny" });
        res.setHeader("Retry-After", String(upRl.retryAfter));
        sendJson(res, 429, { error: "上传过于频繁，请稍后再试" });
        return;
      }
      const body = await readBody(req, { allowLargeStrings: ["data"], maxLargeString: SEC.LIMITS.maxBodyBytes });
      const name = String(body.name || "").trim().slice(0, 80);
      const ext = path.extname(name).toLowerCase();
      const data = String(body.data || "");
      if (ALLOWED_FILE_EXT.indexOf(ext) < 0) { sendJson(res, 400, { error: "只支持 Word 文档和 jpg / png 图片" }); return; }
      if (!data) { sendJson(res, 400, { error: "文件内容为空" }); return; }
      if (data.length > SEC.LIMITS.maxFileBytes * 2) { sendJson(res, 413, { error: "文件不能超过 " + Math.round(SEC.LIMITS.maxFileBytes / 1048576) + "MB" }); return; }
      let buffer = Buffer.from(data, "base64");
      if (!buffer || !buffer.length) { sendJson(res, 400, { error: "文件解析失败" }); return; }
      if (buffer.length > SEC.LIMITS.maxFileBytes) { sendJson(res, 413, { error: "文件不能超过 " + Math.round(SEC.LIMITS.maxFileBytes / 1048576) + "MB" }); return; }
      /* 真实类型必须与扩展名一致，防止伪装 */
      const sniffed = sniffFile(buffer);
      if (!sniffed || sniffed !== EXT_FAMILY[ext]) {
        audit.log("upload_rejected", { actorId: user.id, topicId: topic.id, result: "deny", detail: "magic-mismatch:" + ext });
        sendJson(res, 400, { error: "文件内容与扩展名不符，已拒绝上传" });
        return;
      }
      /* 容量配额：单话题文件数 + 单用户总容量 */
      const topicFiles = db.files[topic.id] || [];
      if (topicFiles.length >= SEC.LIMITS.maxFilesPerTopic) { sendJson(res, 429, { error: "该项目的文件数量已达上限" }); return; }
      let used = 0, globalUsed = 0, count = 0;
      Object.keys(db.files).forEach((tid) => (db.files[tid] || []).forEach((f) => {
        const size = f.size || 0;
        globalUsed += size;
        if (f.uploaderId === user.id) { used += size; count += 1; }
      }));
      if (used + buffer.length > SEC.LIMITS.maxStoragePerUser) {
        audit.log("upload_quota_exceeded", { actorId: user.id, result: "deny", detail: String(used) });
        sendJson(res, 413, { error: "你的存储空间已用尽（上限 " + Math.round(SEC.LIMITS.maxStoragePerUser / 1048576) + "MB）" });
        return;
      }
      if (globalUsed + buffer.length > SEC.LIMITS.maxStorageGlobal) {
        audit.log("upload_global_quota_exceeded", { actorId: user.id, result: "deny", detail: String(globalUsed) });
        sendJson(res, 413, { error: "网站存储空间已满，请联系管理员" });
        return;
      }
      const fileId = newId("f");
      const storedName = fileId + ext;
      await storage.saveFile(storedName, buffer);
      const meta = {
        id: fileId,
        topicId: topic.id,
        name: name,
        type: MIME[ext] || "application/octet-stream",
        size: buffer.length,
        storedName: storedName,
        uploaderId: user.id,
        uploaderName: user.nickname,
        at: Date.now()
      };
      if (!db.files[topic.id]) db.files[topic.id] = [];
      db.files[topic.id].push(meta);
      try {
        await saveDb();
      } catch (e) {
        db.files[topic.id].pop();
        try { await storage.deleteFile(storedName); } catch (e2) {}
        throw e;
      }
      notifyOthers(topic, user.id, { type: "file", topicId: topic.id, topicTitle: topic.title, from: user.nickname, text: "上传了文件：" + name });
      broadcastTopic(topic, "files", { topicId: topic.id });
      audit.log("file_uploaded", { actorId: user.id, topicId: topic.id, target: fileId, result: "ok", detail: (buffer.length + "B") });
      sendJson(res, 200, { file: Object.assign({}, meta, { url: "api/files/" + fileId }) });
      return;
    }

    /* 删除组内文件：上传者本人或负责人 / 管理员 */
    if (action === "files" && parts.length === 5 && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      const fileId = part(4);
      const list = db.files[topic.id] || [];
      const idx = list.findIndex((f) => f.id === fileId);
      if (idx < 0) { sendJson(res, 404, { error: "文件不存在" }); return; }
      const meta = list[idx];
      const mine = meta.uploaderId === user.id;
      if (!mine && !isOwner(topic, user)) { auditDenied(user, topic, "files:delete"); sendJson(res, 403, { error: "只能删除自己上传的文件" }); return; }
      list.splice(idx, 1);
      await saveDb();
      try { await storage.deleteFile(meta.storedName); } catch (e) {
        audit.log("file_delete_failed", { actorId: user.id, topicId: topic.id, target: fileId, result: "error", detail: String(e && e.message).slice(0, 120) });
      }
      audit.log("file_deleted", { actorId: user.id, topicId: topic.id, target: fileId, result: "ok" });
      broadcastTopic(topic, "files", { topicId: topic.id });
      sendJson(res, 200, { ok: true });
      return;
    }

    /* 成员标签 / 移出成员 */
    if (action === "members" && parts.length === 5 && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "members:remove"); sendJson(res, 403, { error: "只有项目负责人才能移出成员" }); return; }
      const memberId = part(4);
      if (memberId === topic.creatorId) { sendJson(res, 400, { error: "不能移出项目负责人" }); return; }
      if (!isMember(topic, memberId)) { sendJson(res, 404, { error: "该成员不在话题中" }); return; }
      topic.members = topic.members.filter((x) => x.id !== memberId);
      await saveDb();
      audit.log("member_removed", { actorId: user.id, topicId: topic.id, targetId: memberId, result: "ok" });
      notify(memberId, { type: "removed", topicId: topic.id, topicTitle: topic.title, from: topic.members[0] ? topic.members[0].nickname : "负责人", text: "你已被移出该项目" });
      broadcastPing("topics", { action: "memberRemoved", topicId: topic.id });
      sendJson(res, 200, { topic: viewTopic(topic, user) });
      return;
    }
    if (action === "members" && parts.length === 6 && parts[5] === "tag" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isOwner(topic, user)) { auditDenied(user, topic, "members:tag"); sendJson(res, 403, { error: "只有项目负责人才能设置标签" }); return; }
      const memberId = part(4);
      const member = topic.members.find((x) => x.id === memberId);
      if (!member) { sendJson(res, 404, { error: "该成员不在话题中" }); return; }
      const body = await readBody(req);
      const tag = String(body.tag || "");
      if (tag && ROLE_TAGS.indexOf(tag) < 0) { sendJson(res, 400, { error: "标签不合法" }); return; }
      member.tag = tag;
      await saveDb();
      broadcastPing("topics", { action: "tagChanged", topicId: topic.id });
      sendJson(res, 200, { topic: viewTopic(topic, user) });
      return;
    }
  }

  /* ---- 处理申请 ---- */
  if (p1 === "applications" && parts.length === 4 && (parts[3] === "approve" || parts[3] === "reject") && m === "POST") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const app = db.applications.find((a) => a.id === part(2));
    if (!app) { sendJson(res, 404, { error: "申请不存在" }); return; }
    const topic = findTopic(app.topicId);
    if (!topic) { sendJson(res, 404, { error: "话题已不存在" }); return; }
    if (!isOwner(topic, user)) { auditDenied(user, topic, "applications:decide"); sendJson(res, 403, { error: "只有项目负责人才能处理申请" }); return; }
    if (app.status !== "pending") { sendJson(res, 400, { error: "该申请已经处理过了" }); return; }
    if (parts[3] === "approve") {
      if (topic.members.length >= topic.limit) { sendJson(res, 400, { error: "项目已满员，无法再加入成员" }); return; }
      const applicant = db.users[app.userId];
      if (!applicant) { sendJson(res, 404, { error: "申请人账号不存在" }); return; }
      if (!isMember(topic, applicant.id)) {
        topic.members.push({ id: applicant.id, nickname: applicant.nickname, grade: applicant.grade, tag: "" });
      }
      app.status = "approved";
    } else {
      app.status = "rejected";
    }
    app.decidedAt = Date.now();
    await saveDb();
    notify(app.userId, {
      type: parts[3] === "approve" ? "approved" : "rejected",
      topicId: topic.id,
      topicTitle: topic.title,
      from: topic.members[0] ? topic.members[0].nickname : "负责人",
      text: parts[3] === "approve" ? "已同意你加入项目，快去聊聊吧" : "这次暂时没有通过，可以换个项目再试试"
    });
    broadcastPing("topics", { action: "memberChanged", topicId: topic.id });
    sseHub.sendToUsers([topic.creatorId, app.userId], "applications", { action: parts[3], applicationId: app.id, topicId: topic.id });
    sendJson(res, 200, { application: app, topic: viewTopic(topic, user) });
    return;
  }

  /* ---- 下载 / 查看组内文件 ---- */
  if (p1 === "files" && parts.length === 3 && m === "GET") {
    const fileId = part(2);
    let meta = null;
    Object.keys(db.files).forEach((tid) => {
      (db.files[tid] || []).forEach((f) => { if (f.id === fileId) meta = f; });
    });
    if (!meta) { sendJson(res, 404, { error: "文件不存在" }); return; }
    if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
    const topic = findTopic(meta.topicId);
    if (!topic || (!isMember(topic, user.id) && user.role !== "admin")) { auditDenied(user, topic, "files:download"); sendJson(res, 403, { error: "只有话题成员才能查看文件" }); return; }
    const buffer = await storage.readFile(meta.storedName);
    if (!buffer) { sendJson(res, 404, { error: "文件已丢失" }); return; }
    /* 图片可内联预览；Word 等文档强制下载，避免被浏览器当作内容渲染 */
    const isImage = String(meta.type || "").indexOf("image/") === 0;
    const dlHeaders = {
      "Content-Type": meta.type || "application/octet-stream",
      "Content-Disposition": (isImage ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(meta.name),
      "Cache-Control": "private, no-store"
    };
    SEC.applySecurityHeaders(res, dlHeaders, req);
    res.writeHead(200, dlHeaders);
    res.end(buffer);
    return;
  }

  sendJson(res, 404, { error: "接口不存在" });
}

function isSixDigits(s) { return typeof s === "string" && s.length === 6 && /^[0-9]{6}$/.test(s); }
/* ---------- 启动：先加载持久化数据，再开放 HTTP 服务 ---------- */
async function bootstrap() {
  storage = await STORAGE.createStorage({
    root: ROOT,
    dataDir: DATA_DIR,
    dataFile: DATA_FILE,
    filesDir: FILES_DIR,
    production: IS_PROD,
    env: process.env
  });
  storageReady = true;
  const loaded = await storage.loadState();
  db = normalizeDb(loaded || emptyDb());
  if (storage.migratedFromLegacy) {
    audit.log("state_migrated_to_postgres", { result: "ok" });
    console.log("[STORAGE] 已将本地 JSON 数据迁移到 PostgreSQL；原文件保留用于回滚。");
  }
  await migrateSessionTokens();
  await migrateTopicPasswords();
  await migrateLocalFilesToStorage();
  if (ROTATE_ADMIN) {
    await ensureAdmin({ rotate: true });
    await flushDb();
    await storage.close();
    console.log("管理员密码已更新（出于安全考虑不会在日志中显示密码）。");
    process.exit(0);
  }
  await ensureAdmin();
  server.listen(PORT, () => {
    console.log("ProjectHub 已启动： http://localhost:" + PORT);
    console.log("存储驱动：" + storage.driver + (storage.persistent ? "（持久化）" : "（仅开发/测试）"));
  });
}

bootstrap().catch(async (e) => {
  console.error("[FATAL] ProjectHub 启动失败：" + (e && e.message));
  try { if (storage) await storage.close(); } catch (e2) {}
  process.exit(1);
});
