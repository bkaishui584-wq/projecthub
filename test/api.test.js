"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer(options) {
  const opts = options || {};
  const port = 20000 + Math.floor(Math.random() * 20000);
  const dataDir = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), "projecthub-api-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      NODE_ENV: "test",
      STORAGE_DRIVER: "file",
      ALLOW_EPHEMERAL_STORAGE: "1",
      DATA_DIR: dataDir,
      LOG_DIR: path.join(dataDir, "logs"),
      ADMIN_NICKNAME: "TestAdmin",
      ADMIN_PASSWORD: opts.adminPassword || "TestAdminPass123!",
      ALLOWED_ORIGINS: "",
      APPLICATION_REAPPLY_COOLDOWN_MS: "1000"
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("服务器启动超时\n" + output)), 10000);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (output.includes("ProjectHub 已启动")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("服务器提前退出：" + code + "\n" + output));
    });
  });
  await ready;
  return {
    baseUrl: "http://127.0.0.1:" + port + "/api",
    dataDir: dataDir,
    child: child,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      const exited = new Promise((resolve) => child.once("exit", resolve));
      await Promise.race([exited, wait(4000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  };
}

function runAdminRotation(dataDir, newPassword) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js", "--rotate-admin-password"], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        NODE_ENV: "test",
        STORAGE_DRIVER: "file",
        ALLOW_EPHEMERAL_STORAGE: "1",
        DATA_DIR: dataDir,
        LOG_DIR: path.join(dataDir, "logs"),
        ADMIN_NICKNAME: "TestAdmin",
        ADMIN_PASSWORD: newPassword,
        ALLOWED_ORIGINS: ""
      }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error("rotation failed " + code + String.fromCharCode(10) + output)));
  });
}

function createSession() {
  return { cookies: new Map(), csrf: "" };
}

function cookieHeader(session) {
  return Array.from(session.cookies.entries()).map(([key, value]) => key + "=" + value).join("; ");
}

async function request(server, session, route, options) {
  const opts = options || {};
  const headers = Object.assign({}, opts.headers || {});
  if (session && session.cookies.size) headers.Cookie = cookieHeader(session);
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (session && session.csrf && opts.method && opts.method !== "GET") headers["X-CSRF-Token"] = session.csrf;
  const res = await fetch(server.baseUrl + route, {
    method: opts.method || "GET",
    headers: headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store"
  });
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  if (session) {
    for (const line of setCookies) {
      const first = String(line).split(";")[0];
      const idx = first.indexOf("=");
      if (idx > 0) session.cookies.set(first.slice(0, idx), first.slice(idx + 1));
    }
  }
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (e) { body = { raw: text }; }
  if (session && body.csrf) session.csrf = body.csrf;
  return { status: res.status, body: body, headers: res.headers };
}

