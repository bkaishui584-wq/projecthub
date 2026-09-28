"""ProjectHub Python storage layer.

The state document stays JSON-compatible with the original Node version, while
SQLite provides transactional persistence and revision-based optimistic
locking for multiple processes/workers.
"""
from __future__ import annotations

import copy
import contextlib
from contextlib import contextmanager
import json
import os
import re
import sqlite3

try:
    import psycopg
except ImportError:  # pragma: no cover - only used without PostgreSQL enabled
    psycopg = None
import threading
import time
from pathlib import Path
from typing import Any, Callable


def empty_state() -> dict[str, Any]:
    return {
        "users": {},
        "sessions": {},
        "topics": [],
        "messages": {},
        "applications": [],
        "files": {},
        "notifications": {},
        "reports": [],
        "announcements": [],
        "announcementReads": {},
        "penalties": [],
        "appeals": [],
        "auditLogs": [],
        "security": {"csrf_secret": ""},
    }


def normalize_state(value: Any) -> dict[str, Any]:
    base = empty_state()
    src = value if isinstance(value, dict) else {}
    return {
        "users": src.get("users") if isinstance(src.get("users"), dict) else base["users"],
        "sessions": src.get("sessions") if isinstance(src.get("sessions"), dict) else base["sessions"],
        "topics": src.get("topics") if isinstance(src.get("topics"), list) else base["topics"],
        "messages": src.get("messages") if isinstance(src.get("messages"), dict) else base["messages"],
        "applications": src.get("applications") if isinstance(src.get("applications"), list) else base["applications"],
        "files": src.get("files") if isinstance(src.get("files"), dict) else base["files"],
        "notifications": src.get("notifications") if isinstance(src.get("notifications"), dict) else base["notifications"],
        "reports": src.get("reports") if isinstance(src.get("reports"), list) else base["reports"],
        "announcements": src.get("announcements") if isinstance(src.get("announcements"), list) else base["announcements"],
        "announcementReads": src.get("announcementReads") if isinstance(src.get("announcementReads"), dict) else base["announcementReads"],
        "penalties": src.get("penalties") if isinstance(src.get("penalties"), list) else base["penalties"],
        "appeals": src.get("appeals") if isinstance(src.get("appeals"), list) else base["appeals"],
        "auditLogs": src.get("auditLogs") if isinstance(src.get("auditLogs"), list) else base["auditLogs"],
        "security": src.get("security") if isinstance(src.get("security"), dict) else base["security"],
    }


class StateConflictError(RuntimeError):
    pass


