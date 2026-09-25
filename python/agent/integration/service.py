from __future__ import annotations

import threading
from typing import Any

from agent.agent import Agent
from agent.integration.context_builder import AgentContextBuilder


class AgentService:
    """
    ProjectHub 与 Agent 核心之间的服务层。

    主要职责：
    1. 根据项目 ID 管理 Agent 实例
    2. 根据 ProjectHub 用户身份确定 Agent 权限
    3. 构建安全的项目上下文
    4. 授权 Agent 开始思考
    5. 执行 Agent 分析
    6. 管理 Agent 启用、禁用和紧急停止
    7. 提供审计日志和安全事件查询
    """

    ROLE_ADMIN = "system_admin"
    ROLE_LEADER = "project_leader"
    ROLE_MEMBER = "project_member"

    def __init__(self):
        # 当前进程中的项目 Agent。
        #
        # 注意：
        # 这里暂时使用内存管理。
        # Agent 本身不直接写入 ProjectHub 数据库。
        self.agents: dict[str, Agent] = {}
        self.agent_order: dict[str, int] = {}
        self.access_counter = 0
        self.max_agents = 500
        self.lock = threading.RLock()

        self.context_builder = AgentContextBuilder()

    # =========================================================
    # 权限
    # =========================================================

    def normalize_role(
        self,
        user: dict[str, Any] | None,
        project: dict[str, Any] | None = None,
    ) -> str:
        """
        根据服务器端用户和项目负责人信息确定 Agent 角色。

        不信任前端传入的 role。
        """

        if not user:
            return self.ROLE_MEMBER

        user_role = user.get("role")

        # 系统管理员
        if user_role in {
            "admin",
            "system_admin",
        }:
            return self.ROLE_ADMIN

        # 项目负责人
        if project and project.get("creatorId") == user.get("id"):
            return self.ROLE_LEADER

        # 普通项目成员
        return self.ROLE_MEMBER

    # =========================================================
    # Agent 实例
    # =========================================================

    def get_agent(
        self,
        project_id: str,
    ) -> Agent:
        """
        获取指定项目对应的 Agent。

        一个项目对应一个 Agent 实例。
        """

        project_id = str(project_id)

        with self.lock:
            self.access_counter += 1

            if project_id not in self.agents:
                if len(self.agents) >= self.max_agents:
                    oldest = min(self.agent_order, key=self.agent_order.get)
                    self.agents.pop(oldest, None)
                    self.agent_order.pop(oldest, None)

                self.agents[project_id] = Agent(
                    user_role=self.ROLE_MEMBER,
                    project_id=project_id,
                )

            self.agent_order[project_id] = self.access_counter
            return self.agents[project_id]

    # =========================================================
    # 状态
    # =========================================================

    def get_state(
        self,
        project_id: str,
    ) -> dict[str, Any]:
        agent = self.get_agent(project_id)

        return agent.get_state()

    def get_status(
        self,
        project_id: str,
    ) -> dict[str, Any]:
        agent = self.get_agent(project_id)

        return agent.get_status()

    # =========================================================
    # 负责人授权 Agent 思考
    # =========================================================

    def authorize_thinking(
        self,
        user: dict[str, Any],
        project: dict[str, Any],
    ) -> dict[str, Any]:
        """
        由项目负责人授权 Agent 开始本轮思考。
        """

        project_id = str(project.get("id") or "")

        if not project_id:
            return {
                "success": False,
                "error": "项目不存在",
            }

        role = self.normalize_role(
            user,
            project,
        )

        agent = self.get_agent(project_id)

        if not agent.admin_controller.enabled:
            return {
                "success": False,
                "error": "Agent 当前已被管理员关闭",
                "state": agent.get_state().get("state", "passive"),
            }

        return agent.authorize_thinking(
            user_id=user.get("id"),
            project_id=project_id,
            user_role=role,
        )

    # =========================================================
    # 构建项目上下文
    # =========================================================

    def build_context(
        self,
        user: dict[str, Any],
        project: dict[str, Any],
        messages: list[dict[str, Any]],
        decisions: list[dict[str, Any]] | None = None,
        questions: list[dict[str, Any]] | None = None,
        research_directions: list[dict[str, Any]] | None = None,
        progress: dict[str, Any] | None = None,
        public_materials: list[dict[str, Any]] | None = None,
        files: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        构建 Agent 可以看到的项目上下文。

        所有数据在 ContextBuilder 中进行安全清洗。
        """

        role = self.normalize_role(
            user,
            project,
        )

        return self.context_builder.build(
            user={
                **user,
                "role": role,
            },
            project=project,
            messages=messages,
            decisions=(decisions or []),
            questions=(questions or []),
            research_directions=(research_directions or []),
            progress=(progress or {}),
            public_materials=(public_materials or []),
            files=(files or []),
        )

    # =========================================================
    # 普通 LLM Agent 分析
    # =========================================================

    def analyze(
        self,
        user: dict[str, Any],
        project: dict[str, Any],
        messages: list[dict[str, Any]],
        decisions: list[dict[str, Any]] | None = None,
        questions: list[dict[str, Any]] | None = None,
        research_directions: list[dict[str, Any]] | None = None,
        progress: dict[str, Any] | None = None,
        public_materials: list[dict[str, Any]] | None = None,
        files: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        执行普通 Agent 分析。

        Agent 必须已经处于 thinking 状态。
        """

        project_id = str(project.get("id") or "")

        if not project_id:
            return {
                "success": False,
                "error": "项目不存在",
            }

        role = self.normalize_role(
            user,
            project,
        )

        if role not in {self.ROLE_ADMIN, self.ROLE_LEADER}:
            return {
                "success": False,
                "error": "只有项目负责人或系统管理员可以启动 Agent 分析",
                "state": "passive",
            }

        agent = self.get_agent(project_id)

        context = self.build_context(
            user=user,
            project=project,
            messages=messages,
            decisions=decisions,
            questions=questions,
            research_directions=(research_directions),
            progress=progress,
            public_materials=(public_materials),
            files=files,
        )

        return agent.analyze_with_llm(
            user_id=user.get("id"),
            user_role=role,
            project_id=project_id,
            project_context=context,
        )

    # =========================================================
    # Tool Calling Agent 分析
    # =========================================================

    def analyze_with_tools(
        self,
        user: dict[str, Any],
        project: dict[str, Any],
        messages: list[dict[str, Any]],
        decisions: list[dict[str, Any]] | None = None,
        questions: list[dict[str, Any]] | None = None,
        research_directions: list[dict[str, Any]] | None = None,
        progress: dict[str, Any] | None = None,
        public_materials: list[dict[str, Any]] | None = None,
        files: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        使用 Tool Calling 进行 Agent 分析。

        工具权限仍然由 Agent 内部的
        ToolRegistry + ToolPolicy 控制。
        """

        project_id = str(project.get("id") or "")

        if not project_id:
            return {
                "success": False,
                "error": "项目不存在",
            }

        role = self.normalize_role(
            user,
            project,
        )

        if role not in {self.ROLE_ADMIN, self.ROLE_LEADER}:
            return {
                "success": False,
                "error": "只有项目负责人或系统管理员可以启动 Agent 分析",
                "state": "passive",
            }

        agent = self.get_agent(project_id)

        context = self.build_context(
            user=user,
            project=project,
            messages=messages,
            decisions=decisions,
            questions=questions,
            research_directions=(research_directions),
            progress=progress,
            public_materials=(public_materials),
            files=files,
        )

        return agent.analyze_with_tools(
            user_id=user.get("id"),
            user_role=role,
            project_id=project_id,
            project_context=context,
        )

    # =========================================================
    # 直接执行 Agent Tool
    # =========================================================

    def execute_tool(
        self,
        user: dict[str, Any],
        project: dict[str, Any],
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        messages: list[dict[str, Any]] | None = None,
        files: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        执行一个 Agent 工具。

        实际权限检查仍由 Agent / ToolRegistry 完成。
        """

        project_id = str(project.get("id") or "")

        if not project_id:
            return {
                "success": False,
                "error": "项目不存在",
            }

        role = self.normalize_role(
            user,
            project,
        )

        agent = self.get_agent(project_id)

        return agent.execute_tool(
            user_id=user.get("id"),
            user_role=role,
            project_id=project_id,
            tool_name=tool_name,
            arguments=arguments or {},
            messages=messages or [],
            files=files or [],
        )

    # =========================================================
    # 项目 Agent 管理
    # =========================================================

    def reset_project(
        self,
        user: dict[str, Any],
        project_id: str,
    ) -> dict[str, Any]:
        """
        重置项目 Agent。

        只有系统管理员可以执行。
        """

        role = self.normalize_role(user)

        if role != self.ROLE_ADMIN:
            return {
                "success": False,
                "error": "需要系统管理员权限",
            }

        agent = self.get_agent(project_id)

        return agent.reset(user=user)

    def enable_project_agent(
        self,
        user: dict[str, Any],
        project_id: str,
    ) -> dict[str, Any]:
        """
        启用项目 Agent。
        """

        role = self.normalize_role(user)

        if role != self.ROLE_ADMIN:
            return {
                "success": False,
                "error": "需要系统管理员权限",
            }

        agent = self.get_agent(project_id)

        return agent.admin_controller.enable(user)

    def disable_project_agent(
        self,
        user: dict[str, Any],
        project_id: str,
    ) -> dict[str, Any]:
        """
        禁用项目 Agent。
        """

        role = self.normalize_role(user)

        if role != self.ROLE_ADMIN:
            return {
                "success": False,
                "error": "需要系统管理员权限",
            }

        agent = self.get_agent(project_id)

        return agent.admin_controller.disable(user)

    def emergency_stop(
        self,
        user: dict[str, Any],
        project_id: str,
    ) -> dict[str, Any]:
        """
        紧急停止 Agent。

        只有系统管理员可以执行。
        """

        role = self.normalize_role(user)

        if role != self.ROLE_ADMIN:
            return {
                "success": False,
                "error": "需要系统管理员权限",
            }

        agent = self.get_agent(project_id)

        return agent.admin_controller.emergency_stop(user)

    # =========================================================
    # 审计日志
    # =========================================================

    def get_audit_logs(
        self,
        user: dict[str, Any],
        project_id: str,
        limit: int = 100,
    ) -> dict[str, Any]:
        """
        获取 Agent 审计日志。
        """

        role = self.normalize_role(user)

        if role != self.ROLE_ADMIN:
            return {
                "success": False,
                "error": "需要系统管理员权限",
            }

        agent = self.get_agent(project_id)

        return agent.admin_controller.get_audit_logs(
            user=user,
            project_id=project_id,
            limit=limit,
        )

    # =========================================================
    # 安全事件
    # =========================================================

    def get_security_events(
        self,
        user: dict[str, Any],
        project_id: str,
        limit: int = 100,
    ) -> dict[str, Any]:
        """
        获取 Agent 安全事件。
        """

        role = self.normalize_role(user)

        if role != self.ROLE_ADMIN:
            return {
                "success": False,
                "error": "需要系统管理员权限",
            }

        agent = self.get_agent(project_id)

        return agent.admin_controller.get_security_events(
            user=user,
            limit=limit,
        )
