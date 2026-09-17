/* ProjectHub 基础安全边界（零依赖）
 * 提供：可配置资源上限、限流、并发闸门、请求体与 JSON 校验、安全解码、
 *       安全响应头、审计日志、SSE 连接管理。
 * 所有阈值均可通过环境变量覆盖，默认值取"够用但不过分宽松"。
 */
"use strict";

const fs = require("fs");
const path = require("path");

function intEnv(name, def, min, max) {
  const v = parseInt(process.env[name], 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

const LIMITS = {
  /* 请求体 */
  maxBodyBytes: intEnv("MAX_BODY_BYTES", 8 * 1024 * 1024, 1024, 64 * 1024 * 1024),
  requestTimeoutMs: intEnv("REQUEST_TIMEOUT_MS", 30000, 1000, 600000),
  aiTimeoutMs: intEnv("AI_TIMEOUT_MS", 120000, 5000, 600000),
  /* JSON 结构 */
  maxJsonDepth: intEnv("MAX_JSON_DEPTH", 8, 2, 32),
  maxJsonArray: intEnv("MAX_JSON_ARRAY", 200, 1, 5000),
  maxJsonKeys: intEnv("MAX_JSON_KEYS", 100, 1, 2000),
  maxJsonString: intEnv("MAX_JSON_STRING", 2000, 32, 200000),
  /* 上传 */
  maxFileBytes: intEnv("MAX_FILE_BYTES", 5 * 1024 * 1024, 1024, 20 * 1024 * 1024),
  maxFilesPerTopic: intEnv("MAX_FILES_PER_TOPIC", 200, 1, 5000),
  maxStoragePerUser: intEnv("MAX_STORAGE_PER_USER", 50 * 1024 * 1024, 1024, 1024 * 1024 * 1024),
  maxStorageGlobal: intEnv("MAX_STORAGE_GLOBAL", 1024 * 1024 * 1024, 1024 * 1024, 20 * 1024 * 1024 * 1024),
  /* 并发 */
  maxInflightGlobal: intEnv("MAX_INFLIGHT_GLOBAL", 200, 10, 5000),
  maxInflightPerIp: intEnv("MAX_INFLIGHT_PER_IP", 20, 1, 1000),
  /* SSE */
  maxSseTotal: intEnv("MAX_SSE_TOTAL", 200, 1, 10000),
  maxSsePerIp: intEnv("MAX_SSE_PER_IP", 5, 1, 200),
  sseIdleMs: intEnv("SSE_IDLE_MS", 30 * 60 * 1000, 60000, 24 * 3600 * 1000),
  sseTicketTtlMs: intEnv("SSE_TICKET_TTL_MS", 60000, 5000, 300000),
  /* 限流（次数 / 窗口毫秒） */
  loginPerIp: intEnv("RATE_LOGIN_IP", 10, 1, 1000),
  loginPerAccount: intEnv("RATE_LOGIN_ACCOUNT", 5, 1, 1000),
  loginWindowMs: intEnv("RATE_LOGIN_WINDOW_MS", 15 * 60 * 1000, 10000, 3600000),
  registerPerIp: intEnv("RATE_REGISTER_IP", 5, 1, 1000),
  registerWindowMs: intEnv("RATE_REGISTER_WINDOW_MS", 60 * 60 * 1000, 10000, 24 * 3600000),
  apiPerIp: intEnv("RATE_API_IP", 300, 10, 100000),
  apiWindowMs: intEnv("RATE_API_WINDOW_MS", 60 * 1000, 1000, 3600000),
  messagePerUser: intEnv("RATE_MESSAGE_USER", 30, 1, 10000),
  messageWindowMs: intEnv("RATE_MESSAGE_WINDOW_MS", 60 * 1000, 1000, 3600000),
  uploadPerUser: intEnv("RATE_UPLOAD_USER", 10, 1, 1000),
  uploadWindowMs: intEnv("RATE_UPLOAD_WINDOW_MS", 10 * 60 * 1000, 10000, 24 * 3600000),
  aiPerTopic: intEnv("RATE_AI_TOPIC", 10, 1, 1000),
  aiWindowMs: intEnv("RATE_AI_WINDOW_MS", 60 * 60 * 1000, 10000, 24 * 3600000),
  applicationPerUser: intEnv("RATE_APPLICATION_USER", 10, 1, 1000),
  applicationWindowMs: intEnv("RATE_APPLICATION_WINDOW_MS", 60 * 60 * 1000, 10000, 24 * 3600000),
  applicationReapplyCooldownMs: intEnv("APPLICATION_REAPPLY_COOLDOWN_MS", 24 * 3600 * 1000, 0, 30 * 24 * 3600 * 1000),
  aiPerUser: intEnv("AI_DAILY_USER", 30, 1, 10000),
  aiPerGlobal: intEnv("AI_DAILY_GLOBAL", 500, 1, 100000),
  aiDailyWindowMs: 24 * 3600 * 1000,
  /* AI 并发 */
  maxAiConcurrent: intEnv("MAX_AI_CONCURRENT", 2, 1, 50),
  trustProxy: process.env.TRUST_PROXY === "1"
};

function clientIp(req) {
  if (LIMITS.trustProxy) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

/* ---------- 安全解码 ---------- */
function safeDecode(value) {
  if (typeof value !== "string") return null;
  try { return decodeURIComponent(value); } catch (e) { return null; }
}

/* ---------- 请求体读取 + JSON 结构与规模校验 ---------- */
function validateShape(value, opts, depth, keyName, seen) {
  if (depth > (opts.maxJsonDepth || LIMITS.maxJsonDepth)) return "JSON 嵌套层数过深";
  if (value === null) return null;
  const type = typeof value;
  if (type === "string") {
    const allowLarge = Array.isArray(opts.allowLargeStrings) && opts.allowLargeStrings.indexOf(keyName) >= 0;
    const limit = allowLarge ? (opts.maxLargeString || LIMITS.maxBodyBytes) : (opts.maxJsonString || LIMITS.maxJsonString);
    if (value.length > limit) return "字段内容过长：" + keyName;
    return null;
  }
  if (type === "number" || type === "boolean") return null;
  if (Array.isArray(value)) {
    if (value.length > (opts.maxJsonArray || LIMITS.maxJsonArray)) return "数组元素过多：" + keyName;
    for (let i = 0; i < value.length; i++) {
      const err = validateShape(value[i], opts, depth + 1, keyName, seen);
      if (err) return err;
    }
    return null;
  }
  if (type === "object") {
    if (seen.has(value)) return null;              // 防环（JSON.parse 不会产生环，仅作兜底）
    seen.add(value);
    const keys = Object.keys(value);
    if (keys.length > (opts.maxJsonKeys || LIMITS.maxJsonKeys)) return "对象字段过多：" + keyName;
    for (const k of keys) {
      const err = validateShape(value[k], opts, depth + 1, k, seen);
      if (err) return err;
    }
    return null;
  }
  return "不支持的字段类型";
}

function readJsonBody(req, opts) {
  opts = opts || {};
  const maxBytes = opts.maxBytes || LIMITS.maxBodyBytes;
  return new Promise((resolve) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared && declared > maxBytes) {
      req.resume();
      resolve({ ok: false, status: 413, error: "请求体过大" });
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("aborted", onAbort);
      clearTimeout(timer);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, status: 408, error: "读取请求体超时" });
      req.destroy();
    }, opts.timeoutMs || 15000);
    if (timer.unref) timer.unref();
    function onData(chunk) {
      size += chunk.length;
      if (size > maxBytes) {
        finish({ ok: false, status: 413, error: "请求体过大" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    }
    function onEnd() {
      if (size === 0) return finish({ ok: true, data: {} });
      let data;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (e) {
        return finish({ ok: false, status: 400, error: "请求体不是合法 JSON" });
      }
      if (data === null || typeof data !== "object" || Array.isArray(data)) return finish({ ok: false, status: 400, error: "请求体必须是 JSON 对象" });
      const shapeErr = validateShape(data, opts, 1, "root", new Set());
      if (shapeErr) return finish({ ok: false, status: 400, error: shapeErr });
      finish({ ok: true, data });
    }
    function onError() { finish({ ok: false, status: 400, error: "读取请求体失败" }); }
    function onAbort() { finish({ ok: false, status: 400, error: "请求已中断" }); }
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAbort);
  });
}

