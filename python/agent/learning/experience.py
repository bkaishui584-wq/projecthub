from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


class ExperienceType:
    """
    Agent 长期经验类型。
    """

    PROJECT_LESSON = "project_lesson"

    RESEARCH_METHOD = "research_method"

    VALIDATED_IDEA = "validated_idea"

    FAILED_APPROACH = "failed_approach"

    THEORETICAL_KNOWLEDGE = "theoretical_knowledge"

    PRACTICAL_KNOWLEDGE = "practical_knowledge"

    GENERAL_RULE = "general_rule"


@dataclass
class Experience:
    """
    一条经过确认的 Agent 长期经验。
    """

    id: str

    type: str

    title: str

    content: str

    source_project_id: str | None = None

    source_message_ids: list[str] = field(default_factory=list)

    keywords: list[str] = field(default_factory=list)

    confirmed_by: str | None = None

    confirmed_at: str | None = None

    confidence: float = 0.0

    reusable: bool = False

    metadata: dict[str, Any] = field(default_factory=dict)

    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

    def to_dict(self) -> dict[str, Any]:

        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "content": self.content,
            "source_project_id": (self.source_project_id),
            "source_message_ids": list(self.source_message_ids),
            "keywords": list(self.keywords),
            "confirmed_by": (self.confirmed_by),
            "confirmed_at": (self.confirmed_at),
            "confidence": self.confidence,
            "reusable": self.reusable,
            "metadata": dict(self.metadata),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