class StateManager:
    def __init__(self, db_path: str | os.PathLike[str], legacy_file: str | os.PathLike[str]) -> None:
        self.db_path = str(db_path)
        self.legacy_file = str(legacy_file)
        self.lock = threading.RLock()
        self.revision = 0
        self.state: dict[str, Any] = empty_state()
        self._has_row = False

    def connect(self) -> sqlite3.Connection:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=NORMAL")
        return db

    @contextmanager
    def connection(self):
        db = self.connect()
        try:
            yield db
            db.commit()
        finally:
            db.close()

    def init(self) -> None:
        with self.connection() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS projecthub_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    state TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projecthub_file_blobs (
                    key TEXT PRIMARY KEY,
                    content BLOB NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projecthub_rate_limits (
                    key TEXT PRIMARY KEY,
                    count INTEGER NOT NULL,
                    reset_at REAL NOT NULL
                );
                """
            )
        self.load()

    def load(self) -> None:
        with self.lock:
            with self.connection() as db:
                row = db.execute("SELECT state, revision FROM projecthub_state WHERE id = 1").fetchone()
            if row:
                self.state = normalize_state(json.loads(row["state"]))
                self.revision = int(row["revision"])
                self._has_row = True
                return
            legacy = None
            if os.path.exists(self.legacy_file):
                try:
                    legacy = json.loads(Path(self.legacy_file).read_text(encoding="utf-8"))
                except Exception as exc:
                    raise RuntimeError(f"旧数据文件损坏，拒绝启动: {exc}") from exc
            self.state = normalize_state(legacy or empty_state())
            self.revision = 0
            self._has_row = False
            if legacy is not None:
                self.save_locked()

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return copy.deepcopy(self.state)

    def mutate(self, fn: Callable[[dict[str, Any]], Any]) -> Any:
        with self.lock:
            result = fn(self.state)
            self.save_locked()
            return result

    def save(self) -> None:
        with self.lock:
            self.save_locked()

    def save_locked(self) -> None:
        payload = json.dumps(self.state, ensure_ascii=False, separators=(",", ":"))
        with self.connection() as db:
            if not self._has_row:
                try:
                    db.execute(
                        "INSERT INTO projecthub_state (id, state, revision, updated_at) VALUES (1, ?, 1, ?)",
                        (payload, time.time()),
                    )
                    self.revision = 1
                    self._has_row = True
                    return
                except sqlite3.IntegrityError as exc:
                    raise StateConflictError("另一个实例已经初始化了数据库") from exc
            expected = self.revision
            cursor = db.execute(
                "UPDATE projecthub_state SET state = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?",
                (payload, time.time(), expected),
            )
            if cursor.rowcount != 1:
                row = db.execute("SELECT revision FROM projecthub_state WHERE id = 1").fetchone()
                self.revision = int(row["revision"]) if row else 0
                raise StateConflictError("数据已被另一个实例更新，当前写入已拒绝")
            self.revision = expected + 1

    def save_file(self, key: str, content: bytes) -> None:
        with self.connection() as db:
            db.execute(
                "INSERT INTO projecthub_file_blobs (key, content, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
                (key, sqlite3.Binary(content), time.time()),
            )

    def read_file(self, key: str) -> bytes | None:
        with self.connection() as db:
            row = db.execute("SELECT content FROM projecthub_file_blobs WHERE key = ?", (key,)).fetchone()
        return bytes(row["content"]) if row else None

    def delete_file(self, key: str) -> None:
        with self.connection() as db:
            db.execute("DELETE FROM projecthub_file_blobs WHERE key = ?", (key,))

    def consume_rate(self, key: str, limit: int, window_seconds: float) -> dict[str, Any]:
        now = time.time()
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT count, reset_at FROM projecthub_rate_limits WHERE key = ?", (key,)).fetchone()
            if row and float(row["reset_at"]) > now:
                count = int(row["count"]) + 1
                reset_at = float(row["reset_at"])
                db.execute("UPDATE projecthub_rate_limits SET count = ? WHERE key = ?", (count, key))
            else:
                count = 1
                reset_at = now + max(0.001, float(window_seconds))
                db.execute(
                    "INSERT INTO projecthub_rate_limits (key, count, reset_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at",
                    (key, count, reset_at),
                )
        return {
            "allowed": count <= int(limit),
            "remaining": max(0, int(limit) - count),
            "retry_after": max(1, int(reset_at - now + 0.999)),
        }

class PostgresStateManager(StateManager):
    """PostgreSQL-backed state store with the same transactional contract."""

    def __init__(self, database_url: str, legacy_file: str | os.PathLike[str]) -> None:
        super().__init__("", legacy_file)
        self.database_url = database_url
        self.sslmode = os.environ.get("DATABASE_SSL", "require") or "require"
        self.schema = os.environ.get("DB_SCHEMA", "public").strip() or "public"
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", self.schema):
            raise RuntimeError("DB_SCHEMA 只能包含字母、数字和下划线")
        self._schema_ready = False

    def connect(self):
        if psycopg is None:
            raise RuntimeError("PostgreSQL 依赖未安装")
        db = psycopg.connect(self.database_url, sslmode=self.sslmode)
        if self._schema_ready:
            with db.cursor() as cur:
                cur.execute(f'SET search_path TO "{self.schema}"')
        return db

    def init(self) -> None:
        with self.connection() as db:
            with db.cursor() as cur:
                cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{self.schema}"')
                cur.execute(f'SET search_path TO "{self.schema}"')
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS projecthub_state (
                        id SMALLINT PRIMARY KEY CHECK (id = 1),
                        schema_version INTEGER NOT NULL,
                        state JSONB NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        revision BIGINT NOT NULL DEFAULT 0
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS projecthub_file_blobs (
                        key TEXT PRIMARY KEY,
                        content BYTEA NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS projecthub_rate_limits (
                        key TEXT PRIMARY KEY,
                        count INTEGER NOT NULL,
                        reset_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cur.execute(
                    "INSERT INTO projecthub_state (id, schema_version, state, revision) VALUES (1, 1, %s::jsonb, 0) "
                    "ON CONFLICT (id) DO NOTHING",
                    ("{}",),
                )
        self._schema_ready = True
        self.load()

    def load(self) -> None:
        with self.lock:
            with self.connection() as db:
                with db.cursor() as cur:
                    cur.execute("SELECT state, revision FROM projecthub_state WHERE id = 1")
                    row = cur.fetchone()
            if row:
                raw_state = row[0]
                if isinstance(raw_state, str):
                    raw_state = json.loads(raw_state)
                self.state = normalize_state(raw_state)
                self.revision = int(row[1])
                self._has_row = True
                return
            self.state = normalize_state(empty_state())
            self.revision = 0
            self._has_row = False
            self.save_locked()

    def save_locked(self) -> None:
        payload = json.dumps(self.state, ensure_ascii=False, separators=(",", ":"))
        with self.connection() as db:
            with db.cursor() as cur:
                if not self._has_row:
                    cur.execute(
                        "INSERT INTO projecthub_state (id, schema_version, state, revision, updated_at) "
                        "VALUES (1, 1, %s::jsonb, 1, NOW()) ON CONFLICT (id) DO NOTHING",
                        (payload,),
                    )
                    if cur.rowcount != 1:
                        raise StateConflictError("另一个实例已经初始化了数据库")
                    self.revision = 1
                    self._has_row = True
                    return
                expected = self.revision
                cur.execute(
                    "UPDATE projecthub_state SET state = %s::jsonb, revision = revision + 1, updated_at = NOW() "
                    "WHERE id = 1 AND revision = %s",
                    (payload, expected),
                )
                if cur.rowcount != 1:
                    cur.execute("SELECT revision FROM projecthub_state WHERE id = 1")
                    row = cur.fetchone()
                    self.revision = int(row[0]) if row else 0
                    raise StateConflictError("数据已被另一个实例更新，当前写入已拒绝")
                self.revision = expected + 1

    def save_file(self, key: str, content: bytes) -> None:
        with self.connection() as db:
            with db.cursor() as cur:
                cur.execute(
                    "INSERT INTO projecthub_file_blobs (key, content, updated_at) VALUES (%s, %s, NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()",
                    (key, psycopg.Binary(content)),
                )

    def read_file(self, key: str) -> bytes | None:
        with self.connection() as db:
            with db.cursor() as cur:
                cur.execute("SELECT content FROM projecthub_file_blobs WHERE key = %s", (key,))
                row = cur.fetchone()
        return bytes(row[0]) if row else None

    def delete_file(self, key: str) -> None:
        with self.connection() as db:
            with db.cursor() as cur:
                cur.execute("DELETE FROM projecthub_file_blobs WHERE key = %s", (key,))

    def consume_rate(self, key: str, limit: int, window_seconds: float) -> dict[str, Any]:
        now = time.time()
        with self.connection() as db:
            with db.cursor() as cur:
                cur.execute(
                    "SELECT count, EXTRACT(EPOCH FROM reset_at) FROM projecthub_rate_limits WHERE key = %s FOR UPDATE",
                    (key,),
                )
                row = cur.fetchone()
                if row and float(row[1]) > now:
                    count = int(row[0]) + 1
                    reset_at = float(row[1])
                else:
                    count = 1
                    reset_at = now + max(0.001, float(window_seconds))
                cur.execute(
                    "INSERT INTO projecthub_rate_limits (key, count, reset_at) VALUES (%s, %s, TO_TIMESTAMP(%s)) "
                    "ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, reset_at = EXCLUDED.reset_at",
                    (key, count, reset_at),
                )
        return {
            "allowed": count <= int(limit),
            "remaining": max(0, int(limit) - count),
            "retry_after": max(1, int(reset_at - now + 0.999)),
        }