/* ---------- 滑动窗口限流 ---------- */
class RateLimiter {
  constructor() {
    this.buckets = new Map();
    const t = setInterval(() => this.sweep(), 60000);
    if (t.unref) t.unref();
  }
  consume(key, limit, windowMs) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      b = { start: now, count: 0 };
      this.buckets.set(key, b);
    }
    b.count += 1;
    const allowed = b.count <= limit;
    return { allowed, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((b.start + windowMs - now) / 1000)), remaining: Math.max(0, limit - b.count) };
  }
  reset(key) { this.buckets.delete(key); }
  sweep() {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (now - b.start > 24 * 3600 * 1000) this.buckets.delete(k);
    }
  }
}

/* ---------- 并发闸门 ---------- */
class Inflight {
  constructor(globalMax, perKeyMax) {
    this.globalMax = globalMax;
    this.perKeyMax = perKeyMax;
    this.total = 0;
    this.byKey = new Map();
  }
  enter(key) {
    const current = this.byKey.get(key) || 0;
    if (this.total >= this.globalMax) return { ok: false, reason: "服务器繁忙，请稍后重试" };
    if (current >= this.perKeyMax) return { ok: false, reason: "请求过于频繁，请稍后重试" };
    this.total += 1;
    this.byKey.set(key, current + 1);
    return { ok: true };
  }
  leave(key) {
    const current = this.byKey.get(key) || 0;
    if (current <= 1) this.byKey.delete(key); else this.byKey.set(key, current - 1);
    this.total = Math.max(0, this.total - 1);
  }
  get size() { return this.total; }
}

