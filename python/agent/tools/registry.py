from agent.tools.policy import ToolPolicy


class ToolRegistry:
    """
    Agent Tool 注册中心。

    Agent 不直接寻找 Python 函数。

    Agent 只能通过 Registry
    找到已经注册并经过安全策略允许的工具。
    """

    def __init__(self):
        self.tools = {}

    def register(self, tool):
        """
        注册工具。
        """

        if tool.name in self.tools:
            raise ValueError(f"Tool already registered: {tool.name}")

        self.tools[tool.name] = tool

    def get(self, tool_name):
        return self.tools.get(tool_name)

    def list_tools(self):
        return [tool.metadata() for tool in self.tools.values() if ToolPolicy.is_allowed(tool.name)]

    def execute(
        self,
        tool_name,
        context,
        arguments=None,
    ):
        """
        执行工具。

        这里进行三层检查：

        1. 工具是否存在
        2. 工具是否在安全白名单
        3. 当前用户是否有权限
        """

        if not ToolPolicy.is_allowed(tool_name):
            return {
                "success": False,
                "error": "Tool is not allowed",
                "tool_name": tool_name,
            }

        tool = self.get(tool_name)

        if tool is None:
            return {
                "success": False,
                "error": "Tool not found",
                "tool_name": tool_name,
            }

        if not getattr(tool, "read_only", False):
            return {
                "success": False,
                "error": "Tool is not read-only",
                "tool_name": tool_name,
            }

        if not tool.can_use(context):
            return {
                "success": False,
                "error": "Permission denied",
                "tool_name": tool_name,
            }

        result = tool.execute(
            context=context,
            arguments=arguments or {},
        )

        if hasattr(result, "to_dict"):
            return result.to_dict()

        return result
