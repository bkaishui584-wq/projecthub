from agent.safety.policy import SafetyPolicy


class OutputSanitizer:
    """
    Agent 输出安全处理器。

    原则：
    - 不改变正常研究建议
    - 对明显越权内容进行删除
    - 对未经授权的最终决策表述进行降级
    """

    def sanitize(
        self,
        text,
    ):
        if not isinstance(text, str):
            return {
                "content": "",
                "modified": True,
                "reasons": ["Output is not text"],
            }

        content = text
        reasons = []
        modified = False

        # 删除明显的敏感配置引用
        if SafetyPolicy.contains_secret_reference(content):
            content = self._remove_sensitive_lines(content)

            modified = True

            reasons.append("Sensitive information reference removed")

        # 将 Agent 的最终决策性表述降级成建议
        if SafetyPolicy.contains_unauthorized_decision_claim(content):
            content = self._downgrade_decision_claims(content)

            modified = True

            reasons.append("Unauthorized decision claims downgraded")

        return {
            "content": content,
            "modified": modified,
            "reasons": reasons,
        }

    def _remove_sensitive_lines(
        self,
        text,
    ):
        safe_lines = []

        for line in text.splitlines():

            if SafetyPolicy.contains_secret_reference(line):
                safe_lines.append("【安全提示】部分内容涉及敏感信息，已隐藏。")
                continue

            safe_lines.append(line)

        return "\n".join(safe_lines)

    def _downgrade_decision_claims(
        self,
        text,
    ):
        replacements = {
            "最终决定采用": "可以考虑采用",
            "项目最终采用": "可以进一步研究",
            "已经决定采用": "可以进一步评估",
            "必须采用": "可以考虑",
            "负责人已经决定": "负责人可以进一步判断",
            "团队已经决定": "项目组可以进一步讨论",
            "项目组已经确认": "项目组目前可以进一步确认",
        }

        result = text

        for old, new in replacements.items():
            result = result.replace(
                old,
                new,
            )

        return result
