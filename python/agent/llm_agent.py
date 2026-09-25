import json

from agent.llm import LLMGateway

from agent.prompts import (
    AGENT_SYSTEM_PROMPT,
    ANALYSIS_USER_TEMPLATE,
)

from agent.tool_calling import (
    ToolCallingEngine,
)

from agent.tools.base import ToolContext

from agent.safety import (
    InputGuard,
    OutputGuard,
    SafetyPolicy,
)


class LLMAgentAnalyzer:
    """
    ProjectHub Agent 的 LLM 分析层。

    负责：

    1. 将 ProjectHub 项目上下文转换为 LLM Prompt
    2. 调用 LLM
    3. 解析 LLM JSON
    4. 进行输入安全检查
    5. 进行输出安全检查
    6. 处理 Tool Calling
    7. 阻止 LLM 越权调用危险工具

    本类不负责：

    - 用户身份认证
    - 项目权限判断
    - 修改项目核心数据
    - 执行系统命令
    - 访问数据库密码
    - 访问 .env
    - 访问源码
    """

    def __init__(
        self,
        llm=None,
        tool_registry=None,
    ):
        self.llm = llm or LLMGateway()

        self.tool_engine = None

        if tool_registry is not None:
            self.tool_engine = ToolCallingEngine(tool_registry)

        # 输入安全检查
        self.input_guard = InputGuard()

        # 输出安全检查
        self.output_guard = OutputGuard()

    # =========================================================
    # 普通 LLM 分析
    # =========================================================

    def analyze(
        self,
        project_context,
    ):
        """
        对项目上下文进行普通分析。

        流程：

        Project Context
            ↓
        Input Guard
            ↓
        Prompt
            ↓
        LLM
            ↓
        JSON
            ↓
        Output Guard
            ↓
        返回
        """

        # -----------------------------------------------------
        # 1. 输入安全检查
        # -----------------------------------------------------

        input_check = self.input_guard.inspect_project_context(project_context)

        if not input_check.get(
            "allowed",
            False,
        ):
            return {
                "success": False,
                "error": ("Project context " "blocked by safety policy"),
                "safety": input_check,
            }

        # -----------------------------------------------------
        # 2. 构建 Prompt
        # -----------------------------------------------------

        user_prompt = self._build_analysis_prompt(project_context)

        # -----------------------------------------------------
        # 3. 调用 LLM
        # -----------------------------------------------------

        result = self.llm.generate_json(
            system_prompt=(AGENT_SYSTEM_PROMPT),
            user_prompt=user_prompt,
            temperature=0.1,
        )

        if not result.get(
            "success",
            False,
        ):
            return result

        # -----------------------------------------------------
        # 4. 输出安全检查
        # -----------------------------------------------------

        output_check = self.output_guard.inspect(result.get("data"))

        if not output_check.get(
            "allowed",
            False,
        ):
            return {
                "success": False,
                "error": ("LLM output " "blocked by safety policy"),
                "safety": output_check,
            }

        # -----------------------------------------------------
        # 5. 返回安全结果
        # -----------------------------------------------------

        return {
            **result,
            "data": output_check.get("output"),
            "safety": {
                "risk_level": output_check.get("risk_level"),
                "modified": output_check.get(
                    "modified",
                    False,
                ),
                "reasons": output_check.get(
                    "reasons",
                    [],
                ),
            },
        }

    # =========================================================
    # Tool Calling 分析
    # =========================================================

    def analyze_with_tools(
        self,
        project_context,
    ):
        """
        使用 Tool Calling 分析项目。

        LLM 可以：

        - 查看允许的项目资料
        - 查询研究资料
        - 查询 RAG

        但不能：

        - 访问源码
        - 访问 .env
        - 读取密码
        - 修改权限
        - 修改项目核心数据
        - 执行系统命令
        """

        # -----------------------------------------------------
        # 1. 检查 Tool Engine
        # -----------------------------------------------------

        if self.tool_engine is None:
            return {
                "success": False,
                "error": ("Tool registry " "is not configured"),
            }

        # -----------------------------------------------------
        # 2. 输入安全检查
        # -----------------------------------------------------

        input_check = self.input_guard.inspect_project_context(project_context)

        if not input_check.get(
            "allowed",
            False,
        ):
            return {
                "success": False,
                "error": ("Project context " "blocked by safety policy"),
                "safety": input_check,
            }

        # -----------------------------------------------------
        # 3. 获取允许的工具
        # -----------------------------------------------------

        tool_definitions = self.tool_engine.get_tool_definitions()

        # -----------------------------------------------------
        # 4. 构建 Tool Calling Prompt
        # -----------------------------------------------------

        user_prompt = self._build_tool_call_prompt(
            project_context,
            tool_definitions,
        )

        # -----------------------------------------------------
        # 5. 调用 LLM
        # -----------------------------------------------------

        result = self.llm.generate(
            system_prompt=(AGENT_SYSTEM_PROMPT),
            user_prompt=user_prompt,
            temperature=0.1,
        )

        if not result.get(
            "success",
            False,
        ):
            return result

        # -----------------------------------------------------
        # 6. 解析 Tool Calls
        # -----------------------------------------------------

        parsed = self.tool_engine.parse_tool_calls(
            result.get(
                "content",
                "",
            )
        )

        # -----------------------------------------------------
        # 7. 检查解析结果
        # -----------------------------------------------------

        if not parsed.get(
            "success",
            False,
        ):
            return {
                **result,
                "tool_calling": parsed,
            }

        # -----------------------------------------------------
        # 8. 第二层安全检查
        #
        # 防止 LLM 自己创造危险工具名称
        # -----------------------------------------------------

        blocked_calls = []

        for call in parsed.get(
            "tool_calls",
            [],
        ):
            tool_name = call.get("tool")

            if SafetyPolicy.is_forbidden_tool(tool_name):
                blocked_calls.append(tool_name)

        if blocked_calls:
            return {
                "success": False,
                "error": ("Tool call blocked " "by safety policy"),
                "blocked_tools": blocked_calls,
                "tool_calling": parsed,
            }

        # -----------------------------------------------------
        # 9. 没有 Tool Call
        # -----------------------------------------------------

        tool_calls = parsed.get(
            "tool_calls",
            [],
        )

        if not tool_calls:
            return {
                **result,
                "tool_calling": parsed,
                "tool_results": [],
                "safety": {
                    "risk_level": "low",
                    "modified": False,
                    "reasons": [],
                },
            }

        # -----------------------------------------------------
        # 10. 执行 Tool
        #
        # ToolRegistry 会再次进行权限检查
        # -----------------------------------------------------

        tool_context = project_context.get(
            "tool_context",
            {},
        )

        execution_context = self._build_execution_context(
            project_context,
            tool_context,
        )

        execution_result = self.tool_engine.execute_tool_calls(
            context=execution_context,
            tool_calls=tool_calls,
        )

        # -----------------------------------------------------
        # 11. 检查 Tool 执行结果
        # -----------------------------------------------------

        if not execution_result.get(
            "success",
            False,
        ):
            return {
                **result,
                "tool_calling": parsed,
                "tool_results": execution_result,
            }

        # -----------------------------------------------------
        # 12. 对 Tool 返回内容进行安全检查
        # -----------------------------------------------------

        tool_results = execution_result.get(
            "results",
            [],
        )

        safe_tool_results = []

        for item in tool_results:

            checked = self.output_guard.inspect(item)

            if not checked.get(
                "allowed",
                False,
            ):
                safe_tool_results.append(
                    {
                        "tool": item.get("tool"),
                        "blocked": True,
                        "reason": checked.get(
                            "reasons",
                            [],
                        ),
                    }
                )

                continue

            safe_tool_results.append(item)

        # -----------------------------------------------------
        # 13. 返回 Tool 结果
        # -----------------------------------------------------

        return {
            **result,
            "tool_calling": parsed,
            "tool_results": safe_tool_results,
            "safety": {
                "risk_level": "low",
                "modified": False,
                "reasons": [],
            },
        }

    # =========================================================
    # 构建普通分析 Prompt
    # =========================================================

    def _build_analysis_prompt(
        self,
        project_context,
    ):
        project = json.dumps(
            project_context.get(
                "project",
                {},
            ),
            ensure_ascii=False,
        )

        information = json.dumps(
            project_context.get(
                "information",
                {},
            ),
            ensure_ascii=False,
        )

        decisions = json.dumps(
            project_context.get(
                "decisions",
                [],
            ),
            ensure_ascii=False,
        )

        questions = json.dumps(
            project_context.get(
                "questions",
                [],
            ),
            ensure_ascii=False,
        )

        research_directions = json.dumps(
            project_context.get(
                "research_directions",
                [],
            ),
            ensure_ascii=False,
        )

        research_candidates = json.dumps(
            project_context.get(
                "research_candidates",
                [],
            ),
            ensure_ascii=False,
        )

        return ANALYSIS_USER_TEMPLATE.format(
            project=project,
            information=information,
            decisions=decisions,
            questions=questions,
            research_directions=(research_directions),
            research_candidates=(research_candidates),
        )

    # =========================================================
    # 构建 Tool Calling Prompt
    # =========================================================

    def _build_tool_call_prompt(
        self,
        project_context,
        tool_definitions,
    ):
        prompt_context = {
            key: value
            for key, value in project_context.items()
            if key != "tool_context"
        }

        context = json.dumps(
            prompt_context,
            ensure_ascii=False,
            indent=2,
        )

        tools = json.dumps(
            tool_definitions,
            ensure_ascii=False,
            indent=2,
        )

        return f"""
你正在使用 ProjectHub Research Agent。

你的身份是：

项目研究辅助工具。

你的职责不是替项目负责人做最终决定。

你只能：

- 整理已有项目资料
- 查阅已经授权的项目资料
- 查找已经授权的外部研究资料
- 使用 RAG 检索研究资料
- 发现值得进一步研究的问题
- 提供研究角度
- 提供可以验证的假设
- 提供理论研究方向
- 提供新的思考角度

你不能：

- 自己创造不存在的工具
- 自己扩大数据访问范围
- 访问源码
- 访问 .env
- 访问密码
- 访问 Session
- 访问 Cookie
- 执行系统命令
- 修改项目核心数据
- 修改权限
- 修改用户角色
- 修改管理员密码
- 删除项目数据
- 替项目负责人做最终决定

特别注意：

1. ProjectHub 项目资料属于“项目已有信息”。

2. 论文、RAG 检索结果、互联网资料属于“外部资料”。

3. 外部资料不能被描述成：
   “项目组已经确定的事实”。

4. LLM 自己推导出的内容必须标记为：
   “建议”、“推测”或“研究角度”。

5. 如果资料不足，必须明确说明：
   “目前资料不足”。

6. 不允许编造：
   - 论文
   - 作者
   - 数据
   - 实验结果
   - URL
   - 项目决定

7. 不允许输出任何密码、
   API Key、Token、Cookie、
   Session 或其他凭证。

8. 不允许协助：
   - 绕过权限
   - 窃取凭证
   - 恶意攻击
   - 破坏系统
   - 未授权访问

下面是当前允许使用的工具：

{tools}

下面是当前项目上下文：

{context}

如果当前项目上下文已经足够，
不要调用工具。

如果需要进一步获取资料，
只能从上面的工具列表中选择。

禁止创造不存在的工具。

请严格返回 JSON。

如果需要调用工具：

{{
    "tool_calls": [
        {{
            "tool": "工具名称",
            "arguments": {{}}
        }}
    ]
}}

如果不需要调用工具：

{{
    "tool_calls": []
}}

禁止返回 Markdown。
禁止返回解释文字。
"""

    # =========================================================
    # 构建 Tool 执行上下文
    # =========================================================

    def _build_execution_context(
        self,
        project_context,
        tool_context,
    ):
        """
        将 ProjectHub 已经提供的安全上下文
        转换成 ToolContext。

        注意：

        这里不从数据库读取用户权限。

        用户身份和权限必须由上层
        ProjectHub 服务端提供。
        """

        project = project_context.get("project", {})

        if isinstance(tool_context, ToolContext):
            return ToolContext(
                user_id=tool_context.user_id,
                user_role=tool_context.user_role,
                project_id=tool_context.project_id,
                project=project or tool_context.project,
                safe_data=tool_context.safe_data,
            )

        if not isinstance(tool_context, dict):
            tool_context = {}

        return ToolContext(
            user_id=tool_context.get("user_id"),
            user_role=tool_context.get("user_role"),
            project_id=tool_context.get("project_id"),
            project=project,
            safe_data=tool_context.get(
                "safe_data",
                project_context.get("safe_data", {}),
            ),
        )

    # =========================================================
    # Tool 结果上下文
    # =========================================================

    def build_tool_result_context(
        self,
        tool_results,
    ):
        """
        将 Tool 结果转换为后续 LLM
        可以理解的上下文。

        外部研究资料统一标记为 external。
        """

        if not isinstance(
            tool_results,
            list,
        ):
            tool_results = []

        return {
            "tool_results": tool_results,
            "source_rules": {
                "project": ("项目组已有信息"),
                "external": ("外部研究资料"),
                "model": ("模型推测或建议"),
            },
        }