async function register(server, nickname, directions) {
  const session = createSession();
  const res = await request(server, session, "/register", {
    method: "POST",
    body: { nickname: nickname, password: "StrongPass123!", grade: "大一", directions: directions || ["m1"] }
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { session: session, user: res.body.user };
}

test("public topic projection does not expose private AI data", async (t) => {
  const server = await startServer();
  t.after(async () => { await server.stop(); fs.rmSync(server.dataDir, { recursive: true, force: true }); });
  const owner = await register(server, "负责人测试", ["m1", "m3"]);
  const persisted = JSON.parse(fs.readFileSync(path.join(server.dataDir, "store.json"), "utf8"));
  assert.equal(Object.values(persisted.sessions).every((x) => x.hashed === true), true);
  const created = await request(server, owner.session, "/topics", {
    method: "POST",
    body: { title: "私密AI投影测试", desc: "私密简介", vibe: "私密氛围", directions: ["m1"], required: [], neededRoles: ["技术成员"], type: "private", limit: 6, password: "123456" }
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  await request(server, owner.session, "/topics/" + created.body.topic.id + "/ai/toggle", { method: "POST", body: { enabled: true } });

  const publicList = await request(server, null, "/topics");
  assert.equal(publicList.status, 200);
  const topic = publicList.body.topics.find((x) => x.id === created.body.topic.id);
  assert.ok(topic);
  assert.equal(Object.prototype.hasOwnProperty.call(topic, "ai"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(topic, "draft"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(topic, "options"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(topic, "deep"), false);
  assert.equal(topic.desc, "");
  assert.equal(topic.vibe, "");
  assert.equal(topic.aiEnabled, true);
});

test("a project owner cannot recall another member's message", async (t) => {
  const server = await startServer();
  t.after(async () => { await server.stop(); fs.rmSync(server.dataDir, { recursive: true, force: true }); });
  const owner = await register(server, "负责人撤回测试", ["m1"]);
  const member = await register(server, "成员撤回测试", ["m1"]);
  const created = await request(server, owner.session, "/topics", {
    method: "POST",
    body: { title: "撤回权限测试", desc: "测试申请与撤回", vibe: "友好", directions: ["m1"], required: ["m1"], neededRoles: ["技术成员"], type: "public", limit: 6 }
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const topicId = created.body.topic.id;

  const firstApply = await request(server, member.session, "/topics/" + topicId + "/applications", { method: "POST", body: { message: "申请加入" } });
  assert.equal(firstApply.status, 200);
  const duplicateApply = await request(server, member.session, "/topics/" + topicId + "/applications", { method: "POST", body: { message: "重复申请" } });
  assert.equal(duplicateApply.status, 200);
  assert.equal(duplicateApply.body.duplicated, true);

  const cancelled = await request(server, member.session, "/topics/" + topicId + "/applications", { method: "DELETE" });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  const cooledDown = await request(server, member.session, "/topics/" + topicId + "/applications", { method: "POST", body: { message: "冷却期内申请" } });
  assert.equal(cooledDown.status, 429, JSON.stringify(cooledDown.body));
  await wait(1100);
  const reapplied = await request(server, member.session, "/topics/" + topicId + "/applications", { method: "POST", body: { message: "重新申请" } });
  assert.equal(reapplied.status, 200, JSON.stringify(reapplied.body));

  const inbox = await request(server, owner.session, "/inbox");
  assert.equal(inbox.status, 200);
  const application = inbox.body.applications.find((x) => x.topicId === topicId && x.userId === member.user.id);
  assert.ok(application);
  const approved = await request(server, owner.session, "/applications/" + application.id + "/approve", { method: "POST", body: {} });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));

  const sent = await request(server, member.session, "/topics/" + topicId + "/messages", { method: "POST", body: { text: "这是成员消息", clientId: "client-message-1" } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const messageId = sent.body.message.id;
  const duplicateSend = await request(server, member.session, "/topics/" + topicId + "/messages", { method: "POST", body: { text: "这是成员消息", clientId: "client-message-1" } });
  assert.equal(duplicateSend.status, 200);
  assert.equal(duplicateSend.body.duplicated, true);
  assert.equal(duplicateSend.body.message.id, messageId);

  const ownerEdit = await request(server, owner.session, "/topics/" + topicId + "/messages/" + messageId, { method: "PATCH", body: { text: "负责人不能编辑" } });
  assert.equal(ownerEdit.status, 403);
  const authorEdit = await request(server, member.session, "/topics/" + topicId + "/messages/" + messageId, { method: "PATCH", body: { text: "成员修改后的消息" } });
  assert.equal(authorEdit.status, 200, JSON.stringify(authorEdit.body));
  assert.equal(authorEdit.body.message.edited, true);

  const ownerRecall = await request(server, owner.session, "/topics/" + topicId + "/messages/" + messageId, { method: "DELETE" });
  assert.equal(ownerRecall.status, 403);
  const authorRecall = await request(server, member.session, "/topics/" + topicId + "/messages/" + messageId, { method: "DELETE" });
  assert.equal(authorRecall.status, 200);
});


test("object-level permissions reject forged IDs", async (t) => {
  const server = await startServer();
  t.after(async () => { await server.stop(); fs.rmSync(server.dataDir, { recursive: true, force: true }); });
  const owner = await register(server, "权限负责人", ["m1"]);
  const other = await register(server, "越权测试用户", ["m1"]);
  const created = await request(server, owner.session, "/topics", {
    method: "POST",
    body: { title: "越权测试项目", desc: "私密项目", vibe: "正常", directions: ["m1"], required: [], neededRoles: ["技术成员"], type: "private", limit: 6, password: "123456" }
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const topicId = created.body.topic.id;

  assert.equal((await request(server, other.session, "/topics/" + topicId + "/messages")).status, 403);
  assert.equal((await request(server, other.session, "/topics/" + topicId, { method: "DELETE" })).status, 403);
  assert.equal((await request(server, other.session, "/admin/users")).status, 403);

  const application = await request(server, other.session, "/topics/" + topicId + "/applications", { method: "POST", body: { password: "123456", message: "申请" } });
  assert.equal(application.status, 200, JSON.stringify(application.body));
  assert.equal((await request(server, other.session, "/applications/" + application.body.application.id + "/approve", { method: "POST", body: {} })).status, 403);

  const upload = await request(server, owner.session, "/topics/" + topicId + "/files", {
    method: "POST",
    body: { name: "tiny.png", data: "iVBORw0KGgo=" }
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  assert.equal((await request(server, other.session, "/files/" + upload.body.file.id)).status, 403);
  assert.equal((await request(server, owner.session, "/files/" + upload.body.file.id)).status, 200);
});


test("file-backed state survives a simulated instance restart", async (t) => {
  const first = await startServer();
  const owner = await register(first, "重启持久化用户", ["m1"]);
  const created = await request(first, owner.session, "/topics", {
    method: "POST",
    body: { title: "重启持久化项目", desc: "验证重启", vibe: "正常", directions: ["m1"], required: ["m1"], neededRoles: ["技术成员"], type: "public", limit: 6 }
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const dataDir = first.dataDir;
  await first.stop();
  const second = await startServer({ dataDir: dataDir });
  t.after(async () => { await second.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const list = await request(second, null, "/topics");
  assert.equal(list.status, 200);
  assert.ok(list.body.topics.some((x) => x.title === "重启持久化项目"));
});


test("admin password rotation invalidates the old credential", async (t) => {
  const oldPassword = "OldAdminPass123!";
  const newPassword = "NewAdminPass456!";
  const first = await startServer({ adminPassword: oldPassword });
  const dataDir = first.dataDir;
  await first.stop();
  await runAdminRotation(dataDir, newPassword);
  const second = await startServer({ dataDir: dataDir, adminPassword: newPassword });
  t.after(async () => { await second.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const oldLogin = await request(second, createSession(), "/login", { method: "POST", body: { nickname: "TestAdmin", password: oldPassword } });
  assert.equal(oldLogin.status, 401);
  const newLogin = await request(second, createSession(), "/login", { method: "POST", body: { nickname: "TestAdmin", password: newPassword } });
  assert.equal(newLogin.status, 200, JSON.stringify(newLogin.body));
});


test("notifications track unread state and member limits are enforced", async (t) => {
  const server = await startServer();
  t.after(async () => { await server.stop(); fs.rmSync(server.dataDir, { recursive: true, force: true }); });
  const owner = await register(server, "通知负责人", ["m1"]);
  const member1 = await register(server, "通知成员一", ["m1"]);
  const member2 = await register(server, "通知成员二", ["m1"]);
  const created = await request(server, owner.session, "/topics", {
    method: "POST",
    body: { title: "通知与人数上限测试", desc: "测试", vibe: "正常", directions: ["m1"], required: ["m1"], neededRoles: ["技术成员"], type: "public", limit: 2 }
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const topicId = created.body.topic.id;

  const apply1 = await request(server, member1.session, "/topics/" + topicId + "/applications", { method: "POST", body: { message: "申请一" } });
  assert.equal(apply1.status, 200);
  let notices = await request(server, owner.session, "/notifications");
  assert.ok(notices.body.unread >= 1);
  const marked = await request(server, owner.session, "/notifications/read", { method: "POST", body: { all: true } });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.unread, 0);

  const approve = await request(server, owner.session, "/applications/" + apply1.body.application.id + "/approve", { method: "POST", body: {} });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  notices = await request(server, member1.session, "/notifications");
  assert.ok(notices.body.unread >= 1);

  const fullApply = await request(server, member2.session, "/topics/" + topicId + "/applications", { method: "POST", body: { message: "申请二" } });
  assert.equal(fullApply.status, 400);
  assert.match(fullApply.body.error, /满员/);
});


test("request hardening rejects malformed bodies, unsafe paths and disallowed origins", async (t) => {
  const server = await startServer();
  t.after(async () => { await server.stop(); fs.rmSync(server.dataDir, { recursive: true, force: true }); });
  const arrayBody = await request(server, createSession(), "/register", { method: "POST", body: [] });
  assert.equal(arrayBody.status, 400);
  const unsafePath = await request(server, null, "/%2e%2e/.env");
  assert.equal(unsafePath.status, 404);
  const badOrigin = await request(server, createSession(), "/login", { method: "POST", headers: { Origin: "https://evil.example" }, body: { nickname: "x", password: "StrongPass123!" } });
  assert.equal(badOrigin.status, 403);
});
