"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCHEMA_VERSION = 1;
const SAFE_FILE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

function assertFileKey(key) {
  const value = String(key || "");
  if (!SAFE_FILE_KEY.test(value) || value.includes("..")) throw new Error("非法的文件存储键");
  return value;
}

function readJsonFile(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("数据文件根节点必须是对象");
    return parsed;
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
}

function atomicWriteFile(target, data) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = target + ".tmp-" + process.pid + "-" + crypto.randomBytes(4).toString("hex");
  let fd = null;
  try {
    fd = fs.openSync(tmp, "w", 0o600);
    fs.writeFileSync(fd, data);
    try { fs.fsyncSync(fd); } catch (e) {}
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, target);
  } catch (e) {
    try { if (fd !== null) fs.closeSync(fd); } catch (e2) {}
    try { fs.unlinkSync(tmp); } catch (e2) {}
    throw e;
  }
}

class FileStore {
  constructor(options) {
    this.driver = "file";
    this.persistent = false;
    this.dataDir = options.dataDir;
    this.dataFile = options.dataFile;
    this.filesDir = options.filesDir;
    this.lastSnapshotDay = "";
    this.migratedFromLegacy = false;
  }

  async init() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.filesDir, { recursive: true });
  }

  async loadState() {
    return readJsonFile(this.dataFile);
  }

  async saveState(state) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.dataFile)) {
      try { fs.copyFileSync(this.dataFile, this.dataFile + ".bak"); } catch (e) {}
    }
    atomicWriteFile(this.dataFile, JSON.stringify(state, null, 2));
    this.snapshotDaily();
  }

  snapshotDaily() {
    try {
      const day = new Date().toISOString().slice(0, 10);
      if (day === this.lastSnapshotDay) return;
      this.lastSnapshotDay = day;
      const dir = path.join(this.dataDir, "backups");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(this.dataFile, path.join(dir, "store-" + day + ".json"));
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
      while (files.length > 7) {
        const old = files.shift();
        try { fs.unlinkSync(path.join(dir, old)); } catch (e) {}
      }
    } catch (e) {}
  }

  filePath(key) {
    return path.join(this.filesDir, assertFileKey(key));
  }

  async saveFile(key, buffer) {
    fs.mkdirSync(this.filesDir, { recursive: true });
    atomicWriteFile(this.filePath(key), buffer);
  }

  async readFile(key) {
    try { return fs.readFileSync(this.filePath(key)); }
    catch (e) { if (e && e.code === "ENOENT") return null; throw e; }
  }

  async fileExists(key) {
    try { return fs.statSync(this.filePath(key)).isFile(); }
    catch (e) { return false; }
  }

  async deleteFile(key) {
    try { fs.unlinkSync(this.filePath(key)); }
    catch (e) { if (!e || e.code !== "ENOENT") throw e; }
  }

  async health() {
    fs.accessSync(this.dataDir, fs.constants.R_OK | fs.constants.W_OK);
    fs.accessSync(this.filesDir, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, driver: this.driver, persistent: false };
  }

  async stats() {
    const state = await this.loadState();
    let fileCount = 0, fileBytes = 0;
    try {
      for (const name of fs.readdirSync(this.filesDir)) {
        const stat = fs.statSync(path.join(this.filesDir, name));
        if (stat.isFile()) { fileCount += 1; fileBytes += stat.size; }
      }
    } catch (e) {}
    return { driver: this.driver, persistent: this.persistent, fileCount: fileCount, fileBytes: fileBytes, state: state || null };
  }

  async close() {}
}

class PostgresStore {
  constructor(options) {
    this.driver = "postgres";
    this.persistent = true;
    this.connectionString = options.connectionString;
    this.legacyDataFile = options.legacyDataFile;
    this.filesDir = options.filesDir;
    this.pool = options.pool || null;
    this.ownsPool = !options.pool;
    this.migratedFromLegacy = false;
  }

