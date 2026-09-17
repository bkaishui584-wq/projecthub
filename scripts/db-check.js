"use strict";

const path = require("path");
const { openStore, summarize } = require("./storage-common");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const store = await openStore(ROOT);
  try {
    const stats = await store.stats();
    console.log(JSON.stringify(Object.assign({ ok: true }, summarize(stats.state, stats)), null, 2));
  } finally {
    await store.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) }, null, 2));
  process.exit(1);
});
