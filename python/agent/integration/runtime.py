from __future__ import annotations

from typing import Any


class AgentRuntime:
    """
    Agent 运行时统一管理器。

    负责把：
    - 项目分析
    - RAG
    - 长期记忆
    - EvidenceGuard
    - LLM
    - Tool Calling

    统一组织起来。

    Runtime 不负责 HTTP。
    Runtime 不负责数据库。
    Runtime 不负责用户认证。
    """

    def __init__(self, agent):
        self.agent = agent

    # =========================================================
    # 项目分析
    # =========================================================

    def analyze_project(
        self,
        user: dict[str, Any],
        project_context: dict[str, Any],
    ) -> dict[str, Any]:

        if not self.agent.controller.state.can_process():
            return {
                "success": False,
                "error": "Agent 当前未处于可分析状态",
                "state": (self.agent.controller.state.get_state()),
            }

        messages = project_context.get("information", {}).get("messages", [])

        project = project_context.get(
            "project",
            {},
        )

        # -----------------------------------------------------
        # 第一层：项目内部结构化分析
        # -----------------------------------------------------

        analysis = self.agent.analysis_pipeline.process(
            messages=messages,
            project=project,
        )

        # -----------------------------------------------------
        # 第二层：候选建议
        # -----------------------------------------------------

        suggestions = self.agent.suggestion_engine.generate(analysis)

        # -----------------------------------------------------
        # 第三层：长期经验检索
        # -----------------------------------------------------

        keywords = []

        memory = analysis.get(
            "memory",
            {},
        )

        keywords.extend(
            memory.get(
                "keywords",
                [],
            )
        )

        experiences = self.agent.learning_manager.search(
            keywords=keywords,
            limit=10,
            project_id=self.agent.project_id,
        )

        # -----------------------------------------------------
        # 第四层：把分析结果注入上下文
        # -----------------------------------------------------

        project_context["analysis"] = analysis

        project_context["generated_suggestions"] = suggestions

        project_context["relevant_experiences"] = experiences

        # -----------------------------------------------------
        # 第五层：LLM
        # -----------------------------------------------------

        result = self.agent.llm_analyzer.analyze(project_context)

        if not isinstance(result, dict):
            result = {
                "success": True,
                "result": result,
            }

        result["analysis"] = analysis

        result["generated_suggestions"] = suggestions

        result["relevant_experiences"] = experiences

        return result

    # =========================================================
    # Tool Calling
    # =========================================================

    def analyze_with_tools(
        self,
        user: dict[str, Any],
        project_context: dict[str, Any],
    ) -> dict[str, Any]:

        if not self.agent.controller.state.can_process():
            return {
                "success": False,
                "error": "Agent 当前未处于可分析状态",
                "state": (self.agent.controller.state.get_state()),
            }

        result = self.agent.llm_analyzer.analyze_with_tools(project_context)

        return result

    # =========================================================
    # RAG
    # =========================================================

    def search_research(
        self,
        query: str,
        limit: int = 8,
    ) -> dict[str, Any]:

        return self.agent.search_research(
            query=query,
            limit=limit,
        )

    # =========================================================
    # 长期经验
    # =========================================================

    def search_experience(
        self,
        keywords: list[str],
        limit: int = 10,
    ) -> list[dict[str, Any]]:

        return self.agent.search_learning(
            keywords=keywords,
            limit=limit,
        )

    # =========================================================
    # 当前状态
    # =========================================================

    def get_state(self):

        return self.agent.get_state()

    def get_status(self):

        return self.agent.get_status()
