from __future__ import annotations

import re
from typing import Any

from agent.tools.base import ToolContext


class AgentContextBuilder:
    """
    将 ProjectHub 的真实项目数据转换成 Agent 可读取的安全上下文。

    注意：
    Agent 只能获得项目授权范围内的数据。
    不允许把密码、Token、Session、CSRF、API Key 等敏感数据传给 Agent。
    """

    MAX_MESSAGES = 500
    MAX_TEXT_LENGTH = 3000
    MAX_TOTAL_TEXT = 60000
    MAX_LIST_ITEMS = 200

    SENSITIVE_FIELDS = {
        "password",
        "passwordHash",
        "passwordSalt",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "api_key",
        "apikey",
        "private_key",
        "cookie",
        "session",
        "session_id",
        "csrf",
        "csrf_token",
        "password_hash",
        "password_salt",
        "sessionid",
        "authorization",
    }

    def normalize_role(
        self,
        user: dict[str, Any] | None,
        project: dict[str, Any] | None = None,
    ) -> str:
        if not user:
            return "project_member"

        role = user.get("role")

        if role in {"admin", "system_admin"}:
            return "system_admin"

        if project and project.get("creatorId") == user.get("id"):
            return "project_leader"

        return "project_member"

    def _clean_value(
        self,
        value: Any,
        depth: int = 0,
    ) -> Any:
        if depth > 4:
            return None

        if isinstance(value, dict):
            result = {}

            for key, item in value.items():
                key_text = str(key)

                normalized_key = re.sub(r"[^a-z0-9]", "", key_text.lower())

                if key_text in self.SENSITIVE_FIELDS or normalized_key in {
                    re.sub(r"[^a-z0-9]", "", item.lower())
                    for item in self.SENSITIVE_FIELDS
                }:
                    continue

                result[key_text] = self._clean_value(
                    item,
                    depth + 1,
                )

            return result

        if isinstance(value, list):
            return [
                self._clean_value(
                    item,
                    depth + 1,
                )
                for item in value[: self.MAX_LIST_ITEMS]
            ]

        if isinstance(value, str):
            return value[: self.MAX_TEXT_LENGTH]

        return value

    def clean_project(
        self,
        project: dict[str, Any] | None,
    ) -> dict[str, Any]:
        project = project or {}

        allowed_fields = {
            "id",
            "title",
            "desc",
            "vibe",
            "directions",
            "required",
            "neededRoles",
            "type",
            "limit",
            "members",
            "createdAt",
        }

        result = {}

        for key in allowed_fields:
            if key in project:
                result[key] = self._clean_value(project[key])

        # 不把 AI 内部状态直接作为项目事实交给 Agent。
        result.pop("ai", None)

        return result

    def clean_messages(
        self,
        messages: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        result = []
        total_text = 0

        for message in reversed((messages or [])[-self.MAX_MESSAGES :]):
            if not isinstance(message, dict):
                continue

            if message.get("recalled"):
                continue

            text = str(message.get("text") or "").strip()

            if not text:
                continue

            remaining = self.MAX_TOTAL_TEXT - total_text
            if remaining <= 0:
                break

            safe_text = text[: min(self.MAX_TEXT_LENGTH, remaining)]
            total_text += len(safe_text)

            result.append(
                {
                    "id": message.get("id"),
                    "author": message.get("author"),
                    "authorName": message.get("authorName"),
                    "text": safe_text,
                    "replyTo": message.get("replyTo"),
                    "time": message.get("time"),
                    "at": message.get("at"),
                }
            )

        result.reverse()
        return result

    def clean_files(
        self,
        files: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        """
        Agent 只能看到公共文件的元数据。

        不直接读取文件内容。
        后续如果做文档 RAG，再单独经过授权的文档解析层。
        """

        result = []

        for item in (files or [])[: self.MAX_LIST_ITEMS]:
            if not isinstance(item, dict):
                continue

            result.append(
                {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "type": item.get("type"),
                    "size": item.get("size"),
                    "uploaderId": item.get("uploaderId"),
                    "uploaderName": item.get("uploaderName"),
                    "at": item.get("at"),
                }
            )

        return result

    def build_evidence(
        self,
        project: dict[str, Any],
        messages: list[dict[str, Any]],
        files: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        evidence = []

        # 项目基本资料
        if project.get("title"):
            evidence.append(
                {
                    "type": "project",
                    "source": project.get("id"),
                    "source_id": project.get("id"),
                    "content": ("项目名称：" + str(project.get("title"))),
                    "verified": True,
                }
            )

        if project.get("desc"):
            evidence.append(
                {
                    "type": "project",
                    "source": project.get("id"),
                    "source_id": project.get("id"),
                    "content": ("项目简介：" + str(project.get("desc"))),
                    "verified": True,
                }
            )

        if project.get("directions"):
            evidence.append(
                {
                    "type": "direction",
                    "source": project.get("id"),
                    "source_id": project.get("id"),
                    "content": (
                        "项目研究方向："
                        + "、".join(
                            map(
                                str,
                                project.get("directions") or [],
                            )
                        )
                    ),
                    "verified": True,
                }
            )

        if project.get("required"):
            evidence.append(
                {
                    "type": "direction",
                    "source": project.get("id"),
                    "source_id": project.get("id"),
                    "content": (
                        "项目要求方向："
                        + "、".join(
                            map(
                                str,
                                project.get("required") or [],
                            )
                        )
                    ),
                    "verified": True,
                }
            )

        # 聊天记录
        for message in messages:
            text = str(message.get("text") or "").strip()

            if not text:
                continue

            evidence.append(
                {
                    "type": "discussion",
                    "source": message.get("id"),
                    "source_id": message.get("id"),
                    "content": text,
                    "verified": True,
                    "author": message.get("author"),
                    "authorName": message.get("authorName"),
                    "time": message.get("time"),
                }
            )

        # 文件只作为存在性证据。
        for item in files:
            evidence.append(
                {
                    "type": "material",
                    "source": item.get("id"),
                    "source_id": item.get("id"),
                    "content": ("项目资料文件：" + str(item.get("name") or "")),
                    "verified": True,
                }
            )

        return evidence

    def build(
        self,
        user: dict[str, Any] | None,
        project: dict[str, Any] | None,
        messages: list[dict[str, Any]] | None,
        decisions: list[dict[str, Any]] | None = None,
        questions: list[dict[str, Any]] | None = None,
        research_directions: list[dict[str, Any]] | None = None,
        progress: dict[str, Any] | None = None,
        public_materials: list[dict[str, Any]] | None = None,
        files: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:

        safe_project = self.clean_project(project)

        safe_messages = self.clean_messages(messages)

        safe_files = self.clean_files(files)

        safe_decisions = self._clean_value(decisions or [])

        safe_questions = self._clean_value(questions or [])

        safe_research_directions = self._clean_value(research_directions or [])

        safe_progress = self._clean_value(progress or {})

        safe_public_materials = self._clean_value(public_materials or [])

        role = self.normalize_role(
            user,
            project,
        )

        evidence = self.build_evidence(
            safe_project,
            safe_messages,
            safe_files,
        )

        safe_data = {
            "project_id": safe_project.get("id"),
            "role": role,
            "message_count": len(safe_messages),
            "file_count": len(safe_files),
        }

        tool_safe_data = {
            **safe_data,
            "discussion": safe_messages,
            "decisions": safe_decisions,
            "questions": safe_questions,
            "research_directions": safe_research_directions,
            "progress": safe_progress,
            "public_materials": safe_public_materials,
            "files": safe_files,
        }

        tool_context = ToolContext(
            user_id=(user.get("id") if user else None),
            user_role=role,
            project_id=(safe_project.get("id") if safe_project else None),
            project=safe_project,
            safe_data=tool_safe_data,
        )

        return {
            "project": safe_project,
            "information": {
                "messages": safe_messages,
            },
            "decisions": safe_decisions,
            "questions": safe_questions,
            "research_directions": safe_research_directions,
            "research_candidates": [],
            "progress": safe_progress,
            "public_materials": safe_public_materials,
            "files": safe_files,
            "evidence": evidence,
            "tool_context": tool_context,
            "safe_data": safe_data,
        }
