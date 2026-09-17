"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { FileStore, PostgresStore, atomicWriteFile, createStorage } = require("../storage");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "projecthub-storage-"));
}

class FakePool {
  constructor() {
    this.stateRow = null;
    this.blobs = new Map();
    this.ended = false;
  }
  async query(text, params) {
    const sql = String(text).replace(/\s+/g, " ").trim();
    if (sql.startsWith("CREATE TABLE")) return { rows: [] };
    if (sql.startsWith("INSERT INTO projecthub_state")) {
      this.stateRow = { state: JSON.parse(params[1]), schema_version: params[0] };
      return { rows: [] };
    }
    if (sql.startsWith("SELECT state, schema_version")) {
      return { rows: this.stateRow ? [this.stateRow] : [] };
    }
    if (sql.startsWith("SELECT state FROM projecthub_state")) {
      return { rows: this.stateRow ? [{ state: this.stateRow.state }] : [] };
    }
    if (sql.startsWith("SELECT count(*)::int")) {
      let bytes = 0;
      for (const value of this.blobs.values()) bytes += value.length;
      return { rows: [{ count: this.blobs.size, bytes: bytes }] };
    }
    if (sql.startsWith("INSERT INTO projecthub_file_blobs")) {
      this.blobs.set(params[0], Buffer.from(params[1]));
      return { rows: [] };
    }
    if (sql.startsWith("SELECT content FROM projecthub_file_blobs")) {
      return { rows: this.blobs.has(params[0]) ? [{ content: this.blobs.get(params[0]) }] : [] };
    }
    if (sql.startsWith("SELECT 1 AS ok FROM projecthub_file_blobs")) {
      return { rows: this.blobs.has(params[0]) ? [{ ok: 1 }] : [] };
    }
    if (sql.startsWith("DELETE FROM projecthub_file_blobs")) {
      this.blobs.delete(params[0]);
      return { rows: [] };
    }
    if (sql.startsWith("SELECT 1 AS ok")) return { rows: [{ ok: 1 }] };
    throw new Error("Unexpected SQL in test: " + sql);
  }
  async end() { this.ended = true; }
}

test("FileStore persists state and creates a previous-version backup", async () => {
  const dir = tempDir();
  try {
    const store = new FileStore({ dataDir: dir, dataFile: path.join(dir, "store.json"), filesDir: path.join(dir, "files") });
    await store.init();
    await store.saveState({ topics: [], version: 1 });
    await store.saveState({ topics: [{ id: "t1" }], version: 2 });
    const loaded = await store.loadState();
    assert.equal(loaded.version, 2);
    const backup = JSON.parse(fs.readFileSync(path.join(dir, "store.json.bak"), "utf8"));
    assert.equal(backup.version, 1);
    await store.saveFile("f1.txt", Buffer.from("hello"));
    assert.equal((await store.readFile("f1.txt")).toString(), "hello");
    await store.deleteFile("f1.txt");
    assert.equal(await store.readFile("f1.txt"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("FileStore rejects traversal-like file keys", async () => {
  const dir = tempDir();
  try {
    const store = new FileStore({ dataDir: dir, dataFile: path.join(dir, "store.json"), filesDir: path.join(dir, "files") });
    await store.init();
    await assert.rejects(() => store.saveFile("../escape", Buffer.from("x")), /非法的文件存储键/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PostgresStore reads and writes state and file blobs through parameterized queries", async () => {
  const dir = tempDir();
  try {
    const pool = new FakePool();
    const store = new PostgresStore({ pool: pool, legacyDataFile: path.join(dir, "missing.json"), filesDir: path.join(dir, "files") });
    await store.init();
    assert.equal(await store.loadState(), null);
    await store.saveState({ users: { u1: { id: "u1" } }, topics: [] });
    assert.equal((await store.loadState()).users.u1.id, "u1");
    await store.saveFile("f1.docx", Buffer.from("zip-bytes"));
    assert.equal((await store.readFile("f1.docx")).toString(), "zip-bytes");
    assert.equal(await store.fileExists("f1.docx"), true);
    await store.deleteFile("f1.docx");
    assert.equal(await store.fileExists("f1.docx"), false);
    assert.equal((await store.health()).ok, true);
    const stats = await store.stats();
    assert.equal(stats.fileCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PostgresStore imports legacy JSON once when the database is empty", async () => {
  const dir = tempDir();
  try {
    const legacy = path.join(dir, "store.json");
    atomicWriteFile(legacy, JSON.stringify({ users: { u1: { id: "u1" } }, topics: [] }));
    const pool = new FakePool();
    const store = new PostgresStore({ pool: pool, legacyDataFile: legacy, filesDir: path.join(dir, "files") });
    await store.init();
    const loaded = await store.loadState();
    assert.equal(loaded.users.u1.id, "u1");
    assert.equal(store.migratedFromLegacy, true);
    assert.equal((await store.loadState()).users.u1.id, "u1");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test("production refuses implicit file storage", async () => {
  const dir = tempDir();
  try {
    await assert.rejects(() => createStorage({
      production: true,
      dataDir: dir,
      dataFile: path.join(dir, "store.json"),
      filesDir: path.join(dir, "files"),
      env: { STORAGE_DRIVER: "auto" }
    }), /生产环境拒绝使用临时文件存储/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
