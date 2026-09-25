class SuggestionManager:
    """
    Agent 建议管理器。

    Agent 的建议只能作为：
    - 思路
    - 研究角度
    - 可关注方向
    - 待验证假设
    - 理论依据线索

    Agent 不直接替项目组做最终决定。
    """

    TYPE_IDEA = "idea"
    TYPE_RESEARCH_ANGLE = "research_angle"
    TYPE_DIRECTION = "direction"
    TYPE_HYPOTHESIS = "hypothesis"
    TYPE_THEORY = "theory"
    TYPE_WARNING = "warning"

    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_ARCHIVED = "archived"

    def __init__(self):
        self.suggestions = []
        self.counter = 0

    # ==================================================
    # 创建建议
    # ==================================================

    def add_suggestion(
        self,
        suggestion_type,
        content,
        reason="",
        sources=None,
        keywords=None,
    ):
        """
        创建一条 Agent 建议。

        sources 用于记录：
        这条建议依据了哪些项目已有信息。
        """

        content = (content or "").strip()

        if not content:
            return None

        self.counter += 1

        suggestion = {
            "id": f"suggestion_{self.counter:03d}",
            "type": suggestion_type,
            "content": content,
            "reason": (reason or "").strip(),
            "sources": sources or [],
            "keywords": list(dict.fromkeys(keywords or [])),
            "status": self.STATUS_PENDING,
        }

        self.suggestions.append(suggestion)

        return suggestion

    # ==================================================
    # 获取待处理建议
    # ==================================================

    def get_pending_suggestions(self):

        return [suggestion for suggestion in self.suggestions if suggestion.get("status") == self.STATUS_PENDING]

    # ==================================================
    # 获取全部建议
    # ==================================================

    def get_all_suggestions(self):

        return self.suggestions

    # ==================================================
    # 获取已接受建议
    # ==================================================

    def get_accepted_suggestions(self):

        return [suggestion for suggestion in self.suggestions if suggestion.get("status") == self.STATUS_ACCEPTED]

    # ==================================================
    # 接受建议
    # ==================================================

    def accept_suggestion(
        self,
        suggestion_id,
        user_id=None,
    ):

        suggestion = self._find_suggestion(suggestion_id)

        if suggestion is None:
            return False

        if suggestion.get("status") != (self.STATUS_PENDING):
            return False

        suggestion["status"] = self.STATUS_ACCEPTED

        suggestion["handled_by"] = user_id

        return True

    # ==================================================
    # 拒绝建议
    # ==================================================

    def reject_suggestion(
        self,
        suggestion_id,
        user_id=None,
    ):

        suggestion = self._find_suggestion(suggestion_id)

        if suggestion is None:
            return False

        if suggestion.get("status") != (self.STATUS_PENDING):
            return False

        suggestion["status"] = self.STATUS_REJECTED

        suggestion["handled_by"] = user_id

        return True

    # ==================================================
    # 归档建议
    # ==================================================

    def archive_suggestion(
        self,
        suggestion_id,
        user_id=None,
    ):

        suggestion = self._find_suggestion(suggestion_id)

        if suggestion is None:
            return False

        suggestion["status"] = self.STATUS_ARCHIVED

        suggestion["handled_by"] = user_id

        return True

    # ==================================================
    # 查找建议
    # ==================================================

    def get_suggestion(
        self,
        suggestion_id,
    ):

        return self._find_suggestion(suggestion_id)

    def _find_suggestion(
        self,
        suggestion_id,
    ):

        for suggestion in self.suggestions:

            if suggestion.get("id") == suggestion_id:
                return suggestion

        return None

    # ==================================================
    # 清空
    # ==================================================

    def clear(self):

        self.suggestions = []

        self.counter = 0
