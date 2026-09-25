import json
from typing import Any, Dict, List, Optional
from agent.safety.policy import SafetyPolicy


class ToolCallValidator:
    """
    Agent Tool Calling 安全验证器。

    LLM 只能提出工具调用请求。
    是否允许执行，必须由 ToolRegistry + ToolPolicy 决定。
    """

    REQUIRED_FIELDS = {
        "tool",
        "arguments",
    }

    def validate(self, tool_call):
        if not isinstance(tool_call, dict):
            return {
                "valid": False,
                "error": "Tool call must be an object",
            }

        missing = self.REQUIRED_FIELDS - set(tool_call.keys())

        if missing:
            return {
                "valid": False,
                "error": ("Missing required fields: " + ", ".join(sorted(missing))),
            }

        tool_name = tool_call.get("tool")

        if not isinstance(tool_name, str):
            return {
                "valid": False,
                "error": "Tool name must be a string",
            }

        arguments = tool_call.get("arguments")

        if not isinstance(arguments, dict):
            return {
                "valid": False,
                "error": "Tool arguments must be an object",
            }

        return {
            "valid": True,
            "tool": tool_name,
            "arguments": arguments,
        }


class ToolCallParser:
    """
    解析 LLM 返回的 Tool Calling JSON。
    """

    def parse(self, content):
        if not isinstance(content, str):
            return {
                "success": False,
                "error": "LLM content must be a string",
                "tool_calls": [],
            }

        content = content.strip()

        if not content:
            return {
                "success": False,
                "error": "LLM returned empty content",
                "tool_calls": [],
            }

        data = self._parse_json(content)

        if data is None:
            return {
                "success": False,
                "error": "Unable to parse tool call JSON",
                "tool_calls": [],
            }

        if isinstance(data, dict):
            if "tool_calls" in data:
                tool_calls = data.get("tool_calls")

            elif "tool" in data:
                tool_calls = [data]

            else:
                return {
                    "success": True,
                    "tool_calls": [],
                    "data": data,
                }

        elif isinstance(data, list):
            tool_calls = data

        else:
            return {
                "success": False,
                "error": "Invalid tool call format",
                "tool_calls": [],
            }

        if not isinstance(tool_calls, list):
            return {
                "success": False,
                "error": "tool_calls must be a list",
                "tool_calls": [],
            }

        validator = ToolCallValidator()

        valid_calls = []
        invalid_calls = []

        for call in tool_calls:

            result = validator.validate(call)

            if result.get("valid"):
                valid_calls.append(
                    {
                        "tool": result["tool"],
                        "arguments": result["arguments"],
                    }
                )
            else:
                invalid_calls.append(
                    {
                        "call": call,
                        "error": result.get("error"),
                    }
                )

        return {
            "success": True,
            "tool_calls": valid_calls,
            "invalid_calls": invalid_calls,
        }

    def _parse_json(self, content):
        try:
            return json.loads(content)

        except json.JSONDecodeError:
            pass

        if content.startswith("```"):
            lines = content.splitlines()

            if len(lines) >= 3:
                content = "\n".join(lines[1:-1]).strip()

                try:
                    return json.loads(content)

                except json.JSONDecodeError:
                    pass

        start = content.find("{")
        end = content.rfind("}")

        if start != -1 and end != -1 and end > start:
            candidate = content[start : end + 1]

            try:
                return json.loads(candidate)

            except json.JSONDecodeError:
                pass

        start = content.find("[")
        end = content.rfind("]")

        if start != -1 and end != -1 and end > start:
            candidate = content[start : end + 1]

            try:
                return json.loads(candidate)

            except json.JSONDecodeError:
                pass

        return None


class ToolCallingEngine:
    """
    Tool Calling 执行引擎。

    负责：

    1. 给 LLM 提供可用工具描述
    2. 接收 LLM 的工具调用请求
    3. 验证工具调用格式
    4. 交给 ToolRegistry 执行
    5. 收集执行结果

    注意：

    这里不直接赋予 LLM 权限。
    """

    MAX_TOOL_CALLS = 5

    def __init__(self, tool_registry):
        self.tool_registry = tool_registry
        self.parser = ToolCallParser()

    def get_tool_definitions(self):
        """
        获取当前允许 LLM 使用的工具定义。
        """

        tools = self.tool_registry.list_tools()

        definitions = []

        for tool in tools:
            definitions.append(
                {
                    "name": tool.get("name"),
                    "description": tool.get(
                        "description",
                        "",
                    ),
                    "read_only": tool.get(
                        "read_only",
                        True,
                    ),
                }
            )

        return definitions

    def parse_tool_calls(self, content):
        """
        解析 LLM 输出。
        """

        return self.parser.parse(content)

    def execute_tool_calls(
        self,
        context,
        tool_calls,
    ):
        if not isinstance(tool_calls, list):
            return {
                "success": False,
                "error": "tool_calls must be a list",
                "results": [],
            }

        if len(tool_calls) > self.MAX_TOOL_CALLS:
            return {
                "success": False,
                "error": "Too many tool calls in one request",
                "results": [],
            }

        results = []

        for call in tool_calls:

            if not isinstance(call, dict):
                results.append(
                    {
                        "tool": None,
                        "success": False,
                        "error": "Invalid tool call",
                    }
                )
                continue

            tool_name = call.get("tool")

            arguments = call.get(
                "arguments",
                {},
            )

            if not isinstance(arguments, dict):
                results.append(
                    {
                        "tool": tool_name,
                        "success": False,
                        "error": "Tool arguments must be an object",
                    }
                )
                continue

            # 第一层安全检查
            if SafetyPolicy.is_forbidden_tool(tool_name):
                results.append(
                    {
                        "tool": tool_name,
                        "success": False,
                        "error": ("Tool blocked by safety policy"),
                    }
                )
                continue

            try:
                result = self.tool_registry.execute(
                    tool_name=tool_name,
                    context=context,
                    arguments=arguments,
                )
            except Exception:
                result = {
                    "success": False,
                    "error": "Tool execution failed",
                    "tool_name": tool_name,
                }

            results.append(
                {
                    "tool": tool_name,
                    "result": result,
                }
            )

        return {
            "success": True,
            "results": results,
        }

    def build_tool_result_context(
        self,
        tool_results,
    ):
        """
        将工具执行结果转换成
        LLM 可以继续处理的上下文。
        """

        return {"tool_results": tool_results}
