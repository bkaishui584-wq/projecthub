from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import json
import mimetypes
import os
import queue
import secrets
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, make_response, request, send_from_directory, stream_with_context
from werkzeug.exceptions import HTTPException

import security as sec
from agent.integration.service import AgentService
from storage import PostgresStateManager, StateConflictError, StateManager, empty_state

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
os.environ.setdefault("PORT", "8787")
os.environ.setdefault("ADMIN_NICKNAME", "白开水")

def resolve_runtime_path(value: str | os.PathLike[str], default: Path) -> Path:
    path = Path(value).expanduser() if value else default
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve()


DATA_DIR = resolve_runtime_path(os.environ.get("DATA_DIR", ""), BASE_DIR / "data")
DATABASE_PATH = resolve_runtime_path(os.environ.get("DATABASE_PATH", ""), DATA_DIR / "projecthub.sqlite3")
LEGACY_STORE_PATH = resolve_runtime_path(os.environ.get("LEGACY_STORE_PATH", ""), DATA_DIR / "store.json")
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
STORAGE_DRIVER = os.environ.get("STORAGE_DRIVER", "auto").strip().lower()
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if DATABASE_URL and STORAGE_DRIVER in {"auto", "postgres", "postgresql"}:
    STATE = PostgresStateManager(DATABASE_URL, LEGACY_STORE_PATH)
else:
    STATE = StateManager(DATABASE_PATH, LEGACY_STORE_PATH)
STATE.init()
if sec.ensure_security(STATE.state):
    STATE.save()

AGENT_SERVICE = AgentService()

app = Flask(__name__, static_folder=str(BASE_DIR / "static"), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_CONTENT_LENGTH", 8 * 1024 * 1024))
app.config["JSON_AS_ASCII"] = False

ADMIN_NICKNAME = os.environ.get("ADMIN_NICKNAME", "白开水")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SESSION_TTL = 7 * 24 * 3600
SESSION_COOKIE = "ph_session"
CSRF_COOKIE = "ph_csrf"
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", 5 * 1024 * 1024))
MAX_STORAGE_PER_USER = int(os.environ.get("MAX_STORAGE_PER_USER", 50 * 1024 * 1024))
ROLE_TAGS = ["项目策划", "技术成员", "设计成员", "文案/材料成员", "调研成员", "答辩成员"]
PROJECT_STATUSES = {"recruiting", "formed", "active", "paused", "completed", "archived"}
PROJECT_TRANSITIONS = {
    "recruiting": {"formed", "archived"},
    "formed": {"active", "paused", "archived"},
    "active": {"paused", "completed", "archived"},
    "paused": {"active", "completed", "archived"},
    "completed": {"archived"},
    "archived": set(),
}
MAJOR_IDS = {f"m{i}" for i in range(1, 29)}
ALLOWED_FILE_EXT = {".doc", ".docx", ".jpg", ".jpeg", ".png"}
EXT_FAMILY = {".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".docx": "zip", ".doc": "ole"}
NOTIFICATION_TYPES = {
    "PROJECT_APPLICATION",
    "APPLICATION_ACCEPTED",
    "APPLICATION_REJECTED",
    "APPLICATION_CANCELLED",
    "NEW_MESSAGE",
    "MENTION",
    "FILE_UPLOADED",
    "PROJECT_UPDATE",
    "TASK_ASSIGNMENT",
    "MEMBER_REMOVED",
    "SYSTEM_NOTIFICATION",
    "REPORT_CREATED",
}

login_failures: dict[str, dict[str, Any]] = {}
login_lock = threading.RLock()


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:16]


def now_ms() -> int:
    return int(time.time() * 1000)


def public_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
    if not user:
        return None
    return {
        "id": user.get("id"),
        "nickname": user.get("nickname"),
        "grade": user.get("grade"),
        "role": user.get("role", "user"),
        "banned": bool(user.get("banned")),
        "createdAt": user.get("createdAt"),
        "directions": list(user.get("directions") or []),
    }


def find_user_by_nickname(nickname: str) -> dict[str, Any] | None:
    key = str(nickname or "").strip().lower()
    for user in STATE.state["users"].values():
        if str(user.get("nicknameLower") or user.get("nickname", "")).lower() == key:
            return user
    return None


def session_key(token: str) -> str:
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


def create_session(user_id: str) -> str:
    token = secrets.token_hex(24)
    now = now_ms()
    STATE.state["sessions"][session_key(token)] = {
        "userId": user_id,
        "createdAt": now,
        "lastSeenAt": now,
        "expiresAt": now + SESSION_TTL * 1000,
        "hashed": True,
    }
    return token


def auth_user() -> dict[str, Any] | None:
    token = ""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
    else:
        token = request.cookies.get(SESSION_COOKIE, "")
    if not token:
        return None
    key = session_key(token)
    session = STATE.state["sessions"].get(key)
    if not session:
        return None
    if int(session.get("expiresAt") or 0) and now_ms() > int(session["expiresAt"]):
        del STATE.state["sessions"][key]
        return None
    session["lastSeenAt"] = now_ms()
    return STATE.state["users"].get(session.get("userId"))


def json_body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError("请求体不是合法 JSON", 400)
    if not isinstance(data, dict):
        raise ApiError("请求体必须是 JSON 对象", 400)
    error = sec.validate_json_shape(data)
    if error:
        raise ApiError(error, 400)
    return data


def send_json(payload: Any, status: int = 200) -> Response:
    response = make_response(jsonify(payload), status)
    response.headers["Cache-Control"] = "no-store"
    return response


def set_session_cookies(response: Response, token: str, csrf: str) -> None:
    secure = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower() == "https"
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_TTL, httponly=True, samesite="Lax", secure=secure, path="/")
    response.set_cookie(CSRF_COOKIE, csrf, max_age=SESSION_TTL, httponly=False, samesite="Lax", secure=secure, path="/")


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


def check_rate(key: str, limit: int, window_seconds: float) -> dict[str, Any]:
    return STATE.consume_rate(key, limit, window_seconds)


def ensure_rate(key: str, limit: int, window_seconds: float) -> None:
    result = check_rate(key, limit, window_seconds)
    if not result["allowed"]:
        raise ApiError("请求过于频繁，请稍后再试", 429)


def notify(user_id: str, payload: dict[str, Any]) -> None:
    if not user_id:
        return
    item = {"id": new_id("n"), "at": now_ms(), "read": False, **payload}
    bucket = STATE.state["notifications"].setdefault(user_id, [])
    bucket.insert(0, item)
    STATE.state["notifications"][user_id] = bucket[:200]
    SSE.send_to_users([user_id], "notify", {"notification": item})


def notify_others(topic: dict[str, Any], except_user_id: str, payload: dict[str, Any]) -> None:
    for member in topic.get("members", []):
        if member.get("id") != except_user_id:
            notify(member.get("id", ""), payload)


def broadcast_topic(topic: dict[str, Any], event: str, data: dict[str, Any]) -> None:
    SSE.send_to_users([m.get("id") for m in topic.get("members", []) if m.get("id")], event, data)


def broadcast_all(event: str, data: dict[str, Any]) -> None:
    SSE.send_all(event, data)


def find_topic(topic_id: str) -> dict[str, Any] | None:
    for topic in STATE.state["topics"]:
        if topic.get("id") == topic_id:
            return topic
    return None


def is_member(topic: dict[str, Any], user_id: str) -> bool:
    return any(member.get("id") == user_id for member in topic.get("members", []))


def is_owner(topic: dict[str, Any], user: dict[str, Any] | None) -> bool:
    return bool(user and (topic.get("creatorId") == user.get("id") or user.get("role") == "admin"))


