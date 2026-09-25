from agent.safety.policy import SafetyPolicy


class InputGuard:
    """
    Agent 输入安全检查。

    只负责判断输入是否存在明显安全风险。
    不负责修改项目数据。
    """

    def inspect(self, text):
        text = text or ""

        if not isinstance(text, str):
            return {
                "allowed": False,
                "risk_level": "high",
                "reasons": ["Input must be a string"],
            }

        reasons = []

        if SafetyPolicy.contains_secret_reference(text):
            reasons.append("Input may contain sensitive credential information")

        if SafetyPolicy.contains_dangerous_content(text):
            reasons.append("Input contains potentially dangerous content")

        if not reasons:
            return {
                "allowed": True,
                "risk_level": "low",
                "reasons": [],
            }

        return {
            "allowed": False,
            "risk_level": "high",
            "reasons": reasons,
        }

    def inspect_project_context(
        self,
        context,
    ):
        if not isinstance(context, dict):
            return {
                "allowed": False,
                "risk_level": "high",
                "reasons": ["Invalid project context"],
            }

        serialized = str(context)

        return self.inspect(serialized)
