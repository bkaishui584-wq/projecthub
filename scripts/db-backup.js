"use strict";

const fs = require("fs");
const path = require("path");
const { openStore } = require("./storage-common");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const store = await openStore(ROOT);
  try {
    const state = await store.loadState();
    if (!state) throw new Error("没有可备份的数据");
    const files = [];
    for (const topicId of Object.keys(state.files || {})) {
      for (const meta of state.files[topicId] || []) {
        const buffer = await store.readFile(meta.storedName);
        if (!buffer) continue;
        files.push({
          key: meta.storedName,
          id: meta.id,
          topicId: topicId,
          name: meta.name,
          type: meta.type,
          size: buffer.length,
          dataBase64: buffer.toString("base64")
        });
      }
    }
    const outDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, "backups");
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outFile = path.join(outDir, "projecthub-backup-" + stamp + ".json");
    const payload = { format: "projecthub-backup-v1", createdAt: new Date().toISOString(), state: state, files: files };
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
    console.log(JSON.stringify({ ok: true, file: outFile, users: Object.keys(state.users || {}).length, topics: (state.topics || []).length, files: files.length }, null, 2));
  } finally {
    await store.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) }, null, 2));
  process.exit(1);
});
