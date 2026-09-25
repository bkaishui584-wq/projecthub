#!/usr/bin/env python3
"""Create rotating SQLite backups for ProjectHub.

This script only reads the configured SQLite database. It never copies .env,
upload directories, API keys, or other deployment secrets.
"""
from __future__ import annotations

import argparse
import os
from contextlib import closing
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv:
    load_dotenv(ROOT / ".env")


def path_from_env(name: str, default: str) -> Path:
    value = Path(os.environ.get(name, default)).expanduser()
    return value.resolve() if value.is_absolute() else (ROOT / value).resolve()


DATABASE_PATH = path_from_env("DATABASE_PATH", "./data/projecthub.sqlite3")
BACKUP_DIR = path_from_env("BACKUP_DIR", "./backups")
DEFAULT_KEEP = max(7, int(os.environ.get("BACKUP_KEEP", "7") or "7"))


def rotate_backups(backup_dir: Path, keep: int) -> None:
    backups = sorted(backup_dir.glob("projecthub-*.sqlite3"), key=lambda item: item.stat().st_mtime, reverse=True)
    for old in backups[keep:]:
        old.unlink()


def create_backup(source: Path = DATABASE_PATH, backup_dir: Path = BACKUP_DIR, keep: int = DEFAULT_KEEP) -> Path:
    source = source.resolve()
    if not source.is_file():
        raise FileNotFoundError(f"database not found: {source}")
    backup_dir.mkdir(parents=True, exist_ok=True)
    destination = backup_dir / ("projecthub-" + time.strftime("%Y%m%d-%H%M%S") + "-" + str(time.time_ns() % 1000000000).zfill(9) + ".sqlite3")

    with closing(sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)) as src, closing(sqlite3.connect(destination)) as dst:
        src.backup(dst)
        result = dst.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise RuntimeError(f"backup integrity check failed: {result!r}")

    rotate_backups(backup_dir, keep)
    return destination


def restore_backup(source: Path, destination: Path = DATABASE_PATH) -> Path:
    source = source.resolve(); destination = destination.resolve()
    if not source.is_file(): raise FileNotFoundError(f"backup not found: {source}")
    with closing(sqlite3.connect(source)) as source_db:
        result = source_db.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok": raise RuntimeError("backup integrity check failed")
        if destination.exists(): create_backup(destination, BACKUP_DIR)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(destination)) as destination_db:
            source_db.backup(destination_db)
            result = destination_db.execute("PRAGMA integrity_check").fetchone()
            if not result or result[0] != "ok": raise RuntimeError("restored database integrity check failed")
    return destination


def self_check() -> None:
    with tempfile.TemporaryDirectory(prefix="projecthub-backup-") as temp:
        root = Path(temp)
        source = root / "source.sqlite3"
        with closing(sqlite3.connect(source)) as db:
            db.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
            db.execute("INSERT INTO sample (name) VALUES (?)", ("ProjectHub",))
            db.commit()
        destination = create_backup(source, root / "backups", 7)
        with closing(sqlite3.connect(destination)) as db:
            value = db.execute("SELECT name FROM sample WHERE id = 1").fetchone()
        assert value == ("ProjectHub",)
        restored = restore_backup(destination, root / "restored.sqlite3")
        with closing(sqlite3.connect(restored)) as db:
            value = db.execute("SELECT name FROM sample WHERE id = 1").fetchone()
        assert value == ("ProjectHub",)
        assert (root / ".env").exists() is False
    print("backup self-check: ok")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a rotating ProjectHub SQLite backup")
    parser.add_argument("--check", action="store_true", help="run a temporary backup self-check")
    parser.add_argument("--keep", type=int, default=DEFAULT_KEEP, help="backups to keep (minimum 7)")
    parser.add_argument("--restore", metavar="BACKUP_FILE", help="restore a backup into DATABASE_PATH; stop the app first")
    args = parser.parse_args()
    if args.check:
        self_check()
        return 0
    if args.restore:
        try:
            destination = restore_backup(Path(args.restore))
        except (OSError, sqlite3.Error, RuntimeError) as exc:
            print(f"restore failed: {exc}", file=sys.stderr)
            return 1
        print(destination)
        return 0
    if args.keep < 7:
        parser.error("--keep must be at least 7")
    try:
        destination = create_backup(keep=args.keep)
    except (OSError, sqlite3.Error, RuntimeError) as exc:
        print(f"backup failed: {exc}", file=sys.stderr)
        return 1
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())