def agent_project_access(
    project_id: str,
    user: dict[str, Any] | None,
    require_member: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not user:
        raise ApiError("请先登录", 401)

    topic = find_topic(project_id)
    if not topic:
        raise ApiError("项目不存在", 404)

    if user.get("role") == "admin":
        return topic, user

    if require_member and not is_member(topic, user.get("id")):
        raise ApiError("只有项目成员才能访问 Agent", 403)

    return topic, user


def agent_role(
    topic: dict[str, Any],
    user: dict[str, Any] | None,
) -> str:
    if not user:
        return "project_member"
    if user.get("role") == "admin":
        return "system_admin"
    if topic.get("creatorId") == user.get("id"):
        return "project_leader"
    return "project_member"


def missing_tags(topic: dict[str, Any]) -> list[str]:
    filled = {m.get("tag") for m in topic.get("members", []) if m.get("tag")}
    return [tag for tag in topic.get("neededRoles", []) if tag not in filled]


def public_topic(topic: dict[str, Any]) -> dict[str, Any]:
    copy = dict(topic)
    for key in ("password", "passwordHash", "passwordSalt"):
        copy.pop(key, None)
    copy["pendingApplications"] = sum(
        1 for app in STATE.state["applications"] if app.get("topicId") == topic.get("id") and app.get("status") == "pending"
    )
    copy["missingTags"] = missing_tags(topic)
    copy.setdefault("status", "recruiting")
    copy.setdefault("createdAt", 0)
    copy.setdefault("updatedAt", copy.get("createdAt", 0))
    return copy


def view_topic(topic: dict[str, Any], user: dict[str, Any] | None) -> dict[str, Any]:
    copy = public_topic(topic)
    owner = is_owner(topic, user)
    member = bool(user and is_member(topic, user.get("id")))
    if not owner:
        copy.pop("code", None)
        copy.pop("pendingApplications", None)
    if topic.get("type") == "private" and not member and not owner:
        copy["memberCount"] = len(topic.get("members", []))
        copy["members"] = []
        copy["memberHidden"] = True
        copy["desc"] = ""
        copy["vibe"] = ""
        copy["required"] = []
    return copy




class SseHub:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.connections: dict[int, dict[str, Any]] = {}
        self.sequence = 0

    def add(self, user_id: str, ip: str) -> tuple[int, queue.Queue[str]]:
        with self.lock:
            if len(self.connections) >= int(os.environ.get("MAX_SSE_TOTAL", "200")):
                raise ApiError("实时连接已达上限", 503)
            per_ip = sum(1 for item in self.connections.values() if item["ip"] == ip)
            if per_ip >= int(os.environ.get("MAX_SSE_PER_IP", "5")):
                raise ApiError("你的实时连接过多", 503)
            self.sequence += 1
            connection_id = self.sequence
            q: queue.Queue[str] = queue.Queue(maxsize=200)
            self.connections[connection_id] = {"userId": user_id, "ip": ip, "queue": q, "at": time.time()}
            return connection_id, q

    def remove(self, connection_id: int) -> None:
        with self.lock:
            self.connections.pop(connection_id, None)

    def send_to_users(self, user_ids: list[str], event: str, data: dict[str, Any]) -> None:
        targets = set(str(x) for x in user_ids)
        payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        with self.lock:
            for item in list(self.connections.values()):
                if item["userId"] in targets:
                    try:
                        item["queue"].put_nowait(payload)
                    except queue.Full:
                        pass

    def send_all(self, event: str, data: dict[str, Any]) -> None:
        with self.lock:
            user_ids = [item["userId"] for item in self.connections.values() if item.get("userId")]
        self.send_to_users(user_ids, event, data)


SSE = SseHub()
SSE_TICKETS: dict[str, dict[str, Any]] = {}
SSE_TICKET_LOCK = threading.RLock()


def issue_sse_ticket(user_id: str) -> str:
    ticket = secrets.token_hex(24)
    with SSE_TICKET_LOCK:
        SSE_TICKETS[ticket] = {"userId": user_id, "expiresAt": time.time() + 60}
    return ticket


def consume_sse_ticket(ticket: str) -> str | None:
    with SSE_TICKET_LOCK:
        item = SSE_TICKETS.pop(ticket, None)
    if not item or item["expiresAt"] < time.time():
        return None
    return str(item["userId"])


def make_project_code() -> str:
    existing = {str(t.get("code")) for t in STATE.state["topics"]}
    code = ""
    while not code or code in existing:
        code = str(secrets.randbelow(90_000_000) + 10_000_000)
    return code




def ensure_admin() -> None:
    admin = find_user_by_nickname(ADMIN_NICKNAME)
    if admin:
        return
    if not ADMIN_PASSWORD:
        raise RuntimeError("尚未创建管理员，必须配置 ADMIN_PASSWORD")
    salt = sec.make_salt()
    user = {
        "id": new_id("u"),
        "nickname": ADMIN_NICKNAME,
        "nicknameLower": ADMIN_NICKNAME.lower(),
        "grade": "管理员",
        "salt": salt,
        "hash": sec.hash_password(ADMIN_PASSWORD, salt),
        "role": "admin",
        "banned": False,
        "directions": [],
        "createdAt": now_ms(),
    }
    STATE.state["users"][user["id"]] = user
    STATE.save()


ensure_admin()


def create_user(nickname: str, password: str, grade: str, role: str = "user", directions: list[str] | None = None) -> dict[str, Any]:
    salt = sec.make_salt()
    user = {
        "id": new_id("u"),
        "nickname": nickname,
        "nicknameLower": nickname.lower(),
        "grade": grade,
        "salt": salt,
        "hash": sec.hash_password(password, salt),
        "role": role,
        "banned": False,
        "directions": (directions or [])[:5],
        "createdAt": now_ms(),
    }
    STATE.state["users"][user["id"]] = user
    return user


def request_public_origin() -> str:
    scheme = request.scheme
    host = request.host
    trusted_proxy = os.environ.get("TRUST_PROXY") == "1" or request.remote_addr in {"127.0.0.1", "::1"}
    if trusted_proxy:
        forwarded_host = request.headers.get("X-Forwarded-Host", "").split(",")[0].strip()
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip()
        if forwarded_host:
            host = forwarded_host
        if forwarded_proto:
            scheme = forwarded_proto
    return scheme + "://" + host


@app.after_request
def after_request(response: Response) -> Response:
    for key, value in sec.security_headers().items():
        response.headers.setdefault(key, value)
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    origin = request.headers.get("Origin", "")
    allowed = [x.strip() for x in os.environ.get("ALLOWED_ORIGINS", "").split(",") if x.strip()]
    if origin and origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token, X-Client"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS"
    return response


@app.before_request
def protect_cookie_writes():
    if not request.path.startswith("/api/") or request.method not in {"POST", "PATCH", "DELETE"}:
        return None
    if request.path in {"/api/login", "/api/register"}:
        return None
    user = auth_user()
    via_cookie = not request.headers.get("Authorization", "").startswith("Bearer ")
    if user and via_cookie:
        cookie = request.cookies.get(CSRF_COOKIE, "")
        header = request.headers.get("X-CSRF-Token", "")
        if not cookie or not header or not sec.safe_equal(cookie, header) or not sec.verify_csrf(STATE.state, header, user.get("id", "")):
            raise ApiError("请求校验失败，请刷新页面后重试", 403)
    origin = request.headers.get("Origin", "")
    if origin:
        allowed = [x.strip() for x in os.environ.get("ALLOWED_ORIGINS", "").split(",") if x.strip()]
        same = origin == request_public_origin()
        if not same and origin not in allowed:
            raise ApiError("请求来源不被允许", 403)
    return None


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return send_json({"error": error.message}, error.status)


@app.errorhandler(StateConflictError)
def handle_state_conflict(_error: StateConflictError):
    return send_json({"error": "数据已被其他操作更新，请刷新后重试"}, 409)


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    if isinstance(error, HTTPException):
        return error
    if request.path.startswith("/api/"):
        app.logger.exception("Unhandled API error")
        return send_json({"error": "服务器内部错误"}, 500)
    return "服务器内部错误", 500


def register():
    ip = sec.client_ip(request)
    ensure_rate("register:" + ip, int(os.environ.get("RATE_REGISTER_IP", "5")), 3600)
    body = json_body()
    nickname = sec.clean_text(body.get("nickname"), 16, False)
    password = str(body.get("password") or "")
    grade = sec.clean_text(body.get("grade"), 12, False)
    directions = (
        [x for x in body.get("directions", []) if isinstance(x, str) and x in MAJOR_IDS][:5] if isinstance(body.get("directions"), list) else []
    )
    if len(nickname) < 2:
        raise ApiError("昵称需要 2-16 个字符")
    password_error = sec.validate_password(password)
    if password_error:
        raise ApiError(password_error)
    if not grade:
        raise ApiError("请选择大学几年级")
    if nickname.lower() == ADMIN_NICKNAME.lower() or find_user_by_nickname(nickname):
        raise ApiError("该昵称已被注册，请直接登录", 409)
    user = create_user(nickname, password, grade, "user", directions)
    token = create_session(user["id"])
    csrf = sec.issue_csrf(STATE.state, user["id"])
    STATE.save()
    response = send_json({"user": public_user(user), "csrf": csrf, **({"token": token} if request.headers.get("X-Client") == "api" else {})})
    set_session_cookies(response, token, csrf)
    return response


def login():
    ip = sec.client_ip(request)
    ensure_rate("login-ip:" + ip, int(os.environ.get("RATE_LOGIN_IP", "10")), 900)
    body = json_body()
    nickname = sec.clean_text(body.get("nickname"), 64, False)
    password = str(body.get("password") or "")
    key = nickname.lower()
    with login_lock:
        failure = login_failures.get(key)
        if failure and failure.get("until", 0) > time.time():
            raise ApiError("该账号尝试次数过多，请稍后再试", 429)
        user = find_user_by_nickname(nickname)
        if not user or not sec.verify_password(user, password):
            count = int((failure or {}).get("count", 0)) + 1
            login_failures[key] = {"count": count, "until": time.time() + 900 if count >= int(os.environ.get("RATE_LOGIN_ACCOUNT", "5")) else 0}
            raise ApiError("昵称或密码不正确", 401)
        login_failures.pop(key, None)
    if user.get("banned"):
        raise ApiError("该账号已被封禁", 403)
    token = create_session(user["id"])
    csrf = sec.issue_csrf(STATE.state, user["id"])
    STATE.save()
    response = send_json({"user": public_user(user), "csrf": csrf, **({"token": token} if request.headers.get("X-Client") == "api" else {})})
    set_session_cookies(response, token, csrf)
    return response


def logout():
    token = request.cookies.get(SESSION_COOKIE, "")
    if token:
        STATE.state["sessions"].pop(session_key(token), None)
        STATE.save()
    response = send_json({"ok": True})
    clear_session_cookies(response)
    return response


def topics_collection(user: dict[str, Any] | None):
    if request.method == "GET":
        query = sec.clean_text(request.args.get("q"), 100, False).lower()
        status_filter = sec.clean_text(request.args.get("status"), 30, False)
        recruiting_only = request.args.get("recruiting") == "1"
        result = []
        for topic in STATE.state["topics"]:
            if status_filter and status_filter != "all" and topic.get("status", "recruiting") != status_filter:
                continue
            if recruiting_only and topic.get("status", "recruiting") != "recruiting":
                continue
            if query:
                haystack = " ".join(
                    [
                        str(topic.get("title") or ""),
                        str(topic.get("desc") or ""),
                        str(topic.get("vibe") or ""),
                        " ".join(map(str, topic.get("directions") or [])),
                        " ".join(map(str, topic.get("required") or [])),
                        " ".join(map(str, topic.get("neededRoles") or [])),
                    ]
                ).lower()
                if query not in haystack:
                    continue
            result.append(view_topic(topic, user))
        return send_json({"topics": result})
    if not user:
        raise ApiError("请先登录再创建项目", 401)
    if user.get("banned"):
        raise ApiError("该账号已被封禁，无法创建项目", 403)
    body = json_body()
    title = sec.clean_text(body.get("title"), 60, False)
    desc = sec.clean_text(body.get("desc"), 300)
    vibe = sec.clean_text(body.get("vibe"), 60, False)
    directions = (
        [x for x in body.get("directions", []) if isinstance(x, str) and x in MAJOR_IDS][:5] if isinstance(body.get("directions"), list) else []
    )
    required = [x for x in body.get("required", []) if isinstance(x, str) and x in MAJOR_IDS][:5] if isinstance(body.get("required"), list) else []
    needed_roles = (
        [x for x in body.get("neededRoles", []) if isinstance(x, str) and x in ROLE_TAGS][:6] if isinstance(body.get("neededRoles"), list) else []
    )
    topic_type = "private" if body.get("type") == "private" else "public"
    limit = max(2, min(50, int(body.get("limit") or 6)))
    password = str(body.get("password") or "")
    if not title:
        raise ApiError("请填写项目名称")
    if not directions:
        raise ApiError("请至少选择一个项目方向")
    if topic_type == "public" and not required:
        raise ApiError("公开话题需要设置加入成员所需的方向")
    if topic_type == "private" and not (len(password) == 6 and password.isdigit()):
        raise ApiError("私密话题需要设置 6 位数字密码")
    if any(str(t.get("title", "")).strip().lower() == title.lower() for t in STATE.state["topics"]):
        raise ApiError("该项目已存在", 409)
    topic = {
        "id": new_id("t"),
        "code": make_project_code(),
        "creatorId": user["id"],
        "title": title,
        "desc": desc,
        "vibe": vibe,
        "directions": directions,
        "required": required if topic_type == "public" else [],
        "neededRoles": needed_roles,
        "type": topic_type,
        "passwordHash": "",
        "passwordSalt": "",
        "limit": limit,
        "members": [{"id": user["id"], "nickname": user["nickname"], "grade": user.get("grade", ""), "tag": ""}],
        "status": "recruiting",
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
        "tasks": [],
        "resources": [],
        "activities": [],
        "outcome": None,
    }
    if topic_type == "private":
        salt = sec.make_salt()
        topic["passwordSalt"] = salt
        topic["passwordHash"] = sec.hash_password(password, salt)
    STATE.state["topics"].insert(0, topic)
    STATE.state["messages"][topic["id"]] = []
    STATE.state["files"][topic["id"]] = []
    STATE.save()
    broadcast_all("topics", {"action": "created", "topicId": topic["id"]})
    return send_json({"topic": view_topic(topic, user)})


def topic_detail(topic: dict[str, Any], user: dict[str, Any] | None, action: str):
    if not action and request.method == "GET":
        return send_json({"topic": view_topic(topic, user)})
    if not action and request.method == "DELETE":
        if not user:
            raise ApiError("请先登录", 401)
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人或管理员才能删除该项目", 403)
        for meta in list(STATE.state["files"].get(topic["id"], [])):
            STATE.delete_file(meta["storedName"])
        STATE.state["files"].pop(topic["id"], None)
        STATE.state["messages"].pop(topic["id"], None)
        STATE.state["topics"] = [t for t in STATE.state["topics"] if t.get("id") != topic["id"]]
        STATE.state["applications"] = [a for a in STATE.state["applications"] if a.get("topicId") != topic["id"]]
        STATE.save()
        broadcast_all("topics", {"action": "deleted", "topicId": topic["id"]})
        return send_json({"ok": True})
    return None


def messages_route(topic: dict[str, Any], user: dict[str, Any] | None, parts: list[str]):
    if request.method == "GET":
        if not user:
            raise ApiError("未登录", 401)
        if not is_member(topic, user["id"]) and user.get("role") != "admin":
            raise ApiError("只有话题成员才能查看聊天", 403)
        items = STATE.state["messages"].get(topic["id"], [])
        limit = max(1, min(500, int(request.args.get("limit", "200"))))
        return send_json({"messages": items[-limit:], "total": len(items), "limit": limit})
    if request.method == "POST":
        if not user:
            raise ApiError("未登录", 401)
        if not is_member(topic, user["id"]) and user.get("role") != "admin":
            raise ApiError("只有话题成员才能发言", 403)
        if user.get("banned"):
            raise ApiError("该账号已被封禁", 403)
        muted_until = int(user.get("mutedUntil") or 0)
        if user.get("muted") and (not muted_until or muted_until > now_ms()):
            raise ApiError("你当前已被禁言", 403)
        body = json_body()
        text = sec.clean_text(body.get("text"), 1000)
        if not text:
            raise ApiError("消息不能为空")
        client_id = sec.clean_text(body.get("clientId"), 80, False)
        if client_id:
            existing = next(
                (m for m in STATE.state["messages"].get(topic["id"], []) if m.get("author") == user["id"] and m.get("clientId") == client_id), None
            )
            if existing:
                return send_json({"message": existing, "duplicated": True})
        ensure_rate("msg:" + user["id"], int(os.environ.get("RATE_MESSAGE_USER", "30")), 60)
        reply_to = None
        if isinstance(body.get("replyTo"), dict) and body["replyTo"].get("id"):
            src = next((m for m in STATE.state["messages"].get(topic["id"], []) if m.get("id") == str(body["replyTo"]["id"])), None)
            if src:
                reply_to = {
                    "id": src.get("id"),
                    "authorName": src.get("authorName"),
                    "text": "该消息已被撤回" if src.get("recalled") else str(src.get("text", ""))[:80],
                }
        message_at = now_ms()
        message = {
            "id": new_id("m"),
            "clientId": client_id,
            "author": user["id"],
            "authorName": user["nickname"],
            "text": text,
            "replyTo": reply_to,
            "mentions": [],
            "recalled": False,
            "time": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(message_at / 1000)) + "Z",
            "at": message_at,
        }
        mentioned = [
            m for m in topic.get("members", []) if m.get("id") != user["id"] and m.get("nickname") and ("@" + str(m.get("nickname"))) in text
        ]
        message["mentions"] = [m["id"] for m in mentioned]
        STATE.state["messages"].setdefault(topic["id"], []).append(message)
        preview = text[:60] + ("…" if len(text) > 60 else "")
        for member in topic.get("members", []):
            if member.get("id") == user["id"]:
                continue
            notify(
                member.get("id", ""),
                {
                    "type": "MENTION" if member in mentioned else "NEW_MESSAGE",
                    "topicId": topic["id"],
                    "topicTitle": topic.get("title"),
                    "from": user["nickname"],
                    "text": ("有人 @ 你：" if member in mentioned else "") + preview,
                    "messageId": message["id"],
                },
            )
        STATE.save()
        broadcast_topic(topic, "message", {"topicId": topic["id"], "message": message})
        return send_json({"message": message})
    if request.method == "PATCH" and len(parts) >= 4:
        if not user:
            raise ApiError("未登录", 401)
        message = next((m for m in STATE.state["messages"].get(topic["id"], []) if m.get("id") == parts[3]), None)
        if not message:
            raise ApiError("消息不存在", 404)
        if message.get("author") != user["id"]:
            raise ApiError("只能编辑自己发送的消息", 403)
        body = json_body()
        text = sec.clean_text(body.get("text"), 1000)
        if not text:
            raise ApiError("消息不能为空")
        message["text"] = text
        message["mentions"] = [
            m["id"] for m in topic.get("members", []) if m.get("id") != user["id"] and m.get("nickname") and ("@" + str(m.get("nickname"))) in text
        ]
        message["edited"] = True
        message["editedAt"] = now_ms()
        STATE.save()
        broadcast_topic(topic, "message", {"topicId": topic["id"], "message": message})
        return send_json({"message": message})
    if request.method == "DELETE" and len(parts) >= 4:
        if not user:
            raise ApiError("未登录", 401)
        message = next((m for m in STATE.state["messages"].get(topic["id"], []) if m.get("id") == parts[3]), None)
        if not message:
            raise ApiError("消息不存在", 404)
        if message.get("author") != user["id"]:
            raise ApiError("只能撤回自己发送的消息", 403)
        message["recalled"] = True
        message["recalledAt"] = now_ms()
        message["recalledBy"] = "自己"
        message["text"] = ""
        message["mentions"] = []
        STATE.save()
        broadcast_topic(topic, "message", {"topicId": topic["id"], "message": message})
        return send_json({"message": message})
    return None