  async init() {
    if (!this.pool) {
      const { Pool } = require("pg");
      const sslSetting = String(process.env.DATABASE_SSL || "").toLowerCase();
      const ssl = sslSetting === "require" ? { rejectUnauthorized: false } : (sslSetting === "verify-full" ? true : false);
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: ssl,
        max: Math.max(1, Math.min(10, parseInt(process.env.DATABASE_POOL_MAX, 10) || 5)),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projecthub_state (
        id smallint PRIMARY KEY CHECK (id = 1),
        schema_version integer NOT NULL,
        state jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projecthub_file_blobs (
        key text PRIMARY KEY,
        content bytea NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async loadState() {
    const result = await this.pool.query("SELECT state, schema_version, updated_at FROM projecthub_state WHERE id = 1");
    if (result.rows && result.rows[0]) {
      const state = result.rows[0].state;
      if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("PostgreSQL 中的 state 不是对象");
      return state;
    }
    const legacy = readJsonFile(this.legacyDataFile);
    if (!legacy) return null;
    await this.saveState(legacy);
    this.migratedFromLegacy = true;
    return legacy;
  }

  async saveState(state) {
    const serialized = JSON.stringify(state);
    await this.pool.query(
      `INSERT INTO projecthub_state (id, schema_version, state, updated_at)
       VALUES (1, $1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET schema_version = EXCLUDED.schema_version,
           state = EXCLUDED.state,
           updated_at = now()`,
      [SCHEMA_VERSION, serialized]
    );
  }

  async saveFile(key, buffer) {
    await this.pool.query(
      `INSERT INTO projecthub_file_blobs (key, content, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
      [assertFileKey(key), buffer]
    );
  }

  async readFile(key) {
    const result = await this.pool.query("SELECT content FROM projecthub_file_blobs WHERE key = $1", [assertFileKey(key)]);
    if (!result.rows || !result.rows[0]) return null;
    const value = result.rows[0].content;
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  }

  async fileExists(key) {
    const result = await this.pool.query("SELECT 1 AS ok FROM projecthub_file_blobs WHERE key = $1", [assertFileKey(key)]);
    return !!(result.rows && result.rows[0]);
  }

  async deleteFile(key) {
    await this.pool.query("DELETE FROM projecthub_file_blobs WHERE key = $1", [assertFileKey(key)]);
  }

  async migrateLocalFile(key, localPath) {
    if (await this.fileExists(key)) return false;
    try {
      const buffer = fs.readFileSync(localPath);
      await this.saveFile(key, buffer);
      return true;
    } catch (e) {
      if (e && e.code === "ENOENT") return false;
      throw e;
    }
  }

  async health() {
    const result = await this.pool.query("SELECT 1 AS ok");
    return { ok: !!(result.rows && result.rows[0]), driver: this.driver, persistent: true };
  }

  async stats() {
    const stateResult = await this.pool.query("SELECT state FROM projecthub_state WHERE id = 1");
    const fileResult = await this.pool.query("SELECT count(*)::int AS count, coalesce(sum(octet_length(content)), 0)::bigint AS bytes FROM projecthub_file_blobs");
    return {
      driver: this.driver,
      persistent: this.persistent,
      fileCount: fileResult.rows && fileResult.rows[0] ? Number(fileResult.rows[0].count || 0) : 0,
      fileBytes: fileResult.rows && fileResult.rows[0] ? Number(fileResult.rows[0].bytes || 0) : 0,
      state: stateResult.rows && stateResult.rows[0] ? stateResult.rows[0].state : null
    };
  }

  async close() {
    if (this.pool && this.ownsPool) await this.pool.end();
  }
}

async function createStorage(options) {
  const env = options.env || process.env;
  const requested = String(env.STORAGE_DRIVER || "auto").toLowerCase();
  const hasDatabase = !!String(env.DATABASE_URL || "").trim();
  const driver = requested === "auto" ? (hasDatabase ? "postgres" : "file") : requested;

  if (driver === "postgres") {
    if (!hasDatabase) throw new Error("STORAGE_DRIVER=postgres 时必须配置 DATABASE_URL");
    const store = new PostgresStore({
      connectionString: env.DATABASE_URL,
      legacyDataFile: options.dataFile,
      filesDir: options.filesDir
    });
    await store.init();
    return store;
  }
  if (driver !== "file") throw new Error("不支持的 STORAGE_DRIVER：" + driver);
  if (options.production && env.ALLOW_EPHEMERAL_STORAGE !== "1") {
    throw new Error("生产环境拒绝使用临时文件存储。请配置 DATABASE_URL；仅在明确接受数据丢失风险时才设置 ALLOW_EPHEMERAL_STORAGE=1。");
  }
  const store = new FileStore(options);
  await store.init();
  return store;
}

module.exports = { SCHEMA_VERSION, FileStore, PostgresStore, createStorage, readJsonFile, atomicWriteFile };
