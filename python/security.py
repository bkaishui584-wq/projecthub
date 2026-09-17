"""Security primitives for the Python ProjectHub server."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import time
from typing import Any

from flask import Request

PASSWORD_MIN = 10
PASSWORD_MAX = 128
WEAK_PASSWORDS = {
    "1234567890", "12345678", "123456789", "password", "password1",
    "qwerty123", "abc123456", "1111111111", "0000000000", "admin12345",
    "iloveyou123", "a123456789",
}


def now_ms() -> int:
    return int(time.time() * 1000)


def clean_text(value: Any, max_len: int, keep_newlines: bool = True) -> str:
    text = "" if value is None else str(value)
    chars = []
    for ch in text:
        code = ord(ch)
        if ch in "\r\n":
            if keep_newlines:
                chars.append("\n")
        elif code >= 32 and code != 127:
            chars.append(ch)
    out = "".join(chars).strip()
    return out[:max_len]


def validate_password(password: Any) -> str | None:
    if not isinstance(password, str) or not password:
        return "请填写密码"
    if len(password) < PASSWORD_MIN:
        return f"密码至少需要 {PASSWORD_MIN} 位"
    if len(password) > PASSWORD_MAX:
        return f"密码不能超过 {PASSWORD_MAX} 位"
    if password.lower() in WEAK_PASSWORDS:
        return "密码过于简单，请更换"
    if len(set(password)) == 1:
        return "密码不能是重复字符"
    return None


def make_salt() -> str:
    return secrets.token_hex(16)


def hash_password(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=2**14, r=8, p=1, dklen=64).hex()


def verify_password(user: dict[str, Any], password: str) -> bool:
    try:
        actual = hash_password(password, str(user.get("salt", "")))
        return hmac.compare_digest(actual, str(user.get("hash", "")))
    except Exception:
        return False


def safe_equal(a: Any, b: Any) -> bool:
    return hmac.compare_digest(str(a).encode("utf-8"), str(b).encode("utf-8"))


def ensure_security(state: dict[str, Any]) -> bool:
    security = state.setdefault("security", {"csrf_secret": ""})
    if security.get("csrf_secret"):
        return False
    security["csrf_secret"] = secrets.token_hex(32)
    state["sessions"] = {}
    return True


def issue_csrf(state: dict[str, Any], user_id: str, ttl_seconds: int = 7 * 24 * 3600) -> str:
    payload = f"{user_id}.{now_ms() + ttl_seconds * 1000}.{secrets.token_hex(16)}"
    encoded = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
    secret = str(state.get("security", {}).get("csrf_secret", ""))
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()).decode("ascii").rstrip("=")
    return f"{encoded}.{signature}"


def verify_csrf(state: dict[str, Any], token: str, user_id: str) -> bool:
    try:
        encoded, signature = token.rsplit(".", 1)
        secret = str(state.get("security", {}).get("csrf_secret", ""))
        expected = base64.urlsafe_b64encode(hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()).decode("ascii").rstrip("=")
        if not hmac.compare_digest(signature, expected):
            return False
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        uid, expires, _ = payload.split(".", 2)
        return uid == str(user_id) and int(expires) > now_ms()
    except Exception:
        return False


def client_ip(request: Request) -> str:
    if os.environ.get("TRUST_PROXY") == "1":
        value = str(request.headers.get("X-Forwarded-For", "")).split(",")[0].strip()
        if value:
            return value
    return request.remote_addr or "unknown"


def sniff_file(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG"):
        return "png"
    if data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        return "zip"
    if data.startswith(b"\xd0\xcf\x11\xe0"):
        return "ole"
    return None


def validate_json_shape(value: Any, max_depth: int = 8, max_array: int = 200, max_string: int = 2000, depth: int = 1) -> str | None:
    if depth > max_depth:
        return "JSON 嵌套层数过深"
    if value is None or isinstance(value, (bool, int, float)):
        return None
    if isinstance(value, str):
        return None if len(value) <= max_string else "字段内容过长"
    if isinstance(value, list):
        if len(value) > max_array:
            return "数组元素过多"
        for item in value:
            error = validate_json_shape(item, max_depth, max_array, max_string, depth + 1)
            if error:
                return error
        return None
    if isinstance(value, dict):
        if len(value) > 100:
            return "对象字段过多"
        for item in value.values():
            error = validate_json_shape(item, max_depth, max_array, max_string, depth + 1)
            if error:
                return error
        return None
    return "不支持的字段类型"


def security_headers() -> dict[str, str]:
    return {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    }