def applications_route(topic: dict[str, Any], user: dict[str, Any] | None):
    if request.method == "POST":
        if not user:
            raise ApiError("请先登录再申请加入", 401)
        if user.get("banned"):
            raise ApiError("该账号已被封禁", 403)
        if is_member(topic, user["id"]):
            raise ApiError("你已经是该话题成员")
        if len(topic.get("members", [])) >= int(topic.get("limit", 6)):
            raise ApiError("该项目已经满员")
        existing = next(
            (
                a
                for a in STATE.state["applications"]
                if a.get("topicId") == topic["id"] and a.get("userId") == user["id"] and a.get("status") == "pending"
            ),
            None,
        )
        if existing:
            return send_json({"application": existing, "duplicated": True})
        ensure_rate("apply:" + user["id"], 10, 3600)
        body = json_body()
        if topic.get("type") == "private":
            password = str(body.get("password") or "")
            salt = str(topic.get("passwordSalt") or "")
            expected = str(topic.get("passwordHash") or "")
            if not salt or not expected or not sec.safe_equal(sec.hash_password(password, salt), expected):
                raise ApiError("密码不正确，请向负责人确认", 403)
        else:
            mine = list(user.get("directions") or [])
            if not any(r in mine for r in topic.get("required", [])):
                raise ApiError("你的方向与该项目要求不匹配", 403)
        app_item = {
            "id": new_id("a"),
            "topicId": topic["id"],
            "userId": user["id"],
            "nickname": user.get("nickname"),
            "grade": user.get("grade"),
            "message": sec.clean_text(body.get("message"), 200),
            "status": "pending",
            "createdAt": now_ms(),
            "decidedAt": 0,
        }
        STATE.state["applications"].append(app_item)
        notify(
            topic.get("creatorId", ""),
            {
                "type": "PROJECT_APPLICATION",
                "topicId": topic["id"],
                "topicTitle": topic.get("title"),
                "from": user.get("nickname"),
                "text": "申请加入你的项目" + (("：" + app_item["message"][:40]) if app_item["message"] else ""),
            },
        )
        STATE.save()
        SSE.send_to_users(
            [topic.get("creatorId", "")], "applications", {"action": "created", "applicationId": app_item["id"], "topicId": topic["id"]}
        )
        return send_json({"application": app_item})
    if request.method == "DELETE":
        if not user:
            raise ApiError("请先登录", 401)
        app_item = next(
            (
                a
                for a in STATE.state["applications"]
                if a.get("topicId") == topic["id"] and a.get("userId") == user["id"] and a.get("status") == "pending"
            ),
            None,
        )
        if not app_item:
            raise ApiError("没有可取消的申请", 404)
        app_item["status"] = "cancelled"
        app_item["decidedAt"] = now_ms()
        notify(
            topic.get("creatorId", ""),
            {
                "type": "APPLICATION_CANCELLED",
                "topicId": topic["id"],
                "topicTitle": topic.get("title"),
                "from": user.get("nickname"),
                "text": "取消了对该项目的加入申请",
            },
        )
        STATE.save()
        return send_json({"application": app_item})
    if request.method == "GET":
        if not user:
            raise ApiError("未登录", 401)
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人才能查看申请", 403)
        items = sorted([a for a in STATE.state["applications"] if a.get("topicId") == topic["id"]], key=lambda x: x.get("createdAt", 0), reverse=True)
        return send_json({"applications": items})
    return None


