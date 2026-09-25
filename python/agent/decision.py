class DecisionTracker:

    def __init__(self):
        self.decisions = []
        self.counter = 0
        self.message_ids = set()

    def add_decision(self, item):
        message_id = item.get("message_id")

        if message_id and message_id in self.message_ids:
            return None

        self.counter += 1

        decision = {
            "id": f"decision_{self.counter:03d}",
            "content": item.get("content", ""),
            "author": item.get("author"),
            "authorName": item.get("authorName"),
            "message_id": message_id,
            "time": item.get("time"),
            "status": "active",
            "replaced_by": None,
        }

        self.decisions.append(decision)
        if message_id:
            self.message_ids.add(message_id)

        return decision

    def get_active_decisions(self):
        return [decision for decision in self.decisions if decision.get("status") == "active"]

    def get_all_decisions(self):
        return self.decisions

    def get_all(self):
        return self.decisions

    def clear(self):
        self.decisions = []
        self.counter = 0
        self.message_ids = set()

    def replace_decision(self, old_id, new_id):
        old_decision = next((decision for decision in self.decisions if decision.get("id") == old_id), None)

        if old_decision is None:
            return False

        old_decision["status"] = "replaced"
        old_decision["replaced_by"] = new_id

        return True

    def cancel_decision(self, decision_id):
        decision = next((decision for decision in self.decisions if decision.get("id") == decision_id), None)

        if decision is None:
            return False

        decision["status"] = "cancelled"

        return True

    def update_decisions(self, discussion):
        decisions = discussion.get("decisions", [])

        for item in decisions:
            self.add_decision(item)

        return self.get_active_decisions()
