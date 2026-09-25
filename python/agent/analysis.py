from __future__ import annotations

from typing import Any

from agent.discussion.parser import parse_messages
from agent.memory import ProjectMemory
from agent.decision import DecisionTracker
from agent.conflict import ConflictDetector
from agent.questions import OpenQuestionManager
from agent.direction import ResearchDirectionManager


class ProjectAnalysisPipeline:
    """
    项目讨论分析流水线。

    负责：
    1. 解析讨论
    2. 更新项目记忆
    3. 追踪项目决策
    4. 检测冲突
    5. 提取开放问题
    6. 管理研究方向
    """

    def __init__(self):
        self.memory = ProjectMemory()
        self.decisions = DecisionTracker()
        self.conflicts = ConflictDetector()
        self.questions = OpenQuestionManager()
        self.directions = ResearchDirectionManager()

        self._processed_message_ids: set[str] = set()

    # =========================================================
    # 主入口
    # =========================================================

    def process(
        self,
        messages: list[dict[str, Any]],
        project: dict[str, Any] | None = None,
    ) -> dict[str, Any]:

        project = project or {}

        self.memory.clear()
        self.decisions.clear()
        self.conflicts.clear()
        self.questions.clear()
        self.directions.clear()
        self._processed_message_ids.clear()

        valid_messages = []

        for message in messages or []:
            if message.get("recalled"):
                continue

            message_id = str(message.get("id") or message.get("message_id") or "")

            if not message_id:
                continue

            # 防止同一条消息被重复分析
            if message_id in self._processed_message_ids:
                continue

            valid_messages.append(message)
            self._processed_message_ids.add(message_id)

        # -----------------------------------------------------
        # 1. 讨论解析
        # -----------------------------------------------------

        discussion = parse_messages(valid_messages)
        discussion_items = (
            list(discussion.get("facts", []))
            + list(discussion.get("decisions", []))
            + list(discussion.get("opinions", []))
            + list(discussion.get("uncertain", []))
        )

        # -----------------------------------------------------
        # 2. 更新项目记忆
        # -----------------------------------------------------

        self.memory.update_from_discussion(discussion)

        # -----------------------------------------------------
        # 3. 决策追踪
        # -----------------------------------------------------

        for item in discussion_items:

            if item.get("type") != "decision":
                continue

            self.decisions.add_decision(item)

        # -----------------------------------------------------
        # 4. 开放问题
        # -----------------------------------------------------

        for item in discussion_items:

            if not item.get("is_question"):
                continue

            self.questions.add_question(item)

        # -----------------------------------------------------
        # 5. 研究方向
        # -----------------------------------------------------

        for item in discussion_items:

            if item.get("type") not in {
                "opinion",
                "uncertain",
            }:
                continue

            keywords = item.get(
                "keywords",
                [],
            )

            if not keywords:
                continue

            self.directions.add_candidate(
                name=item.get(
                    "content",
                    "",
                ),
                description=item.get(
                    "content",
                    "",
                ),
                keywords=keywords,
                source=item,
            )

        # -----------------------------------------------------
        # 6. 冲突检测
        # -----------------------------------------------------

        self._detect_conflicts(discussion_items)

        # -----------------------------------------------------
        # 7. 构建报告
        # -----------------------------------------------------

        return self.build_report(project=project)

    # =========================================================
    # 冲突检测
    # =========================================================

    def _detect_conflicts(
        self,
        discussion: list[dict[str, Any]],
    ):

        decisions = [item for item in discussion if item.get("type") == "decision"]

        opinions = [
            item
            for item in discussion
            if item.get("type")
            in {
                "opinion",
                "uncertain",
            }
        ]

        # 已经确认的决定与后续不同意见之间，
        # 交由 ConflictDetector 进行判断。
        for decision in decisions:

            for opinion in opinions:

                if not decision.get("content"):
                    continue

                if not opinion.get("content"):
                    continue

                self.conflicts.detect(
                    decision,
                    opinion,
                )

    # =========================================================
    # 报告
    # =========================================================

    def build_report(
        self,
        project: dict[str, Any] | None = None,
    ) -> dict[str, Any]:

        project = project or {}

        return {
            "project": {
                "id": project.get("id"),
                "title": project.get("title"),
            },
            "memory": self.memory.get(),
            "decisions": self.decisions.get_all(),
            "conflicts": self.conflicts.get_all(),
            "open_questions": (self.questions.get_all()),
            "research_directions": (self.directions.get_all()),
            "statistics": {
                "messages_analyzed": len(self._processed_message_ids),
                "decisions": len(self.decisions.get_all()),
                "conflicts": len(self.conflicts.get_all()),
                "open_questions": len(self.questions.get_all()),
                "research_directions": len(self.directions.get_all()),
            },
        }

    # =========================================================
    # 获取结构化信息
    # =========================================================

    def get_decisions(self):
        return self.decisions.get_all()

    def get_conflicts(self):
        return self.conflicts.get_all()

    def get_questions(self):
        return self.questions.get_all()

    def get_research_directions(self):
        return self.directions.get_all()

    def get_memory(self):
        return self.memory.get()

    # =========================================================
    # 重置
    # =========================================================

    def clear(self):

        self.memory.clear()

        self.decisions.clear()

        self.conflicts.clear()

        self.questions.clear()

        self.directions.clear()

        self._processed_message_ids.clear()
