from __future__ import annotations

from typing import Any

from agent.core.controller import AgentController
from agent.core.permission import (
    SYSTEM_ADMIN,
    PROJECT_LEADER,
    PROJECT_MEMBER,
)

from agent.llm_agent import LLMAgentAnalyzer

from agent.tools.base import ToolContext
from agent.tools.registry import ToolRegistry

from agent.tools.project_tools import (
    ProjectInfoTool,
    ProjectDiscussionTool,
    ProjectDecisionTool,
    ProjectQuestionTool,
    ProjectResearchDirectionTool,
    ProjectProgressTool,
    ProjectPublicMaterialsTool,
    SearchResearchTool,
)

from agent.tools.rag_tools import (
    RAGSearchTool,
)

from agent.rag.retriever import (
    RAGRetriever,
)

from agent.analysis import (
    ProjectAnalysisPipeline,
)

from agent.suggestion_engine import (
    SuggestionEngine,
)

from agent.evidence import (
    EvidenceManager,
)

from agent.evidence_guard import (
    EvidenceGuard,
)

from agent.learning import (
    LearningManager,
)

from agent.audit import (
    AuditLogger,
)

from agent.admin import (
    AgentAdminController,
)

from agent.integration.runtime import (
    AgentRuntime,
)


class Agent:
    """
    ProjectHub Research Agent。

    Agent 的定位：

        基于项目组已有讨论内容，
        对信息进行整理、筛选、关联和补充，
        为项目负责人提供新的思路、
        研究角度和理论/论文依据。

    Agent 不负责：

        - 替项目组做最终决定
        - 自动修改项目核心数据
        - 修改用户权限
        - 访问源代码
        - 访问 .env
        - 获取密码 / Token / Cookie
        - 执行系统命令
        - 自动部署
        - 自动改变项目研究方向

    思考模式：

        PASSIVE
            ↓
        THINKING
            ↓
        ANALYZING
            ↓
        SUGGESTING
            ↓
        WAITING

    只有项目负责人或系统管理员
    明确授权后，Agent 才能进入 THINKING。
    """

    def __init__(
        self,
        user_role: str = PROJECT_MEMBER,
        project_id: str | None = None,
    ):
        self.user_role = user_role
        self.project_id = project_id

        # =====================================================
        # 1. 状态与权限控制
        # =====================================================

        self.controller = AgentController(
            user_role=user_role,
            project_id=project_id,
        )

        # =====================================================
        # 2. Tool 系统
        # =====================================================

        self.tool_registry = ToolRegistry()

        # =====================================================
        # 3. RAG
        # =====================================================

        # Agent 与 RAG Tool 共用同一个 Retriever。
        #
        # 避免：
        #
        # Agent -> RAGRetriever A
        # Tool  -> RAGRetriever B
        #
        # 导致两个资料库彼此独立。
        self.rag_retriever = RAGRetriever()

        self._register_tools()

        # =====================================================
        # 4. LLM
        # =====================================================

        self.llm_analyzer = LLMAgentAnalyzer(tool_registry=self.tool_registry)

        # =====================================================
        # 5. 项目讨论分析
        # =====================================================

        self.analysis_pipeline = ProjectAnalysisPipeline()

        # =====================================================
        # 6. 证据系统
        # =====================================================

        self.evidence_manager = EvidenceManager()

        self.evidence_guard = EvidenceGuard()

        # =====================================================
        # 7. 建议系统
        # =====================================================

        self.suggestion_engine = SuggestionEngine(evidence_manager=(self.evidence_manager))

        # =====================================================
        # 8. 长期经验 / 受控自学习
        # =====================================================

        self.learning_manager = LearningManager()

        # =====================================================
        # 9. 审计
        # =====================================================

        self.audit = AuditLogger()

        # =====================================================
        # 10. 管理员控制
        # =====================================================

        self.admin_controller = AgentAdminController(
            agent=self,
            audit_logger=self.audit,
        )

        # =====================================================
        # 11. Runtime
        # =====================================================

        self.runtime = AgentRuntime(self)

    # =========================================================
    # Tool 注册
    # =========================================================

    def _register_tools(self):
        """
        注册 Agent 可以使用的工具。

        工具最终是否可以执行，
        仍然由 ToolRegistry + ToolPolicy 决定。
        """

        tools = [
            ProjectInfoTool(),
            ProjectDiscussionTool(),
            ProjectDecisionTool(),
            ProjectQuestionTool(),
            ProjectResearchDirectionTool(),
            ProjectProgressTool(),
            ProjectPublicMaterialsTool(),
            SearchResearchTool(),
            # 使用 Agent 自己的共享 RAG Retriever
            RAGSearchTool(retriever=self.rag_retriever),
        ]

        for tool in tools:
            self.tool_registry.register(tool)

    # =========================================================
    # 状态
    # =========================================================

    def get_state(
        self,
    ) -> dict[str, Any]:

        return self.controller.get_state()

    def get_status(
        self,
    ) -> dict[str, Any]:

        state = self.controller.get_state()

        return {
            "enabled": bool(self.admin_controller.enabled),
            "state": state.get("state", "passive"),
        }

    # =========================================================
    # 权限标准化
    # =========================================================

    def normalize_role(
        self,
        user: dict[str, Any] | None,
    ) -> str:
        """
        将 ProjectHub 用户身份转换成 Agent 内部角色。

        注意：

        前端传入的 role 不能作为最终权限依据。
        最终权限必须由服务器端用户信息决定。
        """

        if not user:
            return PROJECT_MEMBER

        role = user.get("role")

        if role in {
            "admin",
            "system_admin",
        }:
            return SYSTEM_ADMIN

        if role in {
            "project_leader",
        }:
            return PROJECT_LEADER

        # 兼容 ProjectHub 当前项目负责人判断。
        if self.project_id and user.get("projectId") == self.project_id:
            return PROJECT_LEADER

        return PROJECT_MEMBER

    # =========================================================
    # 授权 Agent 思考
    # =========================================================

    def authorize_thinking(
        self,
        user_id: str,
        project_id: str,
        user_role: str | None = None,
    ) -> dict[str, Any]:
        """
        授权 Agent 开始本轮思考。

        只有：
            PROJECT_LEADER
            SYSTEM_ADMIN

        可以授权。

        普通成员不能授权 Agent 思考。
        """

        role = user_role or self.user_role

        # -----------------------------------------------------
        # 权限检查
        # -----------------------------------------------------

        if role not in {
            PROJECT_LEADER,
            SYSTEM_ADMIN,
        }:

            result = {
                "success": False,
                "error": ("只有项目负责人或系统管理员" "可以授权 Agent 思考"),
                "state": (self.controller.state.get_state()),
            }

            self.audit.log(
                event_type="authorization",
                actor_id=user_id,
                actor_role=role,
                project_id=project_id,
                success=False,
                action="authorize_thinking",
                details=result,
                risk_level="medium",
            )

            return result

        # -----------------------------------------------------
        # Agent 状态检查
        # -----------------------------------------------------

        result = self.controller.authorize_thinking(
            user_id=user_id,
            project_id=project_id,
            user_role=role,
        )

        self.audit.log(
            event_type="authorization",
            actor_id=user_id,
            actor_role=role,
            project_id=project_id,
            success=result.get(
                "success",
                False,
            ),
            action="authorize_thinking",
            details=result,
            risk_level="low",
        )

        return result

    # =========================================================
    # 普通 LLM 分析
    # =========================================================

    def analyze_with_llm(
        self,
        user_id: str,
        user_role: str,
        project_id: str,
        project_context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Agent 普通分析入口。

        流程：

            THINKING
                ↓
            ANALYZING
                ↓
            ProjectAnalysis
                ↓
            SuggestionEngine
                ↓
            Experience
                ↓
            LLM
                ↓
            EvidenceGuard
                ↓
            SUGGESTING
                ↓
            WAITING
        """

        # =====================================================
        # Agent 开关
        # =====================================================

        if not self.admin_controller.enabled:

            return {
                "success": False,
                "error": "Agent 当前已被禁用",
                "state": (self.controller.state.get_state()),
            }

        # =====================================================
        # 状态检查
        # =====================================================

        if self.controller.state.get_state() != "thinking":

            return {
                "success": False,
                "error": ("Agent 尚未获得本轮思考授权"),
                "state": (self.controller.state.get_state()),
            }

        try:

            # -------------------------------------------------
            # THINKING → ANALYZING
            # -------------------------------------------------

            state_result = self.controller.start_analysis()

            if not state_result:

                return {
                    "success": False,
                    "error": ("无法进入分析状态"),
                    "state": (self.controller.state.get_state()),
                }

            # -------------------------------------------------
            # Runtime 统一执行
            # -------------------------------------------------

            user = {
                "id": user_id,
                "role": user_role,
            }

            result = self.runtime.analyze_project(
                user=user,
                project_context=(project_context),
            )

            if not isinstance(result, dict) or not result.get("success", False):
                self.controller.abort()
                self.audit.log(
                    event_type="agent_error",
                    actor_id=user_id,
                    actor_role=user_role,
                    project_id=project_id,
                    success=False,
                    action="analyze",
                    details={"reason": "analysis_failed"},
                    risk_level="high",
                )
                return {
                    "success": False,
                    "error": "Agent 分析未能完成",
                    "state": self.controller.state.get_state(),
                }

            # -------------------------------------------------
            # EvidenceGuard
            # -------------------------------------------------

            validation = self._validate_evidence(result)
            safe_result = validation.get("result", result) if isinstance(validation, dict) else result

            # -------------------------------------------------
            # ANALYZING → SUGGESTING
            # -------------------------------------------------

            suggestion_state = self.controller.start_suggestion()
            if not suggestion_state.get("success"):
                self.controller.abort()
                return {
                    "success": False,
                    "error": ("无法进入建议状态"),
                    "state": (self.controller.state.get_state()),
                }

            # -------------------------------------------------
            # SUGGESTING → WAITING
            # -------------------------------------------------

            finish_state = self.controller.finish()
            if not finish_state.get("success"):
                self.controller.abort()
                return {
                    "success": False,
                    "error": "Agent 无法安全结束本轮分析",
                    "state": self.controller.state.get_state(),
                }

            final_result = {
                "success": True,
                "state": (self.controller.state.get_state()),
                "result": safe_result,
                "evidence_validation": (validation),
            }

            self.audit.log(
                event_type="analysis",
                actor_id=user_id,
                actor_role=user_role,
                project_id=project_id,
                success=True,
                action="analyze",
                details={
                    "state": (self.controller.state.get_state()),
                },
                risk_level="low",
            )

            return final_result

        except Exception as exc:

            # =================================================
            # 异常时必须终止本轮思考
            # =================================================

            self.controller.abort()

            self.audit.log(
                event_type="agent_error",
                actor_id=user_id,
                actor_role=user_role,
                project_id=project_id,
                success=False,
                action="analyze",
                details={
                    "error_type": type(exc).__name__,
                },
                risk_level="high",
            )

            return {
                "success": False,
                "error": ("Agent 分析过程中发生异常"),
                "state": (self.controller.state.get_state()),
            }

    # =========================================================
    # Tool Calling 分析
    # =========================================================

    def analyze_with_tools(
        self,
        user_id: str,
        user_role: str,
        project_id: str,
        project_context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Agent Tool Calling 分析入口。
        """

        if not self.admin_controller.enabled:

            return {
                "success": False,
                "error": "Agent 当前已被禁用",
                "state": (self.controller.state.get_state()),
            }

        if self.controller.state.get_state() != "thinking":

            return {
                "success": False,
                "error": ("Agent 尚未获得本轮思考授权"),
                "state": (self.controller.state.get_state()),
            }

        try:

            if not (self.controller.start_analysis()):

                return {
                    "success": False,
                    "error": ("无法进入分析状态"),
                }

            user = {
                "id": user_id,
                "role": user_role,
            }

            result = self.runtime.analyze_with_tools(
                user=user,
                project_context=(project_context),
            )

            if not isinstance(result, dict) or not result.get("success", False):
                self.controller.abort()
                return {
                    "success": False,
                    "error": "Agent 工具分析未能完成",
                    "state": self.controller.state.get_state(),
                }

            validation = self._validate_evidence(result)
            safe_result = validation.get("result", result) if isinstance(validation, dict) else result

            suggestion_state = self.controller.start_suggestion()
            if not suggestion_state.get("success"):
                self.controller.abort()
                return {
                    "success": False,
                    "error": "无法进入建议状态",
                    "state": self.controller.state.get_state(),
                }

            finish_state = self.controller.finish()
            if not finish_state.get("success"):
                self.controller.abort()
                return {
                    "success": False,
                    "error": "Agent 无法安全结束本轮分析",
                    "state": self.controller.state.get_state(),
                }

            final_result = {
                "success": True,
                "state": (self.controller.state.get_state()),
                "result": safe_result,
                "evidence_validation": (validation),
            }

            self.audit.log(
                event_type="tool_analysis",
                actor_id=user_id,
                actor_role=user_role,
                project_id=project_id,
                success=True,
                action="tool_analysis",
                details={},
                risk_level="low",
            )

            return final_result

        except Exception as exc:

            self.controller.abort()

            self.audit.log(
                event_type="agent_error",
                actor_id=user_id,
                actor_role=user_role,
                project_id=project_id,
                success=False,
                action="tool_analysis",
                details={
                    "error_type": type(exc).__name__,
                },
                risk_level="high",
            )

            return {
                "success": False,
                "error": ("Agent 工具分析过程中发生异常"),
                "state": (self.controller.state.get_state()),
            }

    # =========================================================
    # EvidenceGuard
    # =========================================================

    def _validate_evidence(
        self,
        result: Any,
    ) -> dict[str, Any]:
        """
        统一执行 EvidenceGuard。

        EvidenceGuard 不负责决定项目方案，
        只负责检查输出是否有足够证据支持，
        并降低未经证实的确定性表达。
        """

        try:

            validation = self.evidence_guard.validate(result)

            if isinstance(
                validation,
                dict,
            ):
                return validation

            return {
                "valid": True,
                "result": validation,
            }

        except Exception as exc:

            return {
                "valid": False,
                "error": ("EvidenceGuard 执行失败"),
                "details": str(exc),
            }

    # =========================================================
    # Tool 直接执行
    # =========================================================

    def execute_tool(
        self,
        user_id: str,
        user_role: str,
        project_id: str,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        messages: list[dict[str, Any]] | None = None,
        files: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        直接执行一个 Agent Tool。

        ToolRegistry 会继续进行最终权限检查。
        """

        context = ToolContext(
            user_id=user_id,
            user_role=user_role,
            project_id=project_id,
            project={},
            safe_data={
                "discussion": (messages or []),
                "messages": (messages or []),
                "decisions": [],
                "questions": [],
                "research_directions": [],
                "progress": {},
                "public_materials": (files or []),
                "files": (files or []),
            },
        )

        try:

            result = self.tool_registry.execute(
                tool_name=tool_name,
                context=context,
                arguments=(arguments or {}),
            )

            self.audit.log(
                event_type="tool_execution",
                actor_id=user_id,
                actor_role=user_role,
                project_id=project_id,
                success=(
                    getattr(
                        result,
                        "success",
                        False,
                    )
                ),
                action=tool_name,
                details={},
                risk_level="low",
            )

            if hasattr(
                result,
                "to_dict",
            ):
                return result.to_dict()

            if isinstance(
                result,
                dict,
            ):
                return result

            return {
                "success": True,
                "result": result,
            }

        except Exception as exc:

            self.audit.log(
                event_type="tool_error",
                actor_id=user_id,
                actor_role=user_role,
                project_id=project_id,
                success=False,
                action=tool_name,
                details={
                    "error_type": type(exc).__name__,
                },
                risk_level="high",
            )

            return {
                "success": False,
                "error": ("Agent Tool 执行失败"),
            }

    # =========================================================
    # RAG：添加研究资料
    # =========================================================

    def add_research_document(
        self,
        user: dict[str, Any],
        document: dict[str, Any],
    ) -> dict[str, Any]:
        """
        添加已经授权的研究资料。

        只有项目负责人或系统管理员
        可以添加研究资料。
        """

        role = self.normalize_role(user)

        if role not in {
            PROJECT_LEADER,
            SYSTEM_ADMIN,
        }:

            return {
                "success": False,
                "error": ("没有添加研究资料的权限"),
            }

        try:

            result = self.rag_retriever.add_document(document)

            self.audit.log(
                event_type="research_document",
                actor_id=user.get("id"),
                actor_role=role,
                project_id=self.project_id,
                success=result.get(
                    "success",
                    False,
                ),
                action="add_research_document",
                details={
                    "document_id": result.get("document_id"),
                },
                risk_level="low",
            )

            return result

        except Exception as exc:

            return {
                "success": False,
                "error": ("研究资料添加失败"),
            }

    # =========================================================
    # RAG：研究资料搜索
    # =========================================================

    def search_research(
        self,
        query: str,
        limit: int = 8,
    ) -> dict[str, Any]:

        return self.rag_retriever.search(
            query=query,
            limit=limit,
        )

    # =========================================================
    # 长期经验：创建候选
    # =========================================================

    def create_learning_candidate(
        self,
        user: dict[str, Any],
        title: str,
        content: str,
        experience_type: str,
        keywords: list[str] | None = None,
        source_message_ids: list[str] | None = None,
        confidence: float = 0.0,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        创建长期经验候选。

        注意：

        创建候选 ≠ 写入长期记忆。

        必须经过负责人或管理员确认。
        """

        role = self.normalize_role(user)

        if role not in {
            PROJECT_LEADER,
            SYSTEM_ADMIN,
        }:

            return {
                "success": False,
                "error": ("只有项目负责人或系统管理员" "可以创建长期经验候选"),
            }

        return self.learning_manager.create_candidate(
            experience_type=(experience_type),
            title=title,
            content=content,
            source_project_id=(self.project_id),
            source_message_ids=(source_message_ids or []),
            keywords=(keywords or []),
            confidence=confidence,
            metadata=(metadata or {}),
        )

    # =========================================================
    # 长期经验：确认
    # =========================================================

    def confirm_learning(
        self,
        user: dict[str, Any],
        experience_id: str,
    ) -> dict[str, Any]:

        role = self.normalize_role(user)

        result = self.learning_manager.confirm(
            experience_id=(experience_id),
            user_id=user.get("id"),
            user_role=role,
            project_id=self.project_id,
        )

        self.audit.log(
            event_type="learning_confirmation",
            actor_id=user.get("id"),
            actor_role=role,
            project_id=self.project_id,
            success=result.get(
                "success",
                False,
            ),
            action="confirm_learning",
            details={
                "experience_id": (experience_id),
            },
            risk_level="medium",
        )

        return result

    # =========================================================
    # 长期经验：拒绝
    # =========================================================

    def reject_learning(
        self,
        user: dict[str, Any],
        experience_id: str,
        reason: str = "",
    ) -> dict[str, Any]:

        role = self.normalize_role(user)

        result = self.learning_manager.reject(
            experience_id=(experience_id),
            user_id=user.get("id"),
            user_role=role,
            reason=reason,
            project_id=self.project_id,
        )

        self.audit.log(
            event_type="learning_rejection",
            actor_id=user.get("id"),
            actor_role=role,
            project_id=self.project_id,
            success=result.get(
                "success",
                False,
            ),
            action="reject_learning",
            details={
                "experience_id": (experience_id),
            },
            risk_level="low",
        )

        return result

    # =========================================================
    # 长期经验：搜索
    # =========================================================

    def search_learning(
        self,
        keywords: list[str],
        limit: int = 10,
    ) -> list[dict[str, Any]]:

        return self.learning_manager.search(
            keywords=keywords,
            limit=limit,
            project_id=self.project_id,
        )

    # =========================================================
    # 重置
    # =========================================================

    def reset(
        self,
        user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        重置当前 Agent。

        注意：

        reset 不应该自动删除长期经验，
        因为“本轮 Agent 状态”与
        “长期学习记忆”是两个不同层级。
        """

        user_id = user.get("id") if user else None

        role = self.normalize_role(user) if user else self.user_role

        result = self.controller.reset()

        self.audit.log(
            event_type="agent_reset",
            actor_id=user_id,
            actor_role=role,
            project_id=self.project_id,
            success=result.get(
                "success",
                False,
            ),
            action="reset",
            details={},
            risk_level="medium",
        )

        return result

    # =========================================================
    # 审计日志
    # =========================================================

    def get_audit_logs(
        self,
        user: dict[str, Any] | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:

        role = self.normalize_role(user)

        if role != SYSTEM_ADMIN:

            return []

        return self.audit.get_all(limit=limit)

    # =========================================================
    # 安全事件
    # =========================================================

    def get_security_events(
        self,
        user: dict[str, Any] | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:

        role = self.normalize_role(user)

        if role != SYSTEM_ADMIN:

            return []

        return self.audit.get_security_events(limit=limit)
