from agent.safety.policy import SafetyPolicy
from agent.safety.sanitizer import (
    OutputSanitizer,
)


class OutputGuard:
    """
    Agent 最终输出安全审查器。

    LLM 输出不能直接发送给用户，
    必须经过这里。

    检查：
    1. 是否存在危险内容
    2. 是否泄露敏感信息
    3. 是否越权做最终决定
    4. 是否正确区分项目资料与外部资料
    """

    def __init__(
        self,
        sanitizer=None,
    ):
        self.sanitizer = sanitizer or OutputSanitizer()

    def inspect(
        self,
        output,
    ):
        if isinstance(output, dict):
            return self._inspect_dict(output)

        if isinstance(output, str):
            return self._inspect_text(output)

        return {
            "allowed": False,
            "risk_level": "high",
            "reasons": ["Unsupported output type"],
            "output": None,
        }

    def _inspect_text(
        self,
        text,
    ):
        reasons = []

        if SafetyPolicy.contains_dangerous_content(text):
            reasons.append("Potentially dangerous content detected")

        sanitized = self.sanitizer.sanitize(text)

        reasons.extend(
            sanitized.get(
                "reasons",
                [],
            )
        )

        if any("dangerous" in reason.lower() for reason in reasons):
            return {
                "allowed": False,
                "risk_level": "high",
                "reasons": reasons,
                "output": None,
            }

        return {
            "allowed": True,
            "risk_level": (
                "medium"
                if sanitized.get(
                    "modified",
                    False,
                )
                else "low"
            ),
            "reasons": reasons,
            "output": sanitized.get(
                "content",
                "",
            ),
            "modified": sanitized.get(
                "modified",
                False,
            ),
        }

    def _inspect_dict(
        self,
        data,
    ):
        if not isinstance(data, dict):
            return {
                "allowed": False,
                "risk_level": "high",
                "reasons": ["Invalid output object"],
                "output": None,
            }

        serialized_parts = []

        self._collect_text(
            data,
            serialized_parts,
        )

        combined_text = "\n".join(serialized_parts)

        result = self._inspect_text(combined_text)

        if not result.get("allowed"):
            return {
                **result,
                "output": None,
            }

        def sanitize_value(value):
            if isinstance(value, str):
                return self.sanitizer.sanitize(value).get("content", "")
            if isinstance(value, list):
                return [sanitize_value(item) for item in value]
            if isinstance(value, dict):
                return {key: sanitize_value(item) for key, item in value.items()}
            return value

        return {
            **result,
            "output": sanitize_value(data),
        }

    def _collect_text(
        self,
        value,
        result,
    ):
        if isinstance(value, str):
            result.append(value)
            return

        if isinstance(value, dict):
            for child in value.values():
                self._collect_text(
                    child,
                    result,
                )
            return

        if isinstance(value, list):
            for child in value:
                self._collect_text(
                    child,
                    result,
                )
