from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from datetime import datetime, timezone


@dataclass
class AuditEvent:
    """
    Agent 审计事件。

    所有重要 Agent 行为都可以转换成统一的审计事件。
    """

    event_type: str
    actor_id: Optional[str] = None
    actor_role: Optional[str] = None
    project_id: Optional[str] = None

    success: bool = True

    action: Optional[str] = None

    details: Dict[str, Any] = field(default_factory=dict)

    risk_level: str = "low"

    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

    def to_dict(self):
        return {
            "event_type": self.event_type,
            "actor_id": self.actor_id,
            "actor_role": self.actor_role,
            "project_id": self.project_id,
            "success": self.success,
            "action": self.action,
            "details": self.details,
            "risk_level": self.risk_level,
            "timestamp": self.timestamp,
        }
