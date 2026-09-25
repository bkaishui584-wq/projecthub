from __future__ import annotations

import threading
from datetime import datetime, timezone

from agent.core.permission import AgentPermission
from agent.core.state import AgentState


class AgentController:
    """Agent 状态与授权控制器。"""

    def __init__(self, user_role, project_id):
        self.permission = AgentPermission(user_role=user_role, project_id=project_id)
        self.state = AgentState()
        self.lock = threading.RLock()
        self.authorized_by = None
        self.authorized_at = None
        self.current_project_id = project_id

    def authorize_thinking(self, user_id, project_id, user_role=None):
        permission = AgentPermission(
            user_role=(user_role or self.permission.user_role),
            project_id=self.current_project_id,
        )

        with self.lock:
            if not permission.can_start_thinking(project_id):
                return {
                    "success": False,
                    "error": "Permission denied",
                    "state": self.state.get_state(),
                }

            if not self.state.start_thinking():
                return {
                    "success": False,
                    "error": f"Agent cannot start thinking from state {self.state.get_state()}",
                    "state": self.state.get_state(),
                }

            self.authorized_by = user_id
            self.authorized_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            self.current_project_id = project_id

            return {
                "success": True,
                "state": self.state.get_state(),
                "authorized_by": self.authorized_by,
                "authorized_at": self.authorized_at,
                "project_id": self.current_project_id,
            }

    def start_analysis(self):
        with self.lock:
            if not self.state.start_analyzing():
                return {
                    "success": False,
                    "error": "Agent is not authorized to start analysis",
                    "state": self.state.get_state(),
                }
            return {"success": True, "state": self.state.get_state()}

    def start_suggestion(self):
        with self.lock:
            if not self.state.start_suggesting():
                return {
                    "success": False,
                    "error": "Agent cannot start suggestion stage",
                    "state": self.state.get_state(),
                }
            return {"success": True, "state": self.state.get_state()}

    def finish(self):
        with self.lock:
            if not self.state.finish():
                return {
                    "success": False,
                    "error": "Agent cannot finish from current state",
                    "state": self.state.get_state(),
                }
            return {"success": True, "state": self.state.get_state()}

    def abort(self):
        with self.lock:
            self.state.abort()
            return {"success": True, "state": self.state.get_state()}

    def reset(self):
        with self.lock:
            self.state.reset()
            self.authorized_by = None
            self.authorized_at = None
            return {"success": True, "state": self.state.get_state()}

    def get_state(self):
        with self.lock:
            return {
                "state": self.state.get_state(),
                "authorized_by": self.authorized_by,
                "authorized_at": self.authorized_at,
                "project_id": self.current_project_id,
            }
