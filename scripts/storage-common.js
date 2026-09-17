"use strict";

const fs = require("fs");
const path = require("path");
const { createStorage } = require("../storage");

function loadDotEnv(root) {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const idx = text.indexOf("=");
    if (idx < 0) continue;
    const key = text.slice(0, idx).trim();
    let value = text.slice(idx + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function dataDir(root) {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");
}

async function openStore(root) {
  loadDotEnv(root);
  const dir = dataDir(root);
  return createStorage({
    root: root,
    dataDir: dir,
    dataFile: path.join(dir, "store.json"),
    filesDir: path.join(dir, "files"),
    production: process.env.NODE_ENV === "production",
    env: process.env
  });
}

function countObject(value) {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}

function summarize(state, stats) {
  const src = state || {};
  const messages = Object.values(src.messages || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  return {
    driver: stats.driver,
    persistent: stats.persistent,
    users: countObject(src.users),
    topics: Array.isArray(src.topics) ? src.topics.length : 0,
    messages: messages,
    applications: Array.isArray(src.applications) ? src.applications.length : 0,
    notifications: countObject(src.notifications),
    fileBlobs: stats.fileCount,
    fileBytes: stats.fileBytes
  };
}

module.exports = { loadDotEnv, openStore, summarize };
