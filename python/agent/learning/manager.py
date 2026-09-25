from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from agent.learning.experience import (
    Experience,
    ExperienceType,
)


class LearningManager:
    """
    Agent 长期学习管理器。

    核心原则：

    1. Agent 可以提出候选经验。
    2. Agent 不能自行确认经验。
    3. 只有具备足够权限的用户确认后，
       才能进入长期经验库。
    4. 未确认内容只能停留在 candidate。
    5. 被否定的经验不能作为正常经验调用。
    """

    STATUS_CANDIDATE = "candidate"

    STATUS_CONFIRMED = "confirmed"

    STATUS_REJECTED = "rejected"

    STATUS_ARCHIVED = "archived"

    ROLE_ADMIN = "system_admin"

    ROLE_LEADER = "project_leader"

    def __init__(self):

        self.experiences: dict[
            str,
            Experience,
        ] = {}

        self.candidates: dict[
            str,
            dict[str, Any],
        ] = {}

        self.counter = 0

    # =========================================================
    # ID
    # =========================================================

    def _new_id(self) -> str:

        self.counter += 1

        return f"exp_{self.counter}"

    # =========================================================
    # 创建候选经验
    # =========================================================

    def create_candidate(
        self,
        experience_type: str,
        title: str,
        content: str,
        source_project_id: str | None = None,
        source_message_ids: list[str] | None = None,
        keywords: list[str] | None = None,
        confidence: float = 0.0,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:

        experience_id = self._new_id()

        candidate = {
            "id": experience_id,
            "status": (self.STATUS_CANDIDATE),
            "type": experience_type,
            "title": title,
            "content": content,
            "source_project_id": (source_project_id),
            "source_message_ids": (source_message_ids or []),
            "keywords": (keywords or []),
            "confidence": max(
                0.0,
                min(
                    1.0,
                    float(confidence),
                ),
            ),
            "metadata": (metadata or {}),
            "created_at": (datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")),
        }

        self.candidates[experience_id] = candidate

        return dict(candidate)

    # =========================================================
    # 确认经验
    # =========================================================

    def confirm(
        self,
        experience_id: str,
        user_id: str,
        user_role: str,
        project_id: str | None = None,
    ) -> dict[str, Any]:

        if user_role not in {
            self.ROLE_ADMIN,
            self.ROLE_LEADER,
        }:
            return {
                "success": False,
                "error": "没有确认长期经验的权限",
            }

        candidate = self.candidates.get(experience_id)

        if not candidate:

            return {
                "success": False,
                "error": "经验候选不存在",
            }

        if (
            user_role == self.ROLE_LEADER
            and project_id
            and candidate.get("source_project_id") != project_id
        ):
            return {
                "success": False,
                "error": "不能确认其他项目的经验候选",
            }

        if candidate["status"] != (self.STATUS_CANDIDATE):

            return {
                "success": False,
                "error": "该经验当前不能确认",
            }

        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        experience = Experience(
            id=candidate["id"],
            type=candidate["type"],
            title=candidate["title"],
            content=candidate["content"],
            source_project_id=(candidate.get("source_project_id")),
            source_message_ids=list(
                candidate.get(
                    "source_message_ids",
                    [],
                )
            ),
            keywords=list(
                candidate.get(
                    "keywords",
                    [],
                )
            ),
            confirmed_by=user_id,
            confirmed_at=now,
            confidence=candidate.get(
                "confidence",
                0.0,
            ),
            reusable=True,
            metadata=dict(
                candidate.get(
                    "metadata",
                    {},
                )
            ),
        )

        self.experiences[experience.id] = experience

        candidate["status"] = self.STATUS_CONFIRMED

        candidate["confirmed_by"] = user_id

        candidate["confirmed_at"] = now

        return {
            "success": True,
            "experience": (experience.to_dict()),
        }

    # =========================================================
    # 拒绝候选经验
    # =========================================================

    def reject(
        self,
        experience_id: str,
        user_id: str,
        user_role: str,
        reason: str = "",
        project_id: str | None = None,
    ) -> dict[str, Any]:

        if user_role not in {
            self.ROLE_ADMIN,
            self.ROLE_LEADER,
        }:
            return {
                "success": False,
                "error": "没有处理经验候选的权限",
            }

        candidate = self.candidates.get(experience_id)

        if not candidate:

            return {
                "success": False,
                "error": "经验候选不存在",
            }

        if (
            user_role == self.ROLE_LEADER
            and project_id
            and candidate.get("source_project_id") != project_id
        ):
            return {
                "success": False,
                "error": "不能处理其他项目的经验候选",
            }

        candidate["status"] = self.STATUS_REJECTED

        candidate["rejected_by"] = user_id

        candidate["rejected_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        candidate["reject_reason"] = reason

        return {
            "success": True,
            "candidate": dict(candidate),
        }

    # =========================================================
    # 获取长期经验
    # =========================================================

    def get_all(
        self,
        reusable_only: bool = True,
    ) -> list[dict[str, Any]]:

        result = []

        for experience in self.experiences.values():

            if reusable_only and not experience.reusable:
                continue

            result.append(experience.to_dict())

        return result

    # =========================================================
    # 获取单条经验
    # =========================================================

    def get(
        self,
        experience_id: str,
    ) -> dict[str, Any] | None:

        experience = self.experiences.get(experience_id)

        if not experience:
            return None

        return experience.to_dict()

    # =========================================================
    # 获取候选经验
    # =========================================================

    def get_candidates(
        self,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:

        result = []

        for candidate in self.candidates.values():

            if candidate.get("status") != self.STATUS_CANDIDATE:
                continue

            if project_id is not None and candidate.get("source_project_id") != project_id:
                continue

            result.append(dict(candidate))

        return result

    # =========================================================
    # 根据关键词检索经验
    # =========================================================

    def search(
        self,
        keywords: list[str],
        limit: int = 10,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:

        if not keywords or not project_id:
            return []

        normalized_keywords = {str(keyword).lower().strip() for keyword in keywords if str(keyword).strip()}

        if not normalized_keywords:
            return []

        scored = []

        for experience in self.experiences.values():

            if not experience.reusable:
                continue

            if experience.source_project_id != project_id:
                continue

            experience_keywords = {str(keyword).lower().strip() for keyword in (experience.keywords)}

            title_content = (f"{experience.title} " f"{experience.content}").lower()

            score = 0

            for keyword in normalized_keywords:

                if keyword in (experience_keywords):
                    score += 3

                elif keyword in title_content:
                    score += 1

            if score > 0:

                scored.append(
                    (
                        score,
                        experience,
                    )
                )

        scored.sort(
            key=lambda item: item[0],
            reverse=True,
        )

        return [experience.to_dict() for _, experience in (scored[:limit])]

    # =========================================================
    # 归档经验
    # =========================================================

    def archive(
        self,
        experience_id: str,
        user_id: str,
        user_role: str,
    ) -> dict[str, Any]:

        if user_role not in {
            self.ROLE_ADMIN,
            self.ROLE_LEADER,
        }:
            return {
                "success": False,
                "error": "没有归档经验的权限",
            }

        experience = self.experiences.get(experience_id)

        if not experience:

            return {
                "success": False,
                "error": "经验不存在",
            }

        experience.reusable = False

        experience.updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        experience.metadata["status"] = self.STATUS_ARCHIVED

        experience.metadata["archived_by"] = user_id

        return {
            "success": True,
            "experience": (experience.to_dict()),
        }

    # =========================================================
    # 清空
    # =========================================================

    def clear(self):

        self.experiences.clear()

        self.candidates.clear()

        self.counter = 0
