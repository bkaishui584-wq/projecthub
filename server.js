/* ProjectHub 多人协作服务器
 * 零依赖：只用 Node 内置模块。提供静态页面 + 账号系统 + 共享数据 API + SSE 实时同步。
 * 启动：node server.js   默认端口 8787（可用环境变量 PORT 覆盖）
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AI = require("./ai");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const FILES_DIR = path.join(DATA_DIR, "files");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PORT = process.env.PORT || 8787;
const MAX_BODY = 12 * 1024 * 1024;     // 约 12MB，够上传 5MB 文件（base64 会膨胀）
const MAX_FILE = 5 * 1024 * 1024;
const ALLOWED_FILE_EXT = [".doc", ".docx", ".jpg", ".jpeg", ".png"];
const ROLE_TAGS = ["项目策划", "技术成员", "设计成员", "文案/材料成员", "调研成员", "答辩成员"];

/* 管理员账号：默认值即当前使用的账号，生产环境请用环境变量覆盖 */
const ADMIN_NICKNAME = process.env.ADMIN_NICKNAME || "白开水";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "yunian240913";

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

let db = loadDb();
const sseClients = new Set();

function emptyDb() {
  return { users: {}, sessions: {}, topics: [], messages: {}, applications: [], files: {}, notifications: {} };
}

function loadDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const base = emptyDb();
    return {
      users: parsed.users || base.users,
      sessions: parsed.sessions || base.sessions,
      topics: Array.isArray(parsed.topics) ? parsed.topics : base.topics,
      messages: parsed.messages || base.messages,
      applications: Array.isArray(parsed.applications) ? parsed.applications : base.applications,
      files: parsed.files || base.files,
      notifications: parsed.notifications || base.notifications
    };
  } catch (e) {
    return emptyDb();
  }
}

function saveDb() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("保存数据失败：", e.message);
  }
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
function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  db.sessions[token] = { userId: userId, createdAt: Date.now() };
  return token;
}
function userByToken(token) {
  if (!token) return null;
  const s = db.sessions[token];
  if (!s) return null;
  return db.users[s.userId] || null;
}
function authUser(req, url) {
  let token = "";
  const header = req.headers["authorization"] || "";
  if (header.indexOf("Bearer ") === 0) token = header.slice(7).trim();
  if (!token && url && url.searchParams.get("token")) token = url.searchParams.get("token");
  return userByToken(token);
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
function ensureAdmin() {
  let admin = findUserByNickname(ADMIN_NICKNAME);
  if (!admin) {
    admin = createUser(ADMIN_NICKNAME, ADMIN_PASSWORD, "管理员", "admin");
  } else {
    admin.role = "admin";
    admin.banned = false;
    admin.nickname = ADMIN_NICKNAME;
    admin.nicknameLower = ADMIN_NICKNAME.toLowerCase();
    admin.salt = makeSalt();
    admin.hash = hashPassword(ADMIN_PASSWORD, admin.salt);
  }
  saveDb();
  return admin;
}

function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

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
  broadcast("notify", { userId: userId, notification: item });
  return item;
}
function notifyOthers(topic, exceptUserId, payload) {
  topic.members.forEach((m) => { if (m.id !== exceptUserId) notify(m.id, payload); });
}

/* ---------- SSE ---------- */
function broadcast(event, data) {
  const payload = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  for (const res of sseClients) {
    try { res.write(payload); } catch (e) { sseClients.delete(res); }
  }
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,PATCH,OPTIONS"
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) { tooLarge = true; req.destroy(); }
    });
    req.on("end", () => {
      if (tooLarge) return resolve({});
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

/* ---------- 数据视图 ---------- */
function publicTopic(topic) {
  const copy = Object.assign({}, topic);
  delete copy.password;
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
  return { enabled: false, status: "idle", rounds: 0, draft: "", options: [], announcement: null, deep: null, source: "local", model: "本地演示模式", updatedAt: 0 };
}
function ensureAi(topic) {
  if (!topic.ai || typeof topic.ai !== "object") topic.ai = defaultAi();
  if (!Array.isArray(topic.ai.options)) topic.ai.options = [];
  if (typeof topic.ai.rounds !== "number") topic.ai.rounds = 0;
  return topic.ai;
}
function aiView(topic, user) {
  const ai = ensureAi(topic);
  const base = { enabled: !!ai.enabled, status: ai.status || "idle", rounds: ai.rounds || 0, config: AI.publicConfig() };
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
  } else {
    ai.status = "decided";
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

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const target = path.normalize(path.join(ROOT, pathname));
  if (!target.startsWith(ROOT) || target.indexOf(DATA_DIR) === 0) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60"
    });
    fs.createReadStream(target).pipe(res);
  });
}