/* ---------- SSE 连接管理（按用户绑定 + 上限） ---------- */
class SseHub {
  constructor(maxTotal, maxPerIp) {
    this.maxTotal = maxTotal;
    this.maxPerIp = maxPerIp;
    this.conns = new Map();      // id -> { res, userId, ip, at }
    this.byIp = new Map();
    this.seq = 0;
  }
  add(res, userId, ip) {
    if (this.conns.size >= this.maxTotal) return { ok: false, reason: "实时连接已达上限" };
    const ipCount = this.byIp.get(ip) || 0;
    if (ipCount >= this.maxPerIp) return { ok: false, reason: "你的实时连接过多" };
    const id = "sse" + (++this.seq) + "-" + Math.random().toString(36).slice(2, 8);
    this.conns.set(id, { res: res, userId: userId, ip: ip, at: Date.now() });
    this.byIp.set(ip, ipCount + 1);
    return { ok: true, id: id };
  }
  remove(id) {
    const c = this.conns.get(id);
    if (!c) return;
    this.conns.delete(id);
    const ipCount = this.byIp.get(c.ip) || 0;
    if (ipCount <= 1) this.byIp.delete(c.ip); else this.byIp.set(c.ip, ipCount - 1);
  }
  count() { return this.conns.size; }
  sendToUsers(userIds, event, data) {
    const set = new Set(userIds);
    const payload = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
    for (const [id, c] of this.conns) {
      if (!set.has(c.userId)) continue;
      try { c.res.write(payload); } catch (e) { this.remove(id); }
    }
  }
  sendToAllAuthed(event, data) {
    const payload = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
    for (const [id, c] of this.conns) {
      if (!c.userId) continue;
      try { c.res.write(payload); } catch (e) { this.remove(id); }
    }
  }
}

/* ---------- 安全响应头（含 CSP，HTTPS 时附加 HSTS） ---------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join("; ");

function isSecureRequest(req) {
  if (!req) return false;
  try {
    if (req.socket && req.socket.encrypted) return true;
    const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    return proto === "https";
  } catch (e) { return false; }
}

function applySecurityHeaders(res, extra, req) {
  const headers = Object.assign({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": CSP
  }, extra || {});
  if (isSecureRequest(req)) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  Object.keys(headers).forEach((k) => { try { res.setHeader(k, headers[k]); } catch (e) {} });
}

/* ---------- 审计日志（脱敏，独立文件） ---------- */
function createAudit(file) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (e) {}
  let stream = null;
  function open() {
    try { stream = fs.createWriteStream(file, { flags: "a" }); } catch (e) { stream = null; }
  }
  function rotateIfNeeded() {
    try {
      const st = fs.statSync(file);
      if (st.size > 5 * 1024 * 1024) {
        if (stream) stream.end();
        fs.renameSync(file, file + "." + Date.now() + ".bak");
        open();
      }
    } catch (e) {}
  }
  open();
  const SAFE_KEYS = ["event", "actorId", "actorName", "target", "targetId", "ip", "result", "detail", "status", "topicId", "path"];
  return {
    log(event, fields) {
      const out = { ts: new Date().toISOString(), event: event };
      const src = fields || {};
      SAFE_KEYS.forEach((k) => { if (src[k] !== undefined) out[k] = src[k]; });
      try {
        if (!stream) open();
        stream.write(JSON.stringify(out) + "\n");
        rotateIfNeeded();
      } catch (e) {}
    },
    close() { try { if (stream) stream.end(); } catch (e) {} }
  };
}

module.exports = { LIMITS, CSP, clientIp, safeDecode, readJsonBody, validateShape, RateLimiter, Inflight, SseHub, applySecurityHeaders, isSecureRequest, createAudit };
