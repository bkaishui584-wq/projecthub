from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional


@dataclass
class ToolContext:
    """
    Agent 工具执行上下文。

    注意：
    这里保存的是经过 ProjectHub 权限系统过滤后的信息。

    Tool 本身不能自行寻找：
    - 数据库
    - .env
    - 源代码
    - Session
    - Cookie
    - 管理员密码
    - 系统文件
    """

    user_id: Optional[str] = None
    user_role: Optional[str] = None
    project_id: Optional[str] = None

    project: Dict[str, Any] = field(default_factory=dict)
    safe_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolResult:
    """
    工具执行结果。
    """

    success: bool
    data: Any = None
    error: Optional[str] = None
    tool_name: Optional[str] = None

    def to_dict(self):
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "tool_name": self.tool_name,
        }


class AgentTool:
    """
    ProjectHub Agent 工具基类。

    每一个工具都必须明确：
    - 名称
    - 描述
    - 是否只读
    - 是否允许 Agent 使用
    - 允许哪些角色
    """

    name = ""
    description = ""

    # read_only:
    # True  = 只读取安全项目资料
    # False = 可能修改数据
    read_only = True

    # 是否允许 Agent 自动调用
    agent_allowed = True

    # 可以使用这个工具的角色
    allowed_roles = {
        "system_admin",
        "project_leader",
        "project_member",
    }

    def __init__(self):
        if not self.name:
            raise ValueError("Tool name cannot be empty")

    def can_use(self, context: ToolContext):
        if not self.agent_allowed:
            return False

        if context.user_role not in self.allowed_roles:
            return False

        return True

    def execute(
        self,
        context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> ToolResult:
        raise NotImplementedError("Tool must implement execute()")

    def metadata(self):
        return {
            "name": self.name,
            "description": self.description,
            "read_only": self.read_only,
            "agent_allowed": self.agent_allowed,
            "allowed_roles": list(self.allowed_roles),
        }