def notifications_route(user: dict[str, Any], path: str):
    if not user:
        raise ApiError("未登录", 401)
    bucket = STATE.state["notifications"].get(user["id"], [])
    if path == "read" and request.method == "POST":
        body = json_body()
        ids = set(body.get("ids") or []) if isinstance(body.get("ids"), list) else set()
        for item in bucket:
            if body.get("all") or item.get("id") in ids:
                item["read"] = True
        STATE.save()
        return send_json({"ok": True, "unread": sum(1 for n in bucket if not n.get("read"))})
    limit = max(1, min(200, int(request.args.get("limit", "60"))))
    return send_json({"notifications": bucket[:limit], "unread": sum(1 for n in bucket if not n.get("read"))})


def append_audit_log(actor: dict[str, Any], action: str, target_type: str, target_id: str, detail: str = "") -> None:
    STATE.state.setdefault("auditLogs", []).insert(0, {
        "id": new_id("audit"),
        "actorId": actor.get("id"),
        "actorName": actor.get("nickname"),
        "action": action,
        "targetType": target_type,
        "targetId": target_id,
        "detail": detail,
        "createdAt": now_ms(),
    })
    STATE.state["auditLogs"] = STATE.state["auditLogs"][:1000]


def admin_route(user: dict[str, Any] | None, parts: list[str]):
    if not user or user.get("role") != "admin":
        raise ApiError("需要管理员权限", 403)

    method = request.method
    stamp = now_ms()

    def set_penalty(target: dict[str, Any], penalty_type: str, active: bool, reason: str) -> None:
        penalties = STATE.state.setdefault("penalties", [])
        current = next(
            (
                item
                for item in penalties
                if item.get("userId") == target.get("id")
                and item.get("type") == penalty_type
                and item.get("active")
            ),
            None,
        )
        if active:
            payload = {
                "reason": reason,
                "active": True,
                "createdAt": stamp,
                "createdBy": user.get("id"),
                "createdByName": user.get("nickname"),
            }
            if current:
                current.update(payload)
            else:
                penalties.insert(
                    0,
                    {
                        "id": new_id("penalty"),
                        "userId": target.get("id"),
                        "userName": target.get("nickname"),
                        "type": penalty_type,
                        **payload,
                    },
                )
            penalties[:] = penalties[:1000]
            return
        for item in penalties:
            if item.get("userId") == target.get("id") and item.get("type") == penalty_type and item.get("active"):
                item["active"] = False
                item["revokedAt"] = stamp
                item["revokedBy"] = user.get("id")

    if len(parts) == 2 and parts[1] == "users" and method == "GET":
        users = []
        for item in STATE.state["users"].values():
            value = public_user(item) or {}
            value["topicCount"] = sum(1 for topic in STATE.state["topics"] if topic.get("creatorId") == item.get("id"))
            value["muted"] = bool(item.get("muted"))
            value["penalties"] = [
                dict(penalty)
                for penalty in STATE.state.setdefault("penalties", [])
                if penalty.get("userId") == item.get("id") and penalty.get("active")
            ]
            users.append(value)
        users.sort(key=lambda item: item.get("createdAt", 0), reverse=True)
        return send_json({"users": users})

    if len(parts) == 4 and parts[1] == "users" and method == "POST":
        target = STATE.state["users"].get(parts[2])
        if not target:
            raise ApiError("用户不存在", 404)
        if target.get("role") == "admin":
            raise ApiError("不能操作管理员账号", 403)
        action = parts[3]
        body = json_body()
        if action == "ban":
            target["banned"] = bool(body.get("banned"))
            reason = sec.clean_text(body.get("reason"), 300) or "管理员封禁"
            set_penalty(target, "ban", bool(target["banned"]), reason)
            if target["banned"]:
                for token, session in list(STATE.state["sessions"].items()):
                    if session.get("userId") == target.get("id"):
                        STATE.state["sessions"].pop(token, None)
            append_audit_log(user, "user.ban", "user", target.get("id", ""), "banned=" + str(target["banned"]))
        elif action == "mute":
            target["muted"] = bool(body.get("muted"))
            try:
                expires_at = int(body.get("expiresAt") or 0)
            except (TypeError, ValueError):
                expires_at = 0
            target["mutedUntil"] = expires_at if target["muted"] else 0
            target["muteReason"] = sec.clean_text(body.get("reason"), 300) if target["muted"] else ""
            reason = target.get("muteReason") or "管理员禁言"
            set_penalty(target, "mute", bool(target["muted"]), reason)
            append_audit_log(user, "user.mute", "user", target.get("id", ""), "muted=" + str(target["muted"]))
        else:
            raise ApiError("管理员用户操作不存在", 404)
        STATE.save()
        return send_json({"user": public_user(target)})

    if len(parts) == 2 and parts[1] == "stats" and method == "GET":
        stats = {
            "users": len(STATE.state["users"]),
            "topics": len(STATE.state["topics"]),
            "messages": sum(len(bucket) for bucket in STATE.state["messages"].values()),
            "files": sum(len(bucket) for bucket in STATE.state["files"].values()),
            "reportsOpen": sum(1 for item in STATE.state["reports"] if item.get("status") == "open"),
            "appealsOpen": sum(1 for item in STATE.state["appeals"] if item.get("status") == "pending"),
            "announcementsPublished": sum(1 for item in STATE.state["announcements"] if item.get("status") == "published"),
            "auditLogs": len(STATE.state["auditLogs"]),
        }
        return send_json({"stats": stats})

    if len(parts) == 2 and parts[1] == "topics" and method == "GET":
        topics = []
        for topic in sorted(STATE.state["topics"], key=lambda item: item.get("createdAt", 0), reverse=True):
            value = public_topic(topic)
            value["memberCount"] = len(topic.get("members", []))
            topics.append(value)
        return send_json({"topics": topics})

    if len(parts) == 2 and parts[1] == "files" and method == "GET":
        files = []
        for topic_id, bucket in STATE.state["files"].items():
            topic = find_topic(topic_id)
            for item in bucket:
                files.append(
                    {
                        "id": item.get("id"),
                        "name": item.get("name"),
                        "type": item.get("type"),
                        "size": item.get("size"),
                        "uploaderId": item.get("uploaderId"),
                        "uploaderName": item.get("uploaderName"),
                        "at": item.get("at"),
                        "topicId": topic_id,
                        "topicTitle": topic.get("title") if topic else "",
                    }
                )
        files.sort(key=lambda item: item.get("at", 0), reverse=True)
        return send_json({"files": files})

    if len(parts) == 3 and parts[1] == "files" and method == "DELETE":
        file_id = parts[2]
        for topic_id, bucket in STATE.state["files"].items():
            item = next((entry for entry in bucket if entry.get("id") == file_id), None)
            if not item:
                continue
            STATE.delete_file(item.get("storedName", ""))
            bucket.remove(item)
            append_audit_log(user, "file.delete", "file", file_id, item.get("name", ""))
            STATE.save()
            broadcast_all("files", {"action": "deleted", "topicId": topic_id, "fileId": file_id})
            return send_json({"ok": True})
        raise ApiError("文件不存在", 404)

    if len(parts) == 2 and parts[1] == "announcements" and method == "GET":
        items = sorted(
            STATE.state.setdefault("announcements", []),
            key=lambda item: (bool(item.get("pinned")), int(item.get("createdAt") or 0)),
            reverse=True,
        )
        return send_json({"announcements": [dict(item) for item in items]})

    if len(parts) == 2 and parts[1] == "announcements" and method == "POST":
        body = json_body()
        title = sec.clean_text(body.get("title"), 100, False)
        content = sec.clean_text(body.get("content"), 5000)
        status = str(body.get("status") or "draft")
        if status not in {"draft", "published", "withdrawn", "archived"}:
            raise ApiError("公告状态不合法")
        if not title or not content:
            raise ApiError("请填写公告标题和内容")
        item = {
            "id": new_id("ann"),
            "title": title,
            "content": content,
            "status": status,
            "importance": str(body.get("importance") or "normal"),
            "pinned": bool(body.get("pinned")),
            "publishAt": int(body.get("publishAt") or stamp),
            "createdBy": user.get("id"),
            "createdByName": user.get("nickname"),
            "createdAt": stamp,
            "updatedAt": stamp,
        }
        STATE.state.setdefault("announcements", []).insert(0, item)
        append_audit_log(user, "announcement.create", "announcement", item["id"], status)
        STATE.save()
        broadcast_all("announcements", {"action": "created", "announcementId": item["id"]})
        return send_json({"announcement": item})

    if len(parts) == 3 and parts[1] == "announcements" and method in {"PATCH", "DELETE"}:
        item = next((entry for entry in STATE.state.setdefault("announcements", []) if entry.get("id") == parts[2]), None)
        if not item:
            raise ApiError("公告不存在", 404)
        if method == "DELETE":
            item["status"] = "archived"
            action = "announcement.archive"
        else:
            body = json_body()
            if "title" in body:
                title = sec.clean_text(body.get("title"), 100, False)
                if not title:
                    raise ApiError("公告标题不能为空")
                item["title"] = title
            if "content" in body:
                content = sec.clean_text(body.get("content"), 5000)
                if not content:
                    raise ApiError("公告内容不能为空")
                item["content"] = content
            if "status" in body:
                status = str(body.get("status") or "")
                if status not in {"draft", "published", "withdrawn", "archived"}:
                    raise ApiError("公告状态不合法")
                item["status"] = status
            if "importance" in body:
                item["importance"] = str(body.get("importance") or "normal")
            if "pinned" in body:
                item["pinned"] = bool(body.get("pinned"))
            if "publishAt" in body:
                try:
                    item["publishAt"] = int(body.get("publishAt") or stamp)
                except (TypeError, ValueError):
                    raise ApiError("发布时间不合法")
            action = "announcement.update"
        item["updatedAt"] = stamp
        append_audit_log(user, action, "announcement", item.get("id", ""), item.get("status", ""))
        STATE.save()
        broadcast_all("announcements", {"action": "updated", "announcementId": item.get("id")})
        return send_json({"announcement": item})

    if len(parts) == 2 and parts[1] == "appeals" and method == "GET":
        items = sorted(STATE.state.setdefault("appeals", []), key=lambda item: item.get("createdAt", 0), reverse=True)
        return send_json({"appeals": [dict(item) for item in items]})

    if len(parts) == 4 and parts[1] == "appeals" and parts[3] == "resolve" and method == "POST":
        appeal = next((item for item in STATE.state.setdefault("appeals", []) if item.get("id") == parts[2]), None)
        if not appeal:
            raise ApiError("申诉不存在", 404)
        body = json_body()
        decision = str(body.get("decision") or "")
        if decision not in {"approved", "rejected"}:
            raise ApiError("申诉处理结果不合法")
        appeal["status"] = decision
        appeal["result"] = sec.clean_text(body.get("result"), 1000)
        appeal["handledAt"] = stamp
        appeal["handledBy"] = user.get("id")
        appeal["handledByName"] = user.get("nickname")
        notify(appeal.get("userId", ""), {"type": "APPEAL_RESULT", "from": "管理员", "text": "你的申诉已有处理结果：" + appeal["result"]})
        append_audit_log(user, "appeal.resolve", "appeal", appeal.get("id", ""), decision)
        STATE.save()
        return send_json({"appeal": appeal})

    if len(parts) == 2 and parts[1] == "penalties" and method == "GET":
        items = sorted(STATE.state.setdefault("penalties", []), key=lambda item: item.get("createdAt", 0), reverse=True)
        return send_json({"penalties": [dict(item) for item in items]})

    if len(parts) == 4 and parts[1] == "penalties" and parts[3] == "revoke" and method == "POST":
        penalty = next((item for item in STATE.state.setdefault("penalties", []) if item.get("id") == parts[2]), None)
        if not penalty:
            raise ApiError("处罚记录不存在", 404)
        penalty["active"] = False
        penalty["revokedAt"] = stamp
        penalty["revokedBy"] = user.get("id")
        target = STATE.state["users"].get(penalty.get("userId"))
        if target:
            if penalty.get("type") == "ban":
                target["banned"] = False
            elif penalty.get("type") == "mute":
                target["muted"] = False
                target["mutedUntil"] = 0
            notify(target.get("id", ""), {"type": "SYSTEM_NOTIFICATION", "from": "管理员", "text": "相关处罚已撤销"})
        append_audit_log(user, "penalty.revoke", "penalty", penalty.get("id", ""), penalty.get("type", ""))
        STATE.save()
        return send_json({"penalty": penalty})

    if len(parts) == 2 and parts[1] == "audit" and method == "GET":
        try:
            limit = max(1, min(500, int(request.args.get("limit", "100"))))
        except (TypeError, ValueError):
            limit = 100
        logs = [
            dict(item, at=item.get("at") or item.get("createdAt", 0))
            for item in STATE.state.setdefault("auditLogs", [])[:limit]
        ]
        return send_json({"logs": logs})

    if len(parts) == 2 and parts[1] == "reports" and method == "GET":
        items = sorted(STATE.state.setdefault("reports", []), key=lambda item: item.get("createdAt", 0), reverse=True)
        return send_json({"reports": [dict(item) for item in items[:200]]})

    if len(parts) == 4 and parts[1] == "reports" and parts[3] == "resolve" and method == "POST":
        report = next((item for item in STATE.state.setdefault("reports", []) if item.get("id") == parts[2]), None)
        if not report:
            raise ApiError("举报不存在", 404)
        body = json_body()
        report["status"] = "dismissed" if body.get("action") == "dismiss" else "resolved"
        report["handledAt"] = stamp
        report["handledBy"] = user.get("nickname")
        append_audit_log(user, "report.resolve", "report", report.get("id", ""), report["status"])
        STATE.save()
        return send_json({"report": report})

    raise ApiError("接口不存在", 404)
