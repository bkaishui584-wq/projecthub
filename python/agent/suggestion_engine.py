from __future__ import annotations

from typing import Any

from agent.evidence import EvidenceManager


class SuggestionEngine:
    """
    项目建议生成器。

    注意：
    这里只生成：
    - 新思路
    - 研究角度
    - 可验证假设
    - 理论关注点
    - 待负责人判断的问题

    不直接替项目组做最终决定。
    """

    def __init__(
        self,
        evidence_manager: EvidenceManager | None = None,
    ):
        self.evidence = evidence_manager or EvidenceManager()

    # =========================================================
    # 主入口
    # =========================================================

    def generate(
        self,
        analysis: dict[str, Any],
    ) -> list[dict[str, Any]]:

        suggestions = []

        questions = analysis.get(
            "open_questions",
            [],
        )

        directions = analysis.get(
            "research_directions",
            [],
        )

        conflicts = analysis.get(
            "conflicts",
            [],
        )

        memory = analysis.get(
            "memory",
            {},
        )

        # -----------------------------------------------------
        # 1. 从开放问题生成研究角度
        # -----------------------------------------------------

        for question in questions:

            content = question.get(
                "content",
                "",
            )

            if not content:
                continue

            suggestion = {
                "type": "research_angle",
                "content": (f"可以进一步研究：{content}"),
                "source_type": "open_question",
                "source": question,
                "status": "pending",
            }

            suggestions.append(suggestion)

        # -----------------------------------------------------
        # 2. 从成员观点生成新思路
        # -----------------------------------------------------

        opinions = memory.get(
            "opinions",
            [],
        )

        for opinion in opinions:

            content = opinion.get(
                "content",
                "",
            )

            if not content:
                continue

            suggestions.append(
                {
                    "type": "idea",
                    "content": (f"可以把成员提出的观点" f"作为一个可验证方向：{content}"),
                    "source_type": "opinion",
                    "source": opinion,
                    "status": "pending",
                }
            )

        # -----------------------------------------------------
        # 3. 从研究方向生成扩展角度
        # -----------------------------------------------------

        for direction in directions:

            content = direction.get(
                "content",
                "",
            )

            if not content:
                continue

            suggestions.append(
                {
                    "type": "research_angle",
                    "content": (f"可以进一步围绕" f"「{content}」" f"寻找相关理论或论文。"),
                    "source_type": "research_direction",
                    "source": direction,
                    "status": "pending",
                }
            )

        # -----------------------------------------------------
        # 4. 冲突转化为待判断问题
        # -----------------------------------------------------

        for conflict in conflicts:

            suggestions.append(
                {
                    "type": "warning",
                    "content": ("当前讨论中存在观点差异，" "建议负责人进一步确认双方依据，" "而不是直接选择其中一个方案。"),
                    "source_type": "conflict",
                    "source": conflict,
                    "status": "pending",
                }
            )

        # -----------------------------------------------------
        # 5. 去重
        # -----------------------------------------------------

        return self._deduplicate(suggestions)

    # =========================================================
    # 去重
    # =========================================================

    def _deduplicate(
        self,
        suggestions: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:

        result = []

        seen = set()

        for suggestion in suggestions:

            content = str(
                suggestion.get(
                    "content",
                    "",
                )
            ).strip()

            if not content:
                continue

            key = (
                suggestion.get("type"),
                content,
            )

            if key in seen:
                continue

            seen.add(key)

            result.append(suggestion)

        return result
