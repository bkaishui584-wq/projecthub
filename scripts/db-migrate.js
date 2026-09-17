"use strict";

const path = require("path");
const { openStore, summarize } = require("./storage-common");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const store = await openStore(ROOT);
  try {
    const state = await store.loadState();
    const stateMigrated = !!store.migratedFromLegacy;
    let filesMigrated = 0;
    if (state && state.files && typeof store.migrateLocalFile === "function") {
      for (const topicId of Object.keys(state.files)) {
        for (const file of state.files[topicId] || []) {
          const localPath = path.join(store.filesDir || path.join(ROOT, "data", "files"), file.storedName);
          if (await store.migrateLocalFile(file.storedName, localPath)) filesMigrated += 1;
        }
      }
    }
    const stats = await store.stats();
    console.log(JSON.stringify(Object.assign({ ok: true, stateMigrated: stateMigrated, filesMigrated: filesMigrated }, summarize(stats.state, stats)), null, 2));
  } finally {
    await store.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) }, null, 2));
  process.exit(1);
});