def files_route(topic: dict[str, Any], user: dict[str, Any] | None):
    if request.method == "GET":
        if not user or (not is_member(topic, user["id"]) and user.get("role") != "admin"):
            raise ApiError("只有话题成员才能查看文件", 403)
        files = [dict(f, url="/api/files/" + f.get("id", "")) for f in STATE.state["files"].get(topic["id"], [])]
        return send_json({"files": files})
    if request.method == "POST":
        if not user or (not is_member(topic, user["id"]) and user.get("role") != "admin"):
            raise ApiError("只有话题成员才能上传文件", 403)
        ensure_rate("upload:" + user["id"], int(os.environ.get("RATE_UPLOAD_USER", "10")), 600)
        body = json_body()
        name = sec.clean_text(body.get("name"), 80, False)
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_FILE_EXT:
            raise ApiError("只支持 Word 文档和 jpg / png 图片")
        try:
            raw = base64.b64decode(str(body.get("data") or ""), validate=True)
        except (ValueError, binascii.Error):
            raise ApiError("文件解析失败")
        if not raw:
            raise ApiError("文件内容为空")
        if len(raw) > MAX_FILE_BYTES:
            raise ApiError(f"文件不能超过 {MAX_FILE_BYTES // 1048576}MB", 413)
        if sec.sniff_file(raw) != EXT_FAMILY.get(ext):
            raise ApiError("文件内容与扩展名不符，已拒绝上传")
        used = sum(int(f.get("size") or 0) for bucket in STATE.state["files"].values() for f in bucket if f.get("uploaderId") == user["id"])
        if used + len(raw) > MAX_STORAGE_PER_USER:
            raise ApiError("你的存储空间已用尽", 413)
        file_id = new_id("f")
        stored_name = file_id + ext
        STATE.save_file(stored_name, raw)
        meta = {
            "id": file_id,
            "topicId": topic["id"],
            "name": name,
            "type": mimetypes.guess_type(name)[0] or "application/octet-stream",
            "size": len(raw),
            "storedName": stored_name,
            "uploaderId": user["id"],
            "uploaderName": user.get("nickname"),
            "at": now_ms(),
        }
        STATE.state["files"].setdefault(topic["id"], []).append(meta)
        notify_others(
            topic,
            user["id"],
            {
                "type": "FILE_UPLOADED",
                "topicId": topic["id"],
                "topicTitle": topic.get("title"),
                "from": user.get("nickname"),
                "text": "上传了文件：" + name,
            },
        )
        STATE.save()
        broadcast_topic(topic, "files", {"topicId": topic["id"]})
        return send_json({"file": {**meta, "url": "/api/files/" + file_id}})
    if request.method == "DELETE" and len(request.path.split("/")) >= 5:
        file_id = request.path.rstrip("/").split("/")[-1]
        bucket = STATE.state["files"].get(topic["id"], [])
        meta = next((f for f in bucket if f.get("id") == file_id), None)
        if not meta:
            raise ApiError("文件不存在", 404)
        if meta.get("uploaderId") != (user or {}).get("id") and not is_owner(topic, user):
            raise ApiError("只能删除自己上传的文件", 403)
        STATE.delete_file(meta["storedName"])
        bucket.remove(meta)
        STATE.save()
        broadcast_topic(topic, "files", {"topicId": topic["id"]})
        return send_json({"ok": True})
    return None


def members_route(topic: dict[str, Any], user: dict[str, Any] | None):
    if request.method == "DELETE":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人才能移出成员", 403)
        member_id = request.path.rstrip("/").split("/")[-1]
        if member_id == topic.get("creatorId"):
            raise ApiError("不能移出项目负责人")
        if not any(m.get("id") == member_id for m in topic.get("members", [])):
            raise ApiError("该成员不在话题中", 404)
        topic["members"] = [m for m in topic.get("members", []) if m.get("id") != member_id]
        notify(
            member_id,
            {
                "type": "MEMBER_REMOVED",
                "topicId": topic["id"],
                "topicTitle": topic.get("title"),
                "from": topic.get("members", [{}])[0].get("nickname", "负责人"),
                "text": "你已被移出该项目",
            },
        )
        STATE.save()
        broadcast_all("topics", {"action": "memberRemoved", "topicId": topic["id"]})
        return send_json({"topic": view_topic(topic, user)})
    return None


def tag_route(topic: dict[str, Any], user: dict[str, Any] | None, member_id: str):
    if not is_owner(topic, user):
        raise ApiError("只有项目负责人才能设置标签", 403)
    body = json_body()
    tag = sec.clean_text(body.get("tag"), 30, False)
    if tag and tag not in ROLE_TAGS:
        raise ApiError("标签不合法")
    member = next((m for m in topic.get("members", []) if m.get("id") == member_id), None)
    if not member:
        raise ApiError("该成员不在话题中", 404)
    member["tag"] = tag
    STATE.save()
    return send_json({"topic": view_topic(topic, user)})




