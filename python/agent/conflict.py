class ConflictDetector:
    """
    项目讨论冲突检测器。

    Agent 只标记潜在冲突，
    不替项目组裁决。
    """

    CONFLICT_MARKERS = (
        "不采用",
        "不需要",
        "无需",
        "放弃",
        "改成",
        "换成",
        "反对",
        "但是",
        "不过",
        "风险",
        "问题在于",
        "不适合",
    )

    def __init__(self):
        self.conflicts = []
        self.counter = 0

    def detect(self, existing, new):
        if not isinstance(existing, dict) or not isinstance(new, dict):
            return None

        existing_content = str(existing.get("content") or "").strip()
        new_content = str(new.get("content") or "").strip()

        if not existing_content or not new_content:
            return None

        if existing_content == new_content:
            return None

        if not any(marker in new_content for marker in self.CONFLICT_MARKERS):
            return None

        existing_id = existing.get("message_id") or existing.get("id")
        new_id = new.get("message_id") or new.get("id")

        for item in self.conflicts:
            old = item.get("existing") or {}
            current = item.get("new") or {}
            old_id = old.get("message_id") or old.get("id")
            current_id = current.get("message_id") or current.get("id")
            if old_id == existing_id and current_id == new_id:
                return item

        return self.add_conflict(
            "decision_vs_opinion",
            "后续观点可能与此前决策存在差异，需要负责人进一步确认依据。",
            existing,
            new,
        )

    def add_conflict(self, conflict_type, description, existing, new):
        self.counter += 1

        conflict = {
            "id": f"conflict_{self.counter:03d}",
            "type": conflict_type,
            "description": description,
            "existing": existing,
            "new": new,
            "status": "pending",
            "resolved_by": None,
            "resolved_at": None,
        }

        self.conflicts.append(conflict)
        return conflict

    def get_all(self):
        return list(self.conflicts)

    def get_pending_conflicts(self):
        return [conflict for conflict in self.conflicts if conflict.get("status") == "pending"]

    def resolve_conflict(self, conflict_id, user_id):
        conflict = self._find(conflict_id)
        if conflict is None:
            return False
        conflict["status"] = "resolved"
        conflict["resolved_by"] = user_id
        return True

    def ignore_conflict(self, conflict_id, user_id):
        conflict = self._find(conflict_id)
        if conflict is None:
            return False
        conflict["status"] = "ignored"
        conflict["resolved_by"] = user_id
        return True

    def _find(self, conflict_id):
        return next((item for item in self.conflicts if item.get("id") == conflict_id), None)

    def clear(self):
        self.conflicts = []
        self.counter = 0
