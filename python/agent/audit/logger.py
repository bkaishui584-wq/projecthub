from agent.audit.event import AuditEvent


class AuditLogger:
    """
    Agent 审计日志管理器。

    当前阶段使用内存保存。

    后续接入 ProjectHub 时，
    可以把这里替换成 SQLite / PostgreSQL。
    """

    MAX_EVENTS = 5000

    def __init__(self):
        self.events = []

    # =========================================================
    # 写入事件
    # =========================================================

    def log(
        self,
        event_type,
        actor_id=None,
        actor_role=None,
        project_id=None,
        success=True,
        action=None,
        details=None,
        risk_level="low",
    ):
        event = AuditEvent(
            event_type=event_type,
            actor_id=actor_id,
            actor_role=actor_role,
            project_id=project_id,
            success=success,
            action=action,
            details=details or {},
            risk_level=risk_level,
        )

        self.events.append(event)

        # 防止日志无限增长
        if len(self.events) > self.MAX_EVENTS:
            self.events = self.events[-self.MAX_EVENTS :]

        return event

    # =========================================================
    # 查询
    # =========================================================

    def get_all(self, limit=None):
        events = self.events
        if limit is not None:
            limit = max(1, min(int(limit), self.MAX_EVENTS))
            events = events[-limit:]
        return [event.to_dict() for event in events]

    def get_by_project(self, project_id):
        return [event.to_dict() for event in self.events if event.project_id == project_id]

    def get_by_actor(self, actor_id):
        return [event.to_dict() for event in self.events if event.actor_id == actor_id]

    def get_by_type(self, event_type):
        return [event.to_dict() for event in self.events if event.event_type == event_type]

    def get_security_events(self, limit=None):
        events = [
            event
            for event in self.events
            if event.risk_level in {"medium", "high", "critical"}
        ]
        if limit is not None:
            limit = max(1, min(int(limit), self.MAX_EVENTS))
            events = events[-limit:]
        return [event.to_dict() for event in events]

    # =========================================================
    # 最近事件
    # =========================================================

    def recent(self, limit=100):
        limit = max(
            1,
            min(limit, self.MAX_EVENTS),
        )

        return [event.to_dict() for event in self.events[-limit:]]

    # =========================================================
    # 清空
    # =========================================================

    def clear(self):
        self.events = []