ensureAdmin();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  if (url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("retry: 2000\n\n");
    res.write("event: hello\ndata: {}\n\n");
    sseClients.add(res);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch (e) {} }, 20000);
    req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
    return;
  }
  if (url.pathname.indexOf("/api/") === 0) {
    try { await handleApi(req, res, url); }
    catch (e) { console.error(e); sendJson(res, 500, { error: "服务器内部错误" }); }
    return;
  }
  serveStatic(req, res, url);
});

AI.resolveConfig(true).catch(() => {});
setInterval(() => { AI.resolveConfig(true).catch(() => {}); }, 60000);

server.listen(PORT, () => {
  console.log("ProjectHub 已启动： http://localhost:" + PORT);
  console.log("数据文件： " + DATA_FILE);
  console.log("管理员账号： " + ADMIN_NICKNAME);
});

/* ================= API ================= */
function viewTopic(topic, user) {
  const copy = topicSummary(topic);
  ensureAi(topic);
  copy.aiEnabled = !!topic.ai.enabled;
  copy.aiRounds = topic.ai.rounds || 0;
  if (!isOwner(topic, user)) {
    delete copy.code;
    delete copy.pendingApplications;
  }
  return copy;
}

function removeTopicData(topicId) {
  const metas = db.files[topicId] || [];
  metas.forEach((f) => {
    try { fs.unlinkSync(path.join(FILES_DIR, f.storedName)); } catch (e) {}
  });
  delete db.files[topicId];
  delete db.messages[topicId];
  db.topics = db.topics.filter((t) => t.id !== topicId);
  db.applications = db.applications.filter((a) => a.topicId !== topicId);
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const m = req.method || "GET";
  const p1 = parts[1] || "";
  const user = authUser(req, url);

  if (m === "OPTIONS") { sendJson(res, 204, {}); return; }

  /* ---- 健康检查 ---- */
  if (p1 === "health" && m === "GET") {
    sendJson(res, 200, { ok: true, topics: db.topics.length, users: Object.keys(db.users).length, applications: db.applications.filter((a) => a.status === "pending").length });
    return;
  }

  /* ---- AI 配置信息 ---- */
  if (p1 === "ai" && parts[2] === "config" && m === "GET") {
    await AI.resolveConfig();
    sendJson(res, 200, { config: AI.publicConfig() });
    return;
  }

  /* ---- 注册 ---- */
  if (p1 === "register" && m === "POST") {
    const body = await readBody(req);
    const nickname = String(body.nickname || "").trim();
    const password = String(body.password || "");
    const grade = String(body.grade || "").trim();
    const directions = Array.isArray(body.directions) ? body.directions.filter((x) => typeof x === "string").slice(0, 5) : [];
    if (nickname.length < 2 || nickname.length > 16) { sendJson(res, 400, { error: "昵称需要 2-16 个字符" }); return; }
    if (password.length < 6) { sendJson(res, 400, { error: "密码至少需要 6 位" }); return; }
    if (!grade) { sendJson(res, 400, { error: "请选择大学几年级" }); return; }
    if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) { sendJson(res, 403, { error: "该昵称不可使用" }); return; }
    if (findUserByNickname(nickname)) { sendJson(res, 409, { error: "该昵称已被注册，请直接登录" }); return; }
    const u = createUser(nickname, password, grade, "user", directions);
    const token = createSession(u.id);
    saveDb();
    sendJson(res, 200, { token: token, user: publicUser(u) });
    return;
  }

  /* ---- 登录 ---- */
  if (p1 === "login" && m === "POST") {
    const body = await readBody(req);
    const nickname = String(body.nickname || "").trim();
    const password = String(body.password || "");
    const u = findUserByNickname(nickname);
    if (!u || !verifyPassword(u, password)) { sendJson(res, 401, { error: "昵称或密码不正确" }); return; }
    if (u.banned) { sendJson(res, 403, { error: "该账号已被管理员封禁" }); return; }
    const token = createSession(u.id);
    saveDb();
    sendJson(res, 200, { token: token, user: publicUser(u) });
    return;
  }

  /* ---- 退出 ---- */
  if (p1 === "logout" && m === "POST") {
    const header = req.headers["authorization"] || "";
    const token = header.indexOf("Bearer ") === 0 ? header.slice(7).trim() : (url.searchParams.get("token") || "");
    if (token && db.sessions[token]) { delete db.sessions[token]; saveDb(); }
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
    if (Array.isArray(body.directions)) user.directions = body.directions.filter((x) => typeof x === "string").slice(0, 5);
    if (typeof body.grade === "string" && body.grade) user.grade = body.grade.slice(0, 12);
    saveDb();
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
    const directions = Array.isArray(body.directions) ? body.directions.filter((x) => typeof x === "string").slice(0, 5) : [];
    const required = Array.isArray(body.required) ? body.required.filter((x) => typeof x === "string").slice(0, 5) : [];
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
      password: type === "private" ? password : "",
      limit: limit,
      members: [{ id: user.id, nickname: user.nickname, grade: user.grade, tag: "" }],
      ai: defaultAi(),
      createdAt: Date.now()
    };
    db.topics.unshift(topic);
    db.messages[topic.id] = [];
    db.files[topic.id] = [];
    saveDb();
    broadcast("topics", { action: "created", topicId: topic.id });
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
    const list = db.applications.filter((a) => a.userId === user.id).map((a) => ({ topicId: a.topicId, status: a.status, at: a.createdAt }));
    sendJson(res, 200, { applications: list });
    return;
  }

  /* ---- 站内通知 ---- */
  if (p1 === "notifications" && parts.length === 2 && m === "GET") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const list = db.notifications[user.id] || [];
    sendJson(res, 200, { notifications: list.slice(0, 60), unread: list.filter((n) => !n.read).length });
    return;
  }
  if (p1 === "notifications" && parts[2] === "read" && m === "POST") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const body = await readBody(req);
    const list = db.notifications[user.id] || [];
    list.forEach((n) => {
      if (body.all || (Array.isArray(body.ids) && body.ids.indexOf(n.id) >= 0)) n.read = true;
    });
    saveDb();
    sendJson(res, 200, { ok: true, unread: list.filter((n) => !n.read).length });
    return;
  }

  /* ---- 管理员 ---- */
  if (p1 === "admin" && parts[2] === "users" && parts.length === 3 && m === "GET") {
    if (!user || user.role !== "admin") { sendJson(res, 403, { error: "需要管理员权限" }); return; }
    const users = Object.keys(db.users).map((k) => {
      const u = db.users[k];
      return Object.assign(publicUser(u), { topicCount: db.topics.filter((t) => t.creatorId === u.id).length });
    }).sort((a, b) => a.createdAt - b.createdAt);
    sendJson(res, 200, { users: users });
    return;
  }
  if (p1 === "admin" && parts[2] === "users" && parts[4] === "ban" && m === "POST") {
    if (!user || user.role !== "admin") { sendJson(res, 403, { error: "需要管理员权限" }); return; }
    const target = db.users[parts[3]];
    if (!target) { sendJson(res, 404, { error: "用户不存在" }); return; }
    if (target.role === "admin") { sendJson(res, 403, { error: "不能封禁管理员账号" }); return; }
    const body = await readBody(req);
    target.banned = !!body.banned;
    if (target.banned) {
      Object.keys(db.sessions).forEach((tok) => { if (db.sessions[tok].userId === target.id) delete db.sessions[tok]; });
    }
    saveDb();
    sendJson(res, 200, { user: publicUser(target) });
    return;
  }

  /* ---- 话题内的操作 ---- */
  if (p1 === "topics" && parts.length >= 3) {
    const topic = findTopic(decodeURIComponent(parts[2]));
    if (!topic) { sendJson(res, 404, { error: "话题不存在" }); return; }
    const action = parts[3] || "";

    if (!action && m === "GET") { sendJson(res, 200, { topic: viewTopic(topic, user) }); return; }

    if (!action && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人或管理员才能删除该项目" }); return; }
      removeTopicData(topic.id);
      saveDb();
      broadcast("topics", { action: "deleted", topicId: topic.id });
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
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能设置 AI 助手" }); return; }
      const body = await readBody(req);
      const ai = ensureAi(topic);
      ai.enabled = !!body.enabled;
      if (!ai.enabled) { ai.status = "idle"; ai.options = []; }
      ai.updatedAt = Date.now();
      saveDb();
      broadcast("ai", { topicId: topic.id });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "think" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能让 AI 开始思考" }); return; }
      const ai = ensureAi(topic);
      if (!ai.enabled) { sendJson(res, 400, { error: "还没有引入 AI 助手" }); return; }
      if (ai.status === "thinking") { sendJson(res, 400, { error: "AI 正在思考中，请稍等" }); return; }
      await AI.resolveConfig();
      ai.status = "thinking";
      ai.draft = "";
      ai.options = [];
      ai.updatedAt = Date.now();
      saveDb();
      broadcast("ai", { topicId: topic.id });
      const msgs = db.messages[topic.id] || [];
      try {
        const draftRes = await AI.generateDraft(topic, msgs);
        const dirRes = await AI.generateDirections(topic, msgs, draftRes.draft);
        ai.draft = draftRes.draft || "";
        ai.source = draftRes.source;
        ai.model = draftRes.model;
        ai.options = (dirRes.directions || []).slice(0, 4).map((d, i) => ({
          id: "o" + (i + 1),
          title: String(d.title || ("方向 " + (i + 1))),
          desc: String(d.desc || ""),
          reason: String(d.reason || ""),
          votes: []
        }));
        ai.options.push({ id: "rethink", title: "再想想", desc: "这些方向都不太符合预期，想继续和组员讨论。", reason: "", votes: [] });
        ai.status = "voting";
      } catch (e) {
        console.error("[AI] 思考失败：", e.message);
        ai.status = "idle";
      }
      ai.updatedAt = Date.now();
      saveDb();
      broadcast("ai", { topicId: topic.id });
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
      saveDb();
      broadcast("ai", { topicId: topic.id });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "close" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能结束投票" }); return; }
      const ai = ensureAi(topic);
      if (ai.status !== "voting") { sendJson(res, 400, { error: "现在不在投票阶段" }); return; }
      closeVoting(topic);
      saveDb();
      broadcast("ai", { topicId: topic.id });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    if (action === "ai" && parts.length === 5 && parts[4] === "deep" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能发起深度分工" }); return; }
      const ai = ensureAi(topic);
      if (!ai.enabled) { sendJson(res, 400, { error: "还没有引入 AI 助手" }); return; }
      if ((ai.rounds || 0) < 3) { sendJson(res, 400, { error: "需要先完成 3 轮以上的思考与投票" }); return; }
      await AI.resolveConfig();
      ai.status = "thinking";
      ai.updatedAt = Date.now();
      saveDb();
      broadcast("ai", { topicId: topic.id });
      const msgs = db.messages[topic.id] || [];
      try {
        const deepRes = await AI.generateDeepPlan(topic, msgs, ai.draft);
        ai.deep = { at: Date.now(), items: deepRes.items, source: deepRes.source, model: deepRes.model };
        ai.status = "assigned";
      } catch (e) {
        console.error("[AI] 深度思考失败：", e.message);
        ai.status = "decided";
      }
      ai.updatedAt = Date.now();
      saveDb();
      broadcast("ai", { topicId: topic.id });
      sendJson(res, 200, { ai: aiView(topic, user) });
      return;
    }

    /* 申请加入 */
    if (action === "applications" && parts.length === 4 && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "请先登录再申请加入" }); return; }
      if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
      if (isMember(topic, user.id)) { sendJson(res, 400, { error: "你已经是该话题成员" }); return; }
      if (topic.members.length >= topic.limit) { sendJson(res, 400, { error: "该项目已经满员" }); return; }
      const existing = db.applications.find((a) => a.topicId === topic.id && a.userId === user.id && a.status === "pending");
      if (existing) { sendJson(res, 200, { application: existing, duplicated: true }); return; }
      const body = await readBody(req);
      if (topic.type === "private") {
        if (!isSixDigits(String(body.password || "")) || String(body.password) !== topic.password) {
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
      saveDb();
      notify(topic.creatorId, { type: "apply", topicId: topic.id, topicTitle: topic.title, from: user.nickname, text: "申请加入你的项目" + (app.message ? "：" + app.message.slice(0, 40) : "") });
      broadcast("applications", { action: "created", applicationId: app.id, topicId: topic.id });
      sendJson(res, 200, { application: app });
      return;
    }

    /* 负责人查看某个话题的申请 */
    if (action === "applications" && parts.length === 4 && m === "GET") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能查看申请" }); return; }
      const list = db.applications.filter((a) => a.topicId === topic.id).sort((a, b) => b.createdAt - a.createdAt);
      sendJson(res, 200, { applications: list });
      return;
    }

    /* 聊天记录 */
    if (action === "messages" && m === "GET") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") { sendJson(res, 403, { error: "只有话题成员才能查看聊天" }); return; }
      sendJson(res, 200, { messages: db.messages[topic.id] || [] });
      return;
    }
    if (action === "messages" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") { sendJson(res, 403, { error: "只有话题成员才能发言" }); return; }
      if (user.banned) { sendJson(res, 403, { error: "该账号已被封禁" }); return; }
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

      const message = {
        id: newId("m"), author: user.id, authorName: user.nickname, text: text,
        replyTo: replyTo, mentions: [], recalled: false, time: nowTimeStr(), at: Date.now()
      };

      /* @ 成员 */
      const mentioned = topic.members.filter((m) => m.id !== user.id && m.nickname && text.indexOf("@" + m.nickname) >= 0);
      message.mentions = mentioned.map((m) => m.id);

      if (!db.messages[topic.id]) db.messages[topic.id] = [];
      db.messages[topic.id].push(message);
      saveDb();

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

      broadcast("message", { topicId: topic.id, message: message });
      sendJson(res, 200, { message: message });
      return;
    }

    /* 撤回消息：作者本人或负责人 / 管理员 */
    if (action === "messages" && parts.length === 5 && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      const msgId = decodeURIComponent(parts[4]);
      const list = db.messages[topic.id] || [];
      const msg = list.find((x) => x.id === msgId);
      if (!msg) { sendJson(res, 404, { error: "消息不存在" }); return; }
      const mine = msg.author === user.id;
      if (!mine && !isOwner(topic, user)) { sendJson(res, 403, { error: "只能撤回自己发送的消息" }); return; }
      if (!msg.recalled) {
        msg.recalled = true;
        msg.recalledAt = Date.now();
        msg.recalledBy = mine ? "自己" : "负责人";
        msg.text = "";
        msg.mentions = [];
        saveDb();
        broadcast("message", { topicId: topic.id, message: msg });
      }
      sendJson(res, 200, { message: msg });
      return;
    }

    /* 组内文件 */
    if (action === "files" && m === "GET") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") { sendJson(res, 403, { error: "只有话题成员才能查看文件" }); return; }
      sendJson(res, 200, { files: (db.files[topic.id] || []).map((f) => Object.assign({}, f, { url: "api/files/" + f.id })) });
      return;
    }
    if (action === "files" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isMember(topic, user.id) && user.role !== "admin") { sendJson(res, 403, { error: "只有话题成员才能上传文件" }); return; }
      const body = await readBody(req);
      const name = String(body.name || "").trim().slice(0, 80);
      const ext = path.extname(name).toLowerCase();
      const data = String(body.data || "");
      if (ALLOWED_FILE_EXT.indexOf(ext) < 0) { sendJson(res, 400, { error: "只支持 Word 文档和 jpg / png 图片" }); return; }
      if (!data) { sendJson(res, 400, { error: "文件内容为空" }); return; }
      let buffer;
      try { buffer = Buffer.from(data, "base64"); } catch (e) { sendJson(res, 400, { error: "文件解析失败" }); return; }
      if (buffer.length > MAX_FILE) { sendJson(res, 400, { error: "文件不能超过 5MB" }); return; }
      fs.mkdirSync(FILES_DIR, { recursive: true });
      const fileId = newId("f");
      const storedName = fileId + ext;
      fs.writeFileSync(path.join(FILES_DIR, storedName), buffer);
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
      saveDb();
      notifyOthers(topic, user.id, { type: "file", topicId: topic.id, topicTitle: topic.title, from: user.nickname, text: "上传了文件：" + name });
      broadcast("files", { topicId: topic.id });
      sendJson(res, 200, { file: Object.assign({}, meta, { url: "api/files/" + fileId }) });
      return;
    }

    /* 删除组内文件：上传者本人或负责人 / 管理员 */
    if (action === "files" && parts.length === 5 && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      const fileId = decodeURIComponent(parts[4]);
      const list = db.files[topic.id] || [];
      const idx = list.findIndex((f) => f.id === fileId);
      if (idx < 0) { sendJson(res, 404, { error: "文件不存在" }); return; }
      const meta = list[idx];
      const mine = meta.uploaderId === user.id;
      if (!mine && !isOwner(topic, user)) { sendJson(res, 403, { error: "只能删除自己上传的文件" }); return; }
      try { fs.unlinkSync(path.join(FILES_DIR, meta.storedName)); } catch (e) {}
      list.splice(idx, 1);
      saveDb();
      broadcast("files", { topicId: topic.id });
      sendJson(res, 200, { ok: true });
      return;
    }

    /* 成员标签 / 移出成员 */
    if (action === "members" && parts.length === 5 && m === "DELETE") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能移出成员" }); return; }
      const memberId = decodeURIComponent(parts[4]);
      if (memberId === topic.creatorId) { sendJson(res, 400, { error: "不能移出项目负责人" }); return; }
      if (!isMember(topic, memberId)) { sendJson(res, 404, { error: "该成员不在话题中" }); return; }
      topic.members = topic.members.filter((x) => x.id !== memberId);
      saveDb();
      notify(memberId, { type: "removed", topicId: topic.id, topicTitle: topic.title, from: topic.members[0] ? topic.members[0].nickname : "负责人", text: "你已被移出该项目" });
      broadcast("topics", { action: "memberRemoved", topicId: topic.id });
      sendJson(res, 200, { topic: viewTopic(topic, user) });
      return;
    }
    if (action === "members" && parts.length === 6 && parts[5] === "tag" && m === "POST") {
      if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
      if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能设置标签" }); return; }
      const memberId = decodeURIComponent(parts[4]);
      const member = topic.members.find((x) => x.id === memberId);
      if (!member) { sendJson(res, 404, { error: "该成员不在话题中" }); return; }
      const body = await readBody(req);
      const tag = String(body.tag || "");
      if (tag && ROLE_TAGS.indexOf(tag) < 0) { sendJson(res, 400, { error: "标签不合法" }); return; }
      member.tag = tag;
      saveDb();
      broadcast("topics", { action: "tagChanged", topicId: topic.id });
      sendJson(res, 200, { topic: viewTopic(topic, user) });
      return;
    }
  }

  /* ---- 处理申请 ---- */
  if (p1 === "applications" && parts.length === 4 && (parts[3] === "approve" || parts[3] === "reject") && m === "POST") {
    if (!user) { sendJson(res, 401, { error: "未登录" }); return; }
    const app = db.applications.find((a) => a.id === decodeURIComponent(parts[2]));
    if (!app) { sendJson(res, 404, { error: "申请不存在" }); return; }
    const topic = findTopic(app.topicId);
    if (!topic) { sendJson(res, 404, { error: "话题已不存在" }); return; }
    if (!isOwner(topic, user)) { sendJson(res, 403, { error: "只有项目负责人才能处理申请" }); return; }
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
    saveDb();
    notify(app.userId, {
      type: parts[3] === "approve" ? "approved" : "rejected",
      topicId: topic.id,
      topicTitle: topic.title,
      from: topic.members[0] ? topic.members[0].nickname : "负责人",
      text: parts[3] === "approve" ? "已同意你加入项目，快去聊聊吧" : "这次暂时没有通过，可以换个项目再试试"
    });
    broadcast("topics", { action: "memberChanged", topicId: topic.id });
    broadcast("applications", { action: parts[3], applicationId: app.id, topicId: topic.id });
    sendJson(res, 200, { application: app, topic: viewTopic(topic, user) });
    return;
  }

  /* ---- 下载 / 查看组内文件 ---- */
  if (p1 === "files" && parts.length === 3 && m === "GET") {
    const fileId = decodeURIComponent(parts[2]);
    let meta = null;
    Object.keys(db.files).forEach((tid) => {
      (db.files[tid] || []).forEach((f) => { if (f.id === fileId) meta = f; });
    });
    if (!meta) { sendJson(res, 404, { error: "文件不存在" }); return; }
    if (!user) { sendJson(res, 401, { error: "请先登录" }); return; }
    const topic = findTopic(meta.topicId);
    if (!topic || (!isMember(topic, user.id) && user.role !== "admin")) { sendJson(res, 403, { error: "只有话题成员才能查看文件" }); return; }
    const target = path.join(FILES_DIR, meta.storedName);
    if (!fs.existsSync(target)) { sendJson(res, 404, { error: "文件已丢失" }); return; }
    res.writeHead(200, {
      "Content-Type": meta.type || "application/octet-stream",
      "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(meta.name),
      "Cache-Control": "private, max-age=60"
    });
    fs.createReadStream(target).pipe(res);
    return;
  }

  sendJson(res, 404, { error: "接口不存在" });
}

function isSixDigits(s) { return typeof s === "string" && s.length === 6 && /^[0-9]{6}$/.test(s); }
function nowTimeStr() { return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }
