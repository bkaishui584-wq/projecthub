import json
import os
from typing import Any

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


class LLMConfig:
    """
    LLM 配置。

    默认使用 OpenAI-compatible API，
    因此后续可以接入不同的模型服务。
    """

    def __init__(
        self,
        api_key=None,
        base_url=None,
        model=None,
    ):

        self.base_url = (
            base_url
            or os.getenv("AGENT_LLM_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("PY_LLM_BASE_URL")
        )

        self.api_key = (
            api_key
            or os.getenv("AGENT_LLM_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("PY_LLM_API_KEY")
        )

        if self.base_url and not self.api_key:
            self.api_key = "local"

        self.model = (
            model
            or os.getenv("AGENT_LLM_MODEL")
            or os.getenv("PY_LLM_MODEL")
            or ""
        )

        try:
            self.timeout = max(5.0, min(180.0, float(os.getenv("AGENT_LLM_TIMEOUT", "60"))))
        except (TypeError, ValueError):
            self.timeout = 60.0


class LLMGateway:
    """
    Agent 与大模型之间的唯一通信入口。

    Agent 其他模块不要直接调用 OpenAI SDK。
    """

    def __init__(
        self,
        config=None,
    ):

        self.config = config or LLMConfig()

        self.client = None

        if OpenAI is not None and self.config.api_key:

            client_kwargs = {
                "api_key": self.config.api_key,
                "timeout": self.config.timeout,
            }

            if self.config.base_url:
                client_kwargs["base_url"] = self.config.base_url

            self.client = OpenAI(**client_kwargs)

    # ==================================================
    # 判断是否可用
    # ==================================================

    def is_available(self):

        return self.client is not None and bool(self.config.model)

    # ==================================================
    # 普通文本请求
    # ==================================================

    def generate(
        self,
        system_prompt,
        user_prompt,
        temperature=0.2,
    ):
        """
        向 LLM 发送请求。

        注意：
        这个方法只负责通信。
        不负责权限判断。
        """

        if not self.is_available():

            return {
                "success": False,
                "error": "LLM is not configured",
                "content": "",
            }

        try:

            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": user_prompt,
                    },
                ],
                temperature=temperature,
            )

            content = response.choices[0].message.content or ""

            return {
                "success": True,
                "content": content,
                "model": self.config.model,
            }

        except Exception as exc:

            return {
                "success": False,
                "error": str(exc),
                "content": "",
            }

    # ==================================================
    # JSON 请求
    # ==================================================

    def generate_json(
        self,
        system_prompt,
        user_prompt,
        temperature=0.1,
    ):
        """
        请求模型返回 JSON。

        即使模型返回 Markdown JSON，
        也尝试提取 JSON。
        """

        result = self.generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
        )

        if not result.get("success"):

            return result

        content = result.get(
            "content",
            "",
        ).strip()

        try:

            data = json.loads(content)

            return {
                **result,
                "data": data,
            }

        except json.JSONDecodeError:

            extracted = self._extract_json(content)

            if extracted is None:

                return {
                    **result,
                    "success": False,
                    "error": ("LLM returned invalid JSON"),
                    "data": None,
                }

            return {
                **result,
                "data": extracted,
            }

    # ==================================================
    # 提取 JSON
    # ==================================================

    def _extract_json(
        self,
        content,
    ):

        content = content.strip()

        if content.startswith("```"):

            lines = content.splitlines()

            if len(lines) >= 3:

                lines = lines[1:-1]

                content = "\n".join(lines).strip()

        try:

            return json.loads(content)

        except json.JSONDecodeError:

            pass

        # 尝试寻找最外层 JSON 对象
        start = content.find("{")
        end = content.rfind("}")

        if start != -1 and end != -1 and end > start:

            candidate = content[start : end + 1]

            try:

                return json.loads(candidate)

            except json.JSONDecodeError:

                pass

        # 尝试寻找 JSON 数组
        start = content.find("[")
        end = content.rfind("]")

        if start != -1 and end != -1 and end > start:

            candidate = content[start : end + 1]

            try:

                return json.loads(candidate)

            except json.JSONDecodeError:

                pass

        return None
