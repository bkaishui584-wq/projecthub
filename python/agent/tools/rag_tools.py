from __future__ import annotations

from typing import Any

from agent.tools.base import (
    AgentTool,
    ToolContext,
    ToolResult,
)

from agent.rag.retriever import (
    RAGRetriever,
)

from agent.rag.evidence import (
    RAGEvidenceBuilder,
)


class RAGSearchTool(AgentTool):
    """
    研究资料检索工具。

    只允许读取已经授权的研究资料。

    返回结果属于：
        external

    不能直接视为：
        project_fact
        project_decision
    """

    name = "research.rag_search"

    description = "从已经授权的研究资料库中检索" "与当前项目研究问题相关的资料。" "返回内容属于外部研究资料，" "不能视为项目组已经确认的事实。"

    read_only = True

    def __init__(
        self,
        retriever: RAGRetriever | None = None,
    ):
        super().__init__()

        self.retriever = retriever or RAGRetriever()

        self.evidence_builder = RAGEvidenceBuilder()

    def execute(
        self,
        context: ToolContext,
        arguments: dict[str, Any],
    ) -> ToolResult:

        query = str(
            arguments.get(
                "query",
                "",
            )
        ).strip()

        if not query:

            return ToolResult(
                success=False,
                error="缺少检索关键词",
            )

        limit = arguments.get(
            "limit",
            8,
        )

        try:
            limit = int(limit)
        except (
            TypeError,
            ValueError,
        ):
            limit = 8

        limit = max(
            1,
            min(
                limit,
                20,
            ),
        )

        result = self.retriever.search(
            query=query,
            limit=limit,
        )

        evidence = self.evidence_builder.build(result)

        return ToolResult(
            success=True,
            data={
                "query": query,
                "results": result.get(
                    "results",
                    [],
                ),
                "evidence": evidence,
                "source_category": ("external"),
                "warning": ("以上内容来自外部研究资料，" "不代表项目组已经确认或验证。"),
            },
            tool_name=self.name,
        )