def reports_route(user: dict[str, Any] | None):
    if not user or user.get("banned"):
        raise ApiError("请先登录再举报", 403)
    ensure_rate("report:" + user["id"], 5, 3600)
    body = json_body()
    target_type = str(body.get("targetType") or "")
    if target_type not in {"user", "topic", "message", "file"}:
        raise ApiError("举报目标类型不合法")
    reason = sec.clean_text(body.get("reason"), 60, False)
    detail = sec.clean_text(body.get("detail"), 500)
    topic_id = sec.clean_text(body.get("topicId"), 40, False)
    target_id = sec.clean_text(body.get("targetId"), 80, False)
    target_user_id = sec.clean_text(body.get("targetUserId"), 80, False)
    if not reason:
        raise ApiError("请选择举报类型")

    if target_type == "user":
        if not target_user_id or target_user_id not in STATE.state["users"]:
            raise ApiError("举报用户不存在", 404)
        if target_user_id == user.get("id"):
            raise ApiError("不能举报自己", 400)
    elif target_type == "topic":
        topic = find_topic(target_id or topic_id)
        if not topic:
            raise ApiError("举报项目不存在", 404)
        topic_id = topic["id"]
    elif target_type == "message":
        topic = find_topic(topic_id)
        if not topic:
            raise ApiError("举报项目不存在", 404)
        message = next((item for item in STATE.state["messages"].get(topic["id"], []) if item.get("id") == target_id), None)
        if not message:
            raise ApiError("举报消息不存在", 404)
    elif target_type == "file":
        topic = find_topic(topic_id)
        if not topic:
            raise ApiError("举报项目不存在", 404)
        file_item = next((item for item in STATE.state["files"].get(topic["id"], []) if item.get("id") == target_id), None)
        if not file_item:
            raise ApiError("举报文件不存在", 404)

    topic = find_topic(topic_id) if topic_id else None
    report = {
        "id": new_id("r"),
        "reporterId": user["id"],
        "reporterName": user.get("nickname"),
        "targetType": target_type,
        "targetId": target_id,
        "targetUserId": target_user_id,
        "topicId": topic.get("id") if topic else "",
        "topicTitle": topic.get("title") if topic else "",
        "reason": reason,
        "detail": detail,
        "status": "open",
        "createdAt": now_ms(),
        "handledAt": 0,
        "handledBy": "",
    }
    STATE.state["reports"].insert(0, report)
    STATE.state["reports"] = STATE.state["reports"][:500]
    for admin in STATE.state["users"].values():
        if admin.get("role") == "admin":
            notify(admin.get("id", ""), {
                "type": "REPORT_CREATED",
                "topicId": report["topicId"],
                "topicTitle": report["topicTitle"],
                "from": user.get("nickname"),
                "text": "收到一条举报：" + reason,
            })
    STATE.save()
    return send_json({"ok": True, "id": report["id"]})


def process_application(user: dict[str, Any] | None, app_id: str, action: str):
    if not user:
        raise ApiError("未登录", 401)
    app_item = next((a for a in STATE.state["applications"] if a.get("id") == app_id), None)
    if not app_item:
        raise ApiError("申请不存在", 404)
    topic = find_topic(app_item.get("topicId", ""))
    if not topic:
        raise ApiError("话题已不存在", 404)
    if not is_owner(topic, user):
        raise ApiError("只有项目负责人才能处理申请", 403)
    if app_item.get("status") != "pending":
        raise ApiError("该申请已经处理过了")
    if action == "approve":
        if len(topic.get("members", [])) >= int(topic.get("limit", 6)):
            raise ApiError("项目已满员，无法再加入成员")
        applicant = STATE.state["users"].get(app_item.get("userId"))
        if not applicant:
            raise ApiError("申请人账号不存在", 404)
        if not is_member(topic, applicant["id"]):
            topic["members"].append({"id": applicant["id"], "nickname": applicant.get("nickname"), "grade": applicant.get("grade"), "tag": ""})
        app_item["status"] = "approved"
    else:
        app_item["status"] = "rejected"
    app_item["decidedAt"] = now_ms()
    notify(
        app_item.get("userId", ""),
        {
            "type": "APPLICATION_ACCEPTED" if action == "approve" else "APPLICATION_REJECTED",
            "topicId": topic["id"],
            "topicTitle": topic.get("title"),
            "from": topic.get("members", [{}])[0].get("nickname", "负责人"),
            "text": "已同意你加入项目" if action == "approve" else "这次暂时没有通过",
        },
    )
    STATE.save()
    broadcast_all("topics", {"action": "memberChanged", "topicId": topic["id"]})
    return send_json({"application": app_item, "topic": view_topic(topic, user)})


def download_file(file_id: str):
    user = auth_user()
    meta = None
    for bucket in STATE.state["files"].values():
        meta = next((f for f in bucket if f.get("id") == file_id), None)
        if meta:
            break
    if not meta:
        raise ApiError("文件不存在", 404)
    if not user:
        raise ApiError("请先登录", 401)
    topic = find_topic(meta.get("topicId", ""))
    if not topic or (not is_member(topic, user["id"]) and user.get("role") != "admin"):
        raise ApiError("只有话题成员才能查看文件", 403)
    data = STATE.read_file(meta.get("storedName", ""))
    if data is None:
        raise ApiError("文件已丢失", 404)
    response = make_response(data)
    response.headers["Content-Type"] = meta.get("type") or "application/octet-stream"
    disposition = "inline" if str(meta.get("type", "")).startswith("image/") else "attachment"
    response.headers["Content-Disposition"] = disposition + "; filename*=UTF-8''" + str(meta.get("name", "file"))
    response.headers["Cache-Control"] = "private, no-store"
    return response



def ensure_topic_workspace(topic: dict[str, Any]) -> dict[str, Any]:
    topic.setdefault("status", "recruiting")
    topic.setdefault("createdAt", now_ms())
    topic.setdefault("updatedAt", topic.get("createdAt", now_ms()))
    topic.setdefault("tasks", [])
    topic.setdefault("resources", [])
    topic.setdefault("activities", [])
    topic.setdefault("outcome", None)
    return topic


