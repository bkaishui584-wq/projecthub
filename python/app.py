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

import ai
import security as sec
from storage import StateConflictError, StateManager, empty_state

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
os.environ.setdefault("PORT", "8787")
os.environ.setdefault("ADMIN_NICKNAME", "白开水")

DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE = StateManager(DATA_DIR / "projecthub.sqlite3", DATA_DIR / "store.json")
STATE.init()
if sec.ensure_security(STATE.state):
    STATE.save()

app = Flask(__name__, static_folder=str(BASE_DIR / "static"), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_CONTENT_LENGTH", 8 * 1024 * 1024))
app.config["JSON_AS_ASCII"] = False

ADMIN_NICKNAME = os.environ.get("ADMIN_NICKNAME", "白开水")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_PASSWORD_REVISION = os.environ.get("ADMIN_PASSWORD_REVISION", "1").strip() or "1"
SESSION_TTL = 7 * 24 * 3600
SESSION_COOKIE = "ph_session"
CSRF_COOKIE = "ph_csrf"
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", 5 * 1024 * 1024))
MAX_STORAGE_PER_USER = int(os.environ.get("MAX_STORAGE_PER_USER", 50 * 1024 * 1024))
ROLE_TAGS = ["项目策划", "技术成员", "设计成员", "文案/材料成员", "调研成员", "答辩成员"]
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


def missing_tags(topic: dict[str, Any]) -> list[str]:
    filled = {m.get("tag") for m in topic.get("members", []) if m.get("tag")}
    return [tag for tag in topic.get("neededRoles", []) if tag not in filled]


def public_topic(topic: dict[str, Any]) -> dict[str, Any]:
    copy = dict(topic)
    for key in ("password", "passwordHash", "passwordSalt", "ai"):
        copy.pop(key, None)
    copy["pendingApplications"] = sum(
        1 for app in STATE.state["applications"] if app.get("topicId") == topic.get("id") and app.get("status") == "pending"
    )
    copy["missingTags"] = missing_tags(topic)
    return copy


def view_topic(topic: dict[str, Any], user: dict[str, Any] | None) -> dict[str, Any]:
    copy = public_topic(topic)
    copy["aiEnabled"] = bool((topic.get("ai") or {}).get("enabled"))
    copy["aiRounds"] = int((topic.get("ai") or {}).get("rounds", 0))
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


def default_ai() -> dict[str, Any]:
    return {
        "enabled": False,
        "status": "idle",
        "phase": "ANALYZE",
        "rounds": 0,
        "promptVersion": ai.PROMPT_VERSION,
        "draft": "",
        "options": [],
        "announcement": None,
        "deep": None,
        "source": "local",
        "model": "本地演示模式",
        "updatedAt": 0,
    }


def ensure_ai(topic: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(topic.get("ai"), dict):
        topic["ai"] = default_ai()
    return topic["ai"]


def ai_view(topic: dict[str, Any], user: dict[str, Any] | None) -> dict[str, Any]:
    value = ensure_ai(topic)
    base = {
        "enabled": bool(value.get("enabled")),
        "status": value.get("status", "idle"),
        "phase": value.get("phase", "ANALYZE"),
        "rounds": int(value.get("rounds", 0)),
        "promptVersion": value.get("promptVersion", ai.PROMPT_VERSION),
        "config": ai.public_config(),
    }
    if not value.get("enabled"):
        return base
    if not user or (not is_member(topic, user.get("id")) and not is_owner(topic, user)):
        return {**base, "error": "只有话题成员才能使用 AI 助手"}
    voters = {v for option in value.get("options", []) for v in option.get("votes", [])}
    options = [
        {"id": o.get("id"), "title": o.get("title"), "desc": o.get("desc"), "reason": o.get("reason"), "votes": len(o.get("votes", []))}
        for o in value.get("options", [])
    ]
    mine = next((o.get("id") for o in value.get("options", []) if user.get("id") in o.get("votes", [])), "")
    deep_items = (value.get("deep") or {}).get("items", [])
    deep_mine = next((item for item in deep_items if item.get("memberId") == user.get("id")), None)
    return {
        **base,
        "draft": value.get("draft", ""),
        "announcement": value.get("announcement"),
        "options": options,
        "myVote": mine,
        "voters": len(voters),
        "totalMembers": len(topic.get("members", [])),
        "canDeep": int(value.get("rounds", 0)) >= 3 and is_owner(topic, user),
        "deepMine": deep_mine,
        "deepAll": value.get("deep") if is_owner(topic, user) else None,
        "source": value.get("source", "local"),
        "model": value.get("model", "本地演示模式"),
        "updatedAt": value.get("updatedAt", 0),
    }


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


def close_voting(topic: dict[str, Any]) -> dict[str, Any]:
    value = ensure_ai(topic)
    max_votes = -1
    winners: list[dict[str, Any]] = []
    for option in value.get("options", []):
        count = len(option.get("votes", []))
        if count > max_votes:
            max_votes, winners = count, [option]
        elif count == max_votes:
            winners.append(option)
    winner = next((x for x in winners if x.get("id") == "rethink"), winners[0] if winners else None)
    value["rounds"] = int(value.get("rounds", 0)) + 1
    if not winner or winner.get("id") == "rethink":
        value["status"] = "rethink"
        value["phase"] = "CLARIFY"
        for member in topic.get("members", []):
            notify(
                member.get("id", ""),
                {
                    "type": "PROJECT_UPDATE",
                    "topicId": topic.get("id"),
                    "topicTitle": topic.get("title"),
                    "from": "AI 助手",
                    "text": "本轮投票选择了「再想想」",
                },
            )
    else:
        value["status"] = "decided"
        value["phase"] = "RECOMMEND"
        value["announcement"] = {
            "text": str(winner.get("title", "")) + "：" + str(winner.get("desc", "")),
            "optionId": winner.get("id"),
            "round": value["rounds"],
            "at": now_ms(),
        }
        for member in topic.get("members", []):
            notify(
                member.get("id", ""),
                {
                    "type": "PROJECT_UPDATE",
                    "topicId": topic.get("id"),
                    "topicTitle": topic.get("title"),
                    "from": "AI 助手",
                    "text": "新公告：" + value["announcement"]["text"][:60],
                },
            )
    value["updatedAt"] = now_ms()
    return value


def ensure_admin() -> None:
    admin = find_user_by_nickname(ADMIN_NICKNAME)
    if admin:
        # Updating ADMIN_PASSWORD alone must not silently keep an old hash.
        # A revision change applies the new password once and invalidates old sessions.
        if ADMIN_PASSWORD and str(admin.get("passwordRevision") or "") != ADMIN_PASSWORD_REVISION:
            salt = sec.make_salt()
            admin["salt"] = salt
            admin["hash"] = sec.hash_password(ADMIN_PASSWORD, salt)
            admin["passwordRevision"] = ADMIN_PASSWORD_REVISION
            for token, session in list(STATE.state["sessions"].items()):
                if session.get("userId") == admin.get("id"):
                    STATE.state["sessions"].pop(token, None)
            STATE.save()
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
        "passwordRevision": ADMIN_PASSWORD_REVISION,
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
        same = origin == f"{request.scheme}://{request.host}"
        if not same and origin not in allowed:
            raise ApiError("请求来源不被允许", 403)
    return None


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return send_json({"error": error.message}, error.status)


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
        return send_json({"topics": [view_topic(topic, user) for topic in STATE.state["topics"]]})
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
        "ai": default_ai(),
        "createdAt": now_ms(),
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


def admin_route(user: dict[str, Any] | None, parts: list[str]):
    if not user or user.get("role") != "admin":
        raise ApiError("需要管理员权限", 403)
    if len(parts) >= 3 and parts[2] == "users" and len(parts) == 3 and request.method == "GET":
        users = []
        for item in STATE.state["users"].values():
            value = public_user(item) or {}
            value["topicCount"] = sum(1 for t in STATE.state["topics"] if t.get("creatorId") == item.get("id"))
            users.append(value)
        users.sort(key=lambda x: x.get("createdAt", 0))
        return send_json({"users": users})
    if len(parts) >= 5 and parts[2] == "users" and parts[4] == "ban" and request.method == "POST":
        target = STATE.state["users"].get(parts[3])
        if not target:
            raise ApiError("用户不存在", 404)
        if target.get("role") == "admin":
            raise ApiError("不能封禁管理员账号", 403)
        body = json_body()
        target["banned"] = bool(body.get("banned"))
        if target["banned"]:
            for token, session in list(STATE.state["sessions"].items()):
                if session.get("userId") == target.get("id"):
                    STATE.state["sessions"].pop(token, None)
        STATE.save()
        return send_json({"user": public_user(target)})
    if len(parts) >= 4 and parts[2] == "reports":
        if len(parts) == 3 and request.method == "GET":
            return send_json({"reports": STATE.state["reports"][:200]})
        if parts[4] == "resolve" and request.method == "POST":
            report = next((r for r in STATE.state["reports"] if r.get("id") == parts[3]), None)
            if not report:
                raise ApiError("举报不存在", 404)
            report["status"] = "resolved"
            report["handledAt"] = now_ms()
            report["handledBy"] = user.get("nickname")
            STATE.save()
            return send_json({"report": report})
    raise ApiError("接口不存在", 404)


def files_route(topic: dict[str, Any], user: dict[str, Any] | None):
    if request.method == "GET":
        if not user or (not is_member(topic, user["id"]) and user.get("role") != "admin"):
            raise ApiError("只有话题成员才能查看文件", 403)
        files = [dict(f, url="api/files/" + f.get("id", "")) for f in STATE.state["files"].get(topic["id"], [])]
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
        return send_json({"file": {**meta, "url": "api/files/" + file_id}})
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


def ai_route(topic: dict[str, Any], user: dict[str, Any] | None, parts: list[str]):
    action = parts[3] if len(parts) > 3 else ""
    if request.method == "GET":
        if not user:
            raise ApiError("请先登录", 401)
        return send_json({"ai": ai_view(topic, user)})
    if action == "toggle":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人才能设置 AI 助手", 403)
        body = json_body()
        value = ensure_ai(topic)
        value["enabled"] = bool(body.get("enabled"))
        if not value["enabled"]:
            value["status"] = "idle"
            value["options"] = []
        value["updatedAt"] = now_ms()
        STATE.save()
        return send_json({"ai": ai_view(topic, user)})
    if action == "think":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人才能让 AI 开始思考", 403)
        value = ensure_ai(topic)
        if not value.get("enabled"):
            raise ApiError("还没有引入 AI 助手")
        if int(value.get("rounds", 0)) >= 10:
            raise ApiError("已达到 10 轮思考上限")
        ensure_rate("ai:" + topic["id"], int(os.environ.get("RATE_AI_TOPIC", "10")), 3600)
        value.update({"status": "thinking", "phase": "ANALYZE", "draft": "", "options": [], "updatedAt": now_ms()})
        STATE.save()
        messages = STATE.state["messages"].get(topic["id"], [])
        draft = ai.generate_draft(topic, messages)
        directions = ai.generate_directions(topic, messages, draft["draft"])
        value.update({"draft": draft["draft"], "source": draft["source"], "model": draft["model"], "status": "voting", "phase": "WAIT_FOR_LEADER"})
        value["options"] = [
            {"id": f"o{i + 1}", "title": d.get("title", ""), "desc": d.get("desc", ""), "reason": d.get("reason", ""), "votes": []}
            for i, d in enumerate(directions.get("directions", [])[:4])
        ]
        value["options"].append({"id": "rethink", "title": "再想想", "desc": "这些方向都不太符合预期，想继续和组员讨论。", "reason": "", "votes": []})
        value["updatedAt"] = now_ms()
        STATE.save()
        broadcast_topic(topic, "ai", {"topicId": topic["id"]})
        return send_json({"ai": ai_view(topic, user)})
    if action == "vote":
        if not user or not is_member(topic, user["id"]):
            raise ApiError("只有话题成员才能投票", 403)
        value = ensure_ai(topic)
        if value.get("status") != "voting":
            raise ApiError("现在不在投票阶段")
        option_id = str(json_body().get("optionId") or "")
        option = next((o for o in value.get("options", []) if o.get("id") == option_id), None)
        if not option:
            raise ApiError("选项不存在")
        for item in value.get("options", []):
            item["votes"] = [v for v in item.get("votes", []) if v != user["id"]]
        option["votes"].append(user["id"])
        voters = {v for item in value.get("options", []) for v in item.get("votes", [])}
        if len(voters) >= len(topic.get("members", [])):
            close_voting(topic)
        value["updatedAt"] = now_ms()
        STATE.save()
        broadcast_topic(topic, "ai", {"topicId": topic["id"]})
        return send_json({"ai": ai_view(topic, user)})
    if action == "close":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人才能结束投票", 403)
        value = ensure_ai(topic)
        if value.get("status") != "voting":
            raise ApiError("现在不在投票阶段")
        close_voting(topic)
        STATE.save()
        broadcast_topic(topic, "ai", {"topicId": topic["id"]})
        return send_json({"ai": ai_view(topic, user)})
    if action == "deep":
        if not is_owner(topic, user):
            raise ApiError("只有项目负责人才能发起深度分工", 403)
        value = ensure_ai(topic)
        if int(value.get("rounds", 0)) < 3:
            raise ApiError("需要先完成 3 轮以上的思考与投票")
        value.update({"status": "thinking", "phase": "DECOMPOSE", "updatedAt": now_ms()})
        STATE.save()
        deep = ai.generate_deep_plan(topic, STATE.state["messages"].get(topic["id"], []), value.get("draft", ""))
        items = []
        for item in deep.get("items", []):
            member = next((m for m in topic.get("members", []) if m.get("nickname") == item.get("nickname")), None)
            if member:
                items.append({**item, "memberId": member.get("id")})
        value["deep"] = {"at": now_ms(), "items": items, "source": deep.get("source"), "model": deep.get("model")}
        value["status"] = "assigned"
        value["phase"] = "ASSIGN"
        for item in items:
            notify(
                item.get("memberId", ""),
                {
                    "type": "TASK_ASSIGNMENT",
                    "topicId": topic["id"],
                    "topicTitle": topic.get("title"),
                    "from": "AI 助手",
                    "text": "你的项目任务与学习建议已经生成",
                },
            )
        value["updatedAt"] = now_ms()
        STATE.save()
        broadcast_topic(topic, "ai", {"topicId": topic["id"]})
        return send_json({"ai": ai_view(topic, user)})
    raise ApiError("接口不存在", 404)


def reports_route(user: dict[str, Any] | None):
    if not user or user.get("banned"):
        raise ApiError("请先登录再举报", 403)
    ensure_rate("report:" + user["id"], 5, 3600)
    body = json_body()
    reason = sec.clean_text(body.get("reason"), 60, False)
    detail = sec.clean_text(body.get("detail"), 500)
    topic_id = sec.clean_text(body.get("topicId"), 40, False)
    target_user_id = sec.clean_text(body.get("targetUserId"), 40, False)
    if not reason:
        raise ApiError("请选择举报类型")
    topic = find_topic(topic_id) if topic_id else None
    report = {
        "id": new_id("r"),
        "reporterId": user["id"],
        "reporterName": user.get("nickname"),
        "topicId": topic.get("id") if topic else "",
        "topicTitle": topic.get("title") if topic else "",
        "targetUserId": target_user_id,
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
            notify(
                admin.get("id", ""),
                {
                    "type": "REPORT_CREATED",
                    "topicId": report["topicId"],
                    "topicTitle": report["topicTitle"],
                    "from": user.get("nickname"),
                    "text": "收到一条举报：" + reason,
                },
            )
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


def dispatch_api(path: str):
    parts = [p for p in path.split("/") if p]
    method = request.method
    user = auth_user()
    if method == "OPTIONS":
        return send_json({}, 204)
    if not parts:
        raise ApiError("接口不存在", 404)
    p1 = parts[0]
    if p1 == "health":
        return send_json({"ok": True, "storage": "sqlite", "revision": STATE.revision})
    if p1 == "sse" and len(parts) >= 2 and parts[1] == "ticket" and method == "POST":
        if not user:
            raise ApiError("请先登录", 401)
        return send_json({"ticket": issue_sse_ticket(user["id"]), "expiresInMs": 60000})
    if p1 == "ai" and len(parts) >= 2 and parts[1] == "config" and method == "GET":
        if not user:
            raise ApiError("请先登录", 401)
        return send_json({"config": ai.public_config()})
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
        if action == "ai":
            return ai_route(topic, user, ["topics", topic["id"]] + parts[2:])
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


@app.errorhandler(413)
def too_large(_error):
    return send_json({"error": "请求体过大"}, 413)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8787")), threaded=True)
