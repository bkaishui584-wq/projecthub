from agent.audit import AuditLogger


class AgentAdminController:
    """
    Agent 系统管理员控制器。

    SYSTEM_ADMIN 才能使用。

    负责：
    - Agent 总开关
    - 强制停止
    - Agent 重置
    - 查看审计日志
    - 查看安全事件
    """

    SYSTEM_ADMIN = "system_admin"

    def __init__(
        self,
        agent,
        audit_logger=None,
    ):
        self.agent = agent

        self.audit = audit_logger or AuditLogger()

        self.enabled = True

    # =========================================================
    # 权限
    # =========================================================

    def _check_admin(self, user):
        if not user:
            return False

        role = user.get("role")

        return role in {
            self.SYSTEM_ADMIN,
            "admin",
        }

    # =========================================================
    # Agent 开关
    # =========================================================

    def enable(self, user):
        if not self._check_admin(user):
            return {
                "success": False,
                "error": "Permission denied",
            }

        self.enabled = True

        self.audit.log(
            event_type="agent_enabled",
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            project_id=self.agent.project_id,
            success=True,
            action="enable_agent",
        )

        return {
            "success": True,
            "enabled": True,
        }

    def disable(self, user):
        if not self._check_admin(user):
            return {
                "success": False,
                "error": "Permission denied",
            }

        self.enabled = False

        # 管理员关闭 Agent 时，
        # 同时强制退出当前任务。
        try:
            self.agent.reset(user=user)
        except Exception:
            pass

        self.audit.log(
            event_type="agent_disabled",
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            project_id=self.agent.project_id,
            success=True,
            action="disable_agent",
            risk_level="high",
        )

        return {
            "success": True,
            "enabled": False,
        }

    # =========================================================
    # 强制停止
    # =========================================================

    def emergency_stop(self, user):
        if not self._check_admin(user):
            return {
                "success": False,
                "error": "Permission denied",
            }

        try:
            self.agent.reset(user=user)
        except Exception:
            pass

        self.audit.log(
            event_type="agent_emergency_stop",
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            project_id=self.agent.project_id,
            success=True,
            action="emergency_stop",
            risk_level="critical",
        )

        return {
            "success": True,
            "state": "passive",
        }

    # =========================================================
    # Agent 状态
    # =========================================================

    def get_status(self, user):
        if not self._check_admin(user):
            return {
                "success": False,
                "error": "Permission denied",
            }

        try:
            state = self.agent.get_state()
        except Exception as exc:
            state = None

        return {
            "success": True,
            "enabled": self.enabled,
            "state": state,
        }

    # =========================================================
    # 审计日志
    # =========================================================

    def get_audit_logs(
        self,
        user,
        project_id=None,
        limit=100,
    ):
        if not self._check_admin(user):
            return {
                "success": False,
                "error": "Permission denied",
            }

        if project_id:
            logs = self.audit.get_by_project(project_id)

            logs = logs[-limit:]
        else:
            logs = self.audit.recent(limit)

        return {
            "success": True,
            "events": logs,
        }

    # =========================================================
    # 安全事件
    # =========================================================

    def get_security_events(self, user, limit=100):
        if not self._check_admin(user):
            return {
                "success": False,
                "error": "Permission denied",
            }

        return {
            "success": True,
            "events": self.audit.get_security_events(limit=limit),
        }

    # =========================================================
    # 清理日志
    # =========================================================

    def clear_audit_logs(self, user):
        if not self._check_admin(user):
            return {
                "success": False,
                "error": "Permission denied",
            }

        self.audit.clear()

        self.audit.log(
            event_type="audit_logs_cleared",
            actor_id=user.get("id"),
            actor_role=user.get("role"),
            success=True,
            action="clear_audit_logs",
            risk_level="high",
        )

        return {
            "success": True,
        }
