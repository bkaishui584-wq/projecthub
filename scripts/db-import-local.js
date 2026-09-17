"use strict";

const fs = require("fs");
const path = require("path");
const { createStorage } = require("../storage");
const { loadDotEnv } = require("./storage-common");

const ROOT = path.resolve(__dirname, "..");

function countUserContent(state) {
  const src = state || {};
  return {
    users: Object.keys(src.users || {}).length,
    topics: Array.isArray(src.topics) ? src.topics.length : 0,
    messages: Object.values(src.messages || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
    applications: Array.isArray(src.applications) ? src.applications.length : 0
  };
}

async function main() {
  loadDotEnv(ROOT);
  if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
  const localFile = path.join(dataDir, "store.json");
  if (!fs.existsSync(localFile)) throw new Error("找不到本地 data/store.json");
  const local = JSON.parse(fs.readFileSync(localFile, "utf8"));
  const store = await createStorage({
    root: ROOT,
    dataDir: dataDir,
    dataFile: localFile,
    filesDir: path.join(dataDir, "files"),
    production: process.env.NODE_ENV === "production",
    env: process.env
  });
  try {
    const remote = await store.loadState();
    const remoteCounts = countUserContent(remote);
    if (remoteCounts.topics || remoteCounts.messages || remoteCounts.applications) {
      throw new Error("远程数据库已有项目、消息或申请数据，拒绝自动导入；请改用人工迁移");
    }
    const remoteUsers = Object.values((remote && remote.users) || {}).filter((u) => u && typeof u === "object");
    const merged = JSON.parse(JSON.stringify(local));
    merged.users = merged.users && typeof merged.users === "object" ? merged.users : {};
    for (const key of Object.keys(merged.users)) {
      if (merged.users[key] && merged.users[key].role === "admin") delete merged.users[key];
    }
    for (const remoteUser of remoteUsers) {
      const nickname = String(remoteUser.nicknameLower || remoteUser.nickname || "").toLowerCase();
      for (const key of Object.keys(merged.users)) {
        const localName = String(merged.users[key].nicknameLower || merged.users[key].nickname || "").toLowerCase();
        if (nickname && localName === nickname) delete merged.users[key];
      }
      merged.users[remoteUser.id] = remoteUser;
    }
    merged.sessions = {};
    await store.saveState(merged);
    let filesMigrated = 0;
    if (typeof store.migrateLocalFile === "function") {
      const localFilesDir = path.join(dataDir, "files");
      for (const topicId of Object.keys(merged.files || {})) {
        for (const file of merged.files[topicId] || []) {
          if (await store.migrateLocalFile(file.storedName, path.join(localFilesDir, file.storedName))) filesMigrated += 1;
        }
      }
    }
    const counts = countUserContent(merged);
    console.log(JSON.stringify({ ok: true, users: Object.keys(merged.users || {}).length, topics: counts.topics, messages: counts.messages, applications: counts.applications, filesMigrated: filesMigrated }, null, 2));
  } finally {
    await store.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) }, null, 2));
  process.exit(1);
});
