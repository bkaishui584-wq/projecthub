"use strict";

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { loadDotEnv } = require("./storage-common");

const ROOT = path.resolve(__dirname, "..");

function connectionOptions() {
  const mode = String(process.env.DATABASE_SSL || "").toLowerCase();
  const ssl = mode === "require" ? { rejectUnauthorized: false } : (mode === "verify-full" ? true : false);
  return { connectionString: process.env.DATABASE_URL, ssl };
}

function countRemoteUserContent(state) {
  return {
    users: Object.keys(state.users || {}).length,
    topics: Array.isArray(state.topics) ? state.topics.length : 0,
    messages: Object.values(state.messages || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
    applications: Array.isArray(state.applications) ? state.applications.length : 0
  };
}

async function main() {
  loadDotEnv(ROOT);
  if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
  const localFile = path.join(dataDir, "store.json");
  if (!fs.existsSync(localFile)) throw new Error("找不到本地 data/store.json");
  const local = JSON.parse(fs.readFileSync(localFile, "utf8"));
  const pool = new Pool(connectionOptions());
  try {
    const result = await pool.query("SELECT state FROM projecthub_state WHERE id = 1");
    const remote = result.rows && result.rows[0] ? result.rows[0].state : null;
    const remoteCounts = countRemoteUserContent(remote || {});
    if (remoteCounts.topics || remoteCounts.messages || remoteCounts.applications) {
      throw new Error("远程数据库已有项目、消息或申请数据，拒绝自动导入；请改用人工迁移");
    }
    const remoteAdmins = Object.values((remote && remote.users) || {}).filter((u) => u && u.role === "admin");
    if (remoteCounts.users > 1 || (remoteCounts.users === 1 && remoteAdmins.length !== 1)) {
      throw new Error("远程数据库已有非管理员用户，拒绝自动覆盖");
    }
    const merged = JSON.parse(JSON.stringify(local));
    merged.users = merged.users && typeof merged.users === "object" ? merged.users : {};
    for (const key of Object.keys(merged.users)) {
      if (merged.users[key] && merged.users[key].role === "admin") delete merged.users[key];
    }
    if (remoteAdmins[0]) merged.users[remoteAdmins[0].id] = remoteAdmins[0];
    merged.sessions = {};
    await pool.query(
      `INSERT INTO projecthub_state (id, schema_version, state, updated_at)
       VALUES (1, 1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET schema_version = 1, state = EXCLUDED.state, updated_at = now()`,
      [JSON.stringify(merged)]
    );
    const finalCounts = countRemoteUserContent(merged);
    console.log(JSON.stringify({ ok: true, importedUsers: Object.keys(merged.users || {}).length, topics: finalCounts.topics, messages: finalCounts.messages, applications: finalCounts.applications }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) }, null, 2));
  process.exit(1);
});