def add_activity(topic: dict[str, Any], user: dict[str, Any] | None, event_type: str, text: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    item = {
        "id": new_id("act"),
        "type": event_type,
        "text": text,
        "actorId": user.get("id") if user else "",
        "actorName": user.get("nickname") if user else "系统",
        "at": now_ms(),
        "meta": meta or {},
    }
    topic.setdefault("activities", []).insert(0, item)
    topic["activities"] = topic["activities"][:500]
    topic["updatedAt"] = now_ms()
    return item


def task_view(task: dict[str, Any]) -> dict[str, Any]:
    value = dict(task)
    due = int(value.get("dueAt") or 0)
    if due and due < now_ms() and value.get("status") != "completed":
        value["status"] = "overdue"
    return value


def tasks_route(topic: dict[str, Any], user: dict[str, Any] | None, parts: list[str]) -> Response:
    ensure_topic_workspace(topic)
    if not user or (not is_member(topic, user.get("id")) and user.get("role") != "admin"):
        raise ApiError("只有项目成员才能管理任务", 403)

    tasks = topic.setdefault("tasks", [])
    if not parts:
        if request.method == "GET":
            return send_json({"tasks": [task_view(item) for item in tasks]})
        if request.method == "POST":
            if not is_owner(topic, user):
                raise ApiError("只有项目负责人可以创建任务", 403)
            body = json_body()
            client_id = sec.clean_text(body.get("clientId"), 80, False)
            if client_id:
                existing = next((item for item in tasks if item.get("clientId") == client_id), None)
                if existing:
                    return send_json({"task": task_view(existing), "duplicated": True})
            title = sec.clean_text(body.get("title"), 120, False)
            if not title:
                raise ApiError("请填写任务标题")
            assignee_id = sec.clean_text(body.get("assigneeId"), 80, False)
            if assignee_id and not is_member(topic, assignee_id) and assignee_id != topic.get("creatorId"):
                raise ApiError("任务负责人必须是项目成员")
            status = str(body.get("status") or "todo")
            if status not in {"todo", "in_progress", "completed"}:
                status = "todo"
            priority = str(body.get("priority") or "medium")
            if priority not in {"low", "medium", "high"}:
                priority = "medium"
            task = {
                "id": new_id("task"),
                "clientId": client_id,
                "title": title,
                "desc": sec.clean_text(body.get("desc"), 500),
                "assigneeId": assignee_id,
                "dueAt": int(body.get("dueAt") or 0),
                "priority": priority,
                "status": status,
                "createdBy": user.get("id"),
                "createdAt": now_ms(),
                "updatedAt": now_ms(),
            }
            tasks.insert(0, task)
            add_activity(topic, user, "task_created", "创建任务：" + title, {"taskId": task["id"]})
            if assignee_id:
                notify(assignee_id, {"type": "TASK_ASSIGNMENT", "topicId": topic["id"], "topicTitle": topic.get("title"), "from": user.get("nickname"), "text": "你收到一个新任务：" + title})
            STATE.save()
            broadcast_topic(topic, "topics", {"topicId": topic["id"]})
            return send_json({"task": task_view(task)})
        raise ApiError("请求方法不允许", 405)

    task_id = parts[0]
    task = next((item for item in tasks if item.get("id") == task_id), None)
    if not task:
        raise ApiError("任务不存在", 404)

    if request.method == "PATCH":
        if not is_owner(topic, user) and task.get("assigneeId") != user.get("id"):
            raise ApiError("普通成员只能修改自己负责的任务", 403)
        body = json_body()
        allowed = {"title", "desc", "assigneeId", "dueAt", "priority", "status"}
        for key, value in body.items():
            if key not in allowed:
                continue
            if key == "title":
                value = sec.clean_text(value, 120, False)
                if not value:
                    raise ApiError("任务标题不能为空")
            elif key == "desc":
                value = sec.clean_text(value, 500)
            elif key == "assigneeId":
                if not is_owner(topic, user):
                    continue
                value = sec.clean_text(value, 80, False)
                if value and not is_member(topic, value) and value != topic.get("creatorId"):
                    raise ApiError("任务负责人必须是项目成员")
            elif key == "dueAt":
                value = int(value or 0)
            elif key == "priority" and value not in {"low", "medium", "high"}:
                continue
            elif key == "status" and value not in {"todo", "in_progress", "completed"}:
                continue
            task[key] = value
        task["updatedAt"] = now_ms()
        add_activity(topic, user, "task_updated", "更新任务：" + task.get("title", ""), {"taskId": task_id, "status": task.get("status")})
        STATE.save()
        broadcast_topic(topic, "topics", {"topicId": topic["id"]})
        return send_json({"task": task_view(task)})

    if request.method == "DELETE":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人可以删除任务", 403)
        topic["tasks"] = [item for item in tasks if item.get("id") != task_id]
        add_activity(topic, user, "task_deleted", "删除任务：" + task.get("title", ""), {"taskId": task_id})
        STATE.save()
        broadcast_topic(topic, "topics", {"topicId": topic["id"]})
        return send_json({"ok": True})

    raise ApiError("请求方法不允许", 405)


def resources_route(topic: dict[str, Any], user: dict[str, Any] | None, parts: list[str]) -> Response:
    ensure_topic_workspace(topic)
    if not user or (not is_member(topic, user.get("id")) and user.get("role") != "admin"):
        raise ApiError("只有项目成员才能查看资料", 403)
    resources = topic.setdefault("resources", [])
    if not parts and request.method == "GET":
        return send_json({"resources": resources})
    if not parts and request.method == "POST":
        body = json_body()
        kind = str(body.get("kind") or "note")
        if kind not in {"note", "link", "file"}:
            raise ApiError("资料类型不合法")
        title = sec.clean_text(body.get("title"), 120, False)
        if not title:
            raise ApiError("请填写资料标题")
        item = {
            "id": new_id("res"),
            "kind": kind,
            "title": title,
            "content": sec.clean_text(body.get("content"), 5000),
            "url": sec.clean_text(body.get("url"), 1000, False),
            "fileId": sec.clean_text(body.get("fileId"), 80, False),
            "createdBy": user.get("id"),
            "createdAt": now_ms(),
        }
        resources.insert(0, item)
        add_activity(topic, user, "resource_created", "新增项目资料：" + title, {"resourceId": item["id"]})
        STATE.save()
        broadcast_topic(topic, "topics", {"topicId": topic["id"]})
        return send_json({"resource": item})
    if len(parts) == 1 and request.method == "DELETE":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人可以删除项目资料", 403)
        topic["resources"] = [item for item in resources if item.get("id") != parts[0]]
        add_activity(topic, user, "resource_deleted", "删除项目资料", {"resourceId": parts[0]})
        STATE.save()
        return send_json({"ok": True})
    raise ApiError("请求方法不允许", 405)


def activities_route(topic: dict[str, Any], user: dict[str, Any] | None) -> Response:
    if not user or (not is_member(topic, user.get("id")) and user.get("role") != "admin"):
        raise ApiError("只有项目成员才能查看项目动态", 403)
    ensure_topic_workspace(topic)
    limit = max(1, min(200, int(request.args.get("limit", "100"))))
    return send_json({"activities": topic.get("activities", [])[:limit]})


def outcome_route(topic: dict[str, Any], user: dict[str, Any] | None) -> Response:
    ensure_topic_workspace(topic)
    if not user or (not is_member(topic, user.get("id")) and user.get("role") != "admin"):
        raise ApiError("只有项目成员才能查看项目成果", 403)
    if request.method == "GET":
        return send_json({"outcome": topic.get("outcome")})
    if request.method == "PATCH":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人可以编辑项目成果", 403)
        body = json_body()
        links = body.get("links") if isinstance(body.get("links"), list) else []
        topic["outcome"] = {
            "summary": sec.clean_text(body.get("summary"), 2000),
            "process": sec.clean_text(body.get("process"), 4000),
            "final": sec.clean_text(body.get("final"), 2000),
            "links": [x for x in links if isinstance(x, dict)][:20],
            "awards": sec.clean_text(body.get("awards"), 1000),
            "updatedAt": now_ms(),
            "updatedBy": user.get("id"),
        }
        add_activity(topic, user, "outcome_updated", "更新项目成果")
        STATE.save()
        return send_json({"outcome": topic["outcome"]})
    raise ApiError("请求方法不允许", 405)


def project_status_route(topic: dict[str, Any], user: dict[str, Any] | None) -> Response:
    ensure_topic_workspace(topic)
    if not is_owner(topic, user):
        raise ApiError("只有项目负责人可以修改项目状态", 403)
    body = json_body()
    status = str(body.get("status") or "")
    old = topic.get("status", "recruiting")
    if status not in PROJECT_STATUSES:
        raise ApiError("项目状态不合法")
    if status not in PROJECT_TRANSITIONS.get(old, set()):
        raise ApiError(f"不允许从 {old} 变更为 {status}")
    topic["status"] = status
    topic["updatedAt"] = now_ms()
    add_activity(topic, user, "project_status", f"项目状态变更为 {status}", {"from": old, "to": status})
    notify_others(topic, user.get("id", ""), {"type": "PROJECT_STATUS", "topicId": topic["id"], "topicTitle": topic.get("title"), "from": user.get("nickname"), "text": "项目状态已变更为：" + status})
    STATE.save()
    broadcast_topic(topic, "topics", {"topicId": topic["id"]})
    return send_json({"topic": view_topic(topic, user)})


def owner_transfer_route(topic: dict[str, Any], user: dict[str, Any] | None) -> Response:
    if not is_owner(topic, user):
        raise ApiError("只有项目负责人可以转移负责人", 403)
    body = json_body()
    target_id = sec.clean_text(body.get("userId"), 80, False)
    if not is_member(topic, target_id):
        raise ApiError("新负责人必须是项目成员")
    old_owner = topic.get("creatorId")
    topic["creatorId"] = target_id
    topic["members"] = [item for item in topic.get("members", []) if item.get("id") != target_id] + [item for item in topic.get("members", []) if item.get("id") == target_id]
    topic["updatedAt"] = now_ms()
    add_activity(topic, user, "owner_transferred", "项目负责人已转移", {"from": old_owner, "to": target_id})
    STATE.save()
    broadcast_topic(topic, "topics", {"topicId": topic["id"]})
    return send_json({"topic": view_topic(topic, user)})


def announcements_route(user: dict[str, Any] | None, parts: list[str]) -> Response:
    if not parts and request.method == "GET":
        now = now_ms()
        reads = STATE.state.setdefault("announcementReads", {}).setdefault(user.get("id"), []) if user else []
        items = []
        for raw in STATE.state.setdefault("announcements", []):
            if raw.get("status") != "published" or int(raw.get("publishAt") or 0) > now:
                continue
            item = dict(raw)
            item["read"] = item.get("id") in reads
            items.append(item)
        items.sort(key=lambda x: (bool(x.get("pinned")), int(x.get("publishAt") or 0)), reverse=True)
        unread = sum(1 for item in items if not item.get("read")) if user else 0
        return send_json({"announcements": items, "unread": unread})
    if len(parts) >= 2 and parts[1] == "read" and request.method == "POST":
        if not user:
            raise ApiError("请先登录", 401)
        item = next((a for a in STATE.state.setdefault("announcements", []) if a.get("id") == parts[0]), None)
        if not item or item.get("status") != "published":
            raise ApiError("公告不存在", 404)
        reads = STATE.state.setdefault("announcementReads", {}).setdefault(user["id"], [])
        if item["id"] not in reads:
            reads.append(item["id"])
            STATE.save()
        return send_json({"ok": True})
    raise ApiError("接口不存在", 404)


def appeals_route(user: dict[str, Any] | None, parts: list[str]) -> Response:
    if not user:
        raise ApiError("请先登录", 401)
    appeals = STATE.state.setdefault("appeals", [])
    if not parts and request.method == "GET":
        return send_json({"appeals": [dict(item) for item in appeals if item.get("userId") == user.get("id")]})
    if not parts and request.method == "POST":
        body = json_body()
        appeal = {
            "id": new_id("ap"),
            "userId": user.get("id"),
            "nickname": user.get("nickname"),
            "penaltyType": sec.clean_text(body.get("penaltyType"), 12, False),
            "reason": sec.clean_text(body.get("reason"), 500),
            "status": "pending",
            "createdAt": now_ms(),
            "handledAt": 0,
            "handledByName": "",
            "result": "",
        }
        if appeal["penaltyType"] not in {"mute", "ban"} or not appeal["reason"]:
            raise ApiError("请填写处罚类型和申诉理由")
        appeals.insert(0, appeal)
        STATE.save()
        return send_json({"appeal": appeal})
    raise ApiError("接口不存在", 404)


def agent_route(user: dict[str, Any] | None, parts: list[str]):
    if not user:
        raise ApiError("请先登录", 401)

    method = request.method

    if len(parts) >= 2 and parts[1] == "status":
        if method != "GET":
            raise ApiError("请求方法不允许", 405)
        project_id = sec.clean_text(request.args.get("projectId"), 80, False)
        if not project_id:
            raise ApiError("缺少 projectId")
        topic, current_user = agent_project_access(project_id, user, True)
        status = AGENT_SERVICE.get_status(topic["id"])

        from agent.discussion.parser import parse_messages

        messages = [
            item
            for item in STATE.state["messages"].get(topic["id"], [])
            if not item.get("recalled") and str(item.get("text") or "").strip()
        ]
        discussion = parse_messages(messages)
        question_count = sum(
            1
            for group in ("facts", "decisions", "opinions", "uncertain")
            for item in discussion.get(group, [])
            if item.get("is_question")
        )

        return send_json(
            {
                "agent": {
                    **status,
                    "projectId": topic["id"],
                    "role": agent_role(topic, current_user),
                    "isLeader": is_owner(topic, current_user),
                    "isAdmin": current_user.get("role") == "admin",
                    "metrics": {
                        "discussions": len(messages),
                        "directions": len(topic.get("directions") or []),
                        "questions": question_count,
                        "materials": len(STATE.state["files"].get(topic["id"], [])),
                    },
                }
            }
        )

    if len(parts) >= 2 and parts[1] == "authorize":
        if method != "POST":
            raise ApiError("请求方法不允许", 405)
        body = json_body()
        project_id = sec.clean_text(body.get("projectId"), 80, False)
        if not project_id:
            raise ApiError("缺少 projectId")
        topic, current_user = agent_project_access(project_id, user, True)
        if not is_owner(topic, current_user):
            raise ApiError("只有项目负责人才能授权 Agent 开始思考", 403)
        result = AGENT_SERVICE.authorize_thinking(current_user, topic)
        if not result.get("success"):
            raise ApiError(result.get("error", "Agent 无法开始思考"), 409)
        return send_json({"ok": True, "agent": result})

    if len(parts) >= 2 and parts[1] == "analyze":
        if method != "POST":
            raise ApiError("请求方法不允许", 405)

        body = json_body()

        project_id = sec.clean_text(
            body.get("projectId"),
            80,
            False,
        )

        if not project_id:
            raise ApiError("缺少 projectId")

        topic, current_user = agent_project_access(
            project_id,
            user,
            True,
        )

        if not is_owner(topic, current_user):
            raise ApiError("只有项目负责人才能启动 Agent 分析", 403)

        status = AGENT_SERVICE.get_status(topic["id"])

        if not status.get(
            "enabled",
            True,
        ):
            raise ApiError(
                "Agent 当前已被管理员关闭",
                403,
            )

        if status.get("state") != "thinking":
            raise ApiError(
                "Agent 当前没有获得本轮思考授权",
                403,
            )

        ensure_rate(
            "agent_analyze:" + current_user["id"],
            int(os.environ.get("RATE_AGENT_ANALYZE_USER", "10")),
            3600,
        )

        # -------------------------
        # 1. 获取真实项目讨论
        # -------------------------

        messages = STATE.state["messages"].get(
            topic["id"],
            [],
        )[-500:]

        # -------------------------
        # 2. 从真实讨论中生成
        #    决定 / 问题 / 方向
        #
        # 注意：
        # 这些不是数据库硬编码，
        # 而是 Agent 的分析上下文。
        # -------------------------

        decisions = []

        questions = []

        research_directions = []

        # -------------------------
        # 3. 当前项目本身已经存在
        #    的研究方向
        # -------------------------

        for direction in topic.get("directions", []) or []:
            research_directions.append(
                {
                    "id": (f"{topic['id']}:" f"direction:" f"{direction}"),
                    "content": str(direction),
                    "source": (topic["id"]),
                    "source_type": "project",
                    "verified": True,
                }
            )

        # -------------------------
        # 4. 项目文件
        #
        # Agent 此阶段只看到文件
        # 元数据，不直接读取文件内容。
        # -------------------------

        project_files = STATE.state["files"].get(
            topic["id"],
            [],
        )

        # -------------------------
        # 5. 项目进度
        #
        # 当前 ProjectHub 没有独立
        # progress 数据表，所以不
        # 虚构进度。
        # -------------------------

        progress = {
            "source": "projecthub",
            "available": False,
            "reason": ("当前版本尚未建立独立项目进度数据结构"),
        }

        # -------------------------
        # 6. 公共资料
        #
        # 当前版本文件系统中的项目文件
        # 先作为资料元数据。
        # -------------------------

        public_materials = []

        for file_item in project_files:
            public_materials.append(
                {
                    "id": file_item.get("id"),
                    "title": file_item.get("name"),
                    "type": file_item.get("type"),
                    "size": file_item.get("size"),
                    "source": topic["id"],
                    "source_type": "project_file",
                    "verified": True,
                }
            )

        # -------------------------
        # 7. 调用 Agent
        # -------------------------

        result = AGENT_SERVICE.analyze(
            user=current_user,
            project=topic,
            messages=messages,
            decisions=decisions,
            questions=questions,
            research_directions=(research_directions),
            progress=progress,
            public_materials=(public_materials),
            files=project_files,
        )

        if not result.get("success", False):
            raise ApiError(result.get("error", "Agent 分析失败"), 503)

        return send_json({"ok": True, "agent": result})
    if len(parts) >= 3 and parts[1] == "admin" and parts[2] in {"enable", "disable", "stop"}:
        if method != "POST":
            raise ApiError("请求方法不允许", 405)
        if user.get("role") != "admin":
            raise ApiError("需要管理员权限", 403)
        body = json_body()
        project_id = sec.clean_text(body.get("projectId"), 80, False)
        if not project_id:
            raise ApiError("缺少 projectId")
        if not find_topic(project_id):
            raise ApiError("项目不存在", 404)
        if parts[2] == "enable":
            result = AGENT_SERVICE.enable_project_agent(user, project_id)
        elif parts[2] == "disable":
            result = AGENT_SERVICE.disable_project_agent(user, project_id)
        else:
            result = AGENT_SERVICE.emergency_stop(user, project_id)
        return send_json({"ok": bool(result.get("success")), "agent": result})

    if len(parts) >= 3 and parts[1] == "admin" and parts[2] in {"audit", "security"}:
        if method != "GET":
            raise ApiError("请求方法不允许", 405)
        if user.get("role") != "admin":
            raise ApiError("需要管理员权限", 403)
        project_id = sec.clean_text(request.args.get("projectId"), 80, False)
        if not project_id:
            raise ApiError("缺少 projectId")
        if not find_topic(project_id):
            raise ApiError("项目不存在", 404)
        try:
            limit = int(request.args.get("limit", "100"))
        except (TypeError, ValueError):
            limit = 100
        limit = max(1, min(500, limit))
        if parts[2] == "audit":
            result = AGENT_SERVICE.get_audit_logs(user, project_id, limit)
            if not result.get("success"):
                raise ApiError(result.get("error", "无法读取审计日志"), 403)
            logs = result.get("events", [])
            return send_json({"logs": logs, "count": len(logs)})

        result = AGENT_SERVICE.get_security_events(user, project_id, limit)
        if not result.get("success"):
            raise ApiError(result.get("error", "无法读取安全事件"), 403)
        events = result.get("events", [])
        return send_json({"events": events, "count": len(events)})

    raise ApiError("Agent 接口不存在", 404)


def dispatch_api(path: str):
    parts = [p for p in path.split("/") if p]
    method = request.method
    user = auth_user()
    if method == "OPTIONS":
        return send_json({}, 204)
    if not parts:
        raise ApiError("接口不存在", 404)
    p1 = parts[0]
    if p1 == "agent":
        return agent_route(user, parts)
    if p1 == "health":
        return send_json({"ok": True, "storage": "sqlite", "revision": STATE.revision})
    if p1 == "sse" and len(parts) >= 2 and parts[1] == "ticket" and method == "POST":
        if not user:
            raise ApiError("请先登录", 401)
        return send_json({"ticket": issue_sse_ticket(user["id"]), "expiresInMs": 60000})
    if p1 == "register" and method == "POST":
        return register()
    if p1 == "login" and method == "POST":
        return login()
    if p1 == "logout" and method == "POST":
        return logout()
    if p1 == "me":
        if not user:
            raise ApiError("未登录", 401)
        if method == "GET":
            return send_json({"user": public_user(user)})
        if method == "PATCH":
            body = json_body()
            if isinstance(body.get("directions"), list):
                user["directions"] = [x for x in body["directions"] if isinstance(x, str) and x in MAJOR_IDS][:5]
            if isinstance(body.get("grade"), str) and body["grade"]:
                user["grade"] = sec.clean_text(body["grade"], 12, False)
            STATE.save()
            return send_json({"user": public_user(user)})
    if p1 == "topics" and len(parts) == 1:
        return topics_collection(user)
    if p1 == "inbox" and method == "GET":
        if not user:
            raise ApiError("未登录", 401)
        items = []
        for app_item in sorted(STATE.state["applications"], key=lambda x: x.get("createdAt", 0), reverse=True):
            topic = find_topic(app_item.get("topicId", ""))
            if topic and topic.get("creatorId") == user["id"]:
                items.append({**app_item, "topicTitle": topic.get("title"), "topicCode": topic.get("code")})
        return send_json({"applications": items})
    if p1 == "my-applications" and method == "GET":
        latest: dict[str, dict[str, Any]] = {}
        for app_item in sorted(STATE.state["applications"], key=lambda x: x.get("createdAt", 0)):
            if user and app_item.get("userId") == user["id"]:
                latest[app_item.get("topicId", "")] = app_item
        return send_json(
            {
                "applications": [
                    {
                        "topicId": a.get("topicId"),
                        "applicationId": a.get("id"),
                        "status": a.get("status"),
                        "at": a.get("createdAt"),
                        "decidedAt": a.get("decidedAt", 0),
                    }
                    for a in latest.values()
                ]
            }
        )
    if p1 == "notifications":
        if len(parts) >= 2 and parts[1] == "read":
            return notifications_route(user, "read")
        return notifications_route(user, "")
    if p1 == "reports" and method == "POST":
        return reports_route(user)
    if p1 == "announcements":
        return announcements_route(user, parts[1:])
    if p1 == "appeals":
        return appeals_route(user, parts[1:])
    if p1 == "admin":
        return admin_route(user, parts)
    if p1 == "applications" and len(parts) >= 3 and parts[2] in {"approve", "reject"} and method == "POST":
        return process_application(user, parts[1], parts[2])
    if p1 == "files" and len(parts) == 2 and method == "GET":
        return download_file(parts[1])
    if p1 == "topics" and len(parts) >= 2:
        topic = find_topic(parts[1])
        if not topic:
            raise ApiError("话题不存在", 404)
        action = parts[2] if len(parts) > 2 else ""
        if not action:
            return topic_detail(topic, user, action)
        if action == "messages":
            return messages_route(topic, user, parts)
        if action == "applications":
            return applications_route(topic, user)
        if action == "files":
            return files_route(topic, user)
        if action == "members":
            if len(parts) >= 5 and parts[-1] == "tag" and method == "POST":
                return tag_route(topic, user, parts[3])
            return members_route(topic, user)
        if action == "status" and method == "POST":
            return project_status_route(topic, user)
        if action == "owner" and method == "POST":
            return owner_transfer_route(topic, user)
        if action == "tasks":
            return tasks_route(topic, user, parts[3:])
        if action == "resources":
            return resources_route(topic, user, parts[3:])
        if action == "activities" and method == "GET":
            return activities_route(topic, user)
        if action == "outcome":
            return outcome_route(topic, user)
    raise ApiError("接口不存在", 404)


@app.route("/api/events")
def events():
    user_id = consume_sse_ticket(request.args.get("ticket", ""))
    if not user_id:
        raise ApiError("实时连接鉴权失败，请重新连接", 401)
    connection_id, q = SSE.add(user_id, sec.client_ip(request))

    def stream():
        try:
            yield "retry: 3000" + chr(10) + chr(10)
            yield "event: hello" + chr(10) + "data: {}" + chr(10) + chr(10)
            while True:
                try:
                    yield q.get(timeout=20)
                except queue.Empty:
                    yield ": ping" + chr(10) + chr(10)
        finally:
            SSE.remove(connection_id)

    return Response(
        stream_with_context(stream()), mimetype="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    )


@app.route("/api/<path:path>", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
def api_catchall(path: str):
    return dispatch_api(path)


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/project/<project_id>")
def project_page(project_id: str):
    return send_from_directory(app.static_folder, "index.html")


@app.errorhandler(413)
def too_large(_error):
    return send_json({"error": "请求体过大"}, 413)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8787")), threaded=True)
