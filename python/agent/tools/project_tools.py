from agent.tools.base import AgentTool, ToolResult


class ProjectInfoTool(AgentTool):

    name = "project.get_info"

    description = "读取当前项目的公开基本信息，" "包括项目名称、简介、研究方向等安全信息。"

    read_only = True

    def execute(self, context, arguments=None):
        project = context.project or {}

        data = {
            "id": project.get("id"),
            "title": project.get("title"),
            "description": project.get("description") or project.get("desc"),
        }

        return ToolResult(
            success=True,
            data=data,
            tool_name=self.name,
        )


class ProjectDiscussionTool(AgentTool):

    name = "project.get_discussion"

    description = "读取当前项目已经公开的讨论内容。"

    read_only = True

    def execute(self, context, arguments=None):
        discussion = context.safe_data.get(
            "discussion",
            [],
        )

        return ToolResult(
            success=True,
            data=discussion,
            tool_name=self.name,
        )


class ProjectDecisionTool(AgentTool):

    name = "project.get_decisions"

    description = "读取项目组已经记录的项目决策。"

    read_only = True

    def execute(self, context, arguments=None):
        decisions = context.safe_data.get(
            "decisions",
            [],
        )

        return ToolResult(
            success=True,
            data=decisions,
            tool_name=self.name,
        )


class ProjectQuestionTool(AgentTool):

    name = "project.get_questions"

    description = "读取项目组当前尚未解决的开放问题。"

    read_only = True

    def execute(self, context, arguments=None):
        questions = context.safe_data.get(
            "questions",
            [],
        )

        return ToolResult(
            success=True,
            data=questions,
            tool_name=self.name,
        )


class ProjectResearchDirectionTool(AgentTool):

    name = "project.get_research_directions"

    description = "读取项目当前已经确认的研究方向。"

    read_only = True

    def execute(self, context, arguments=None):
        directions = context.safe_data.get(
            "research_directions",
            [],
        )

        return ToolResult(
            success=True,
            data=directions,
            tool_name=self.name,
        )


class ProjectProgressTool(AgentTool):

    name = "project.get_progress"

    description = "读取项目当前的公开进度信息。"

    read_only = True

    def execute(self, context, arguments=None):
        progress = context.safe_data.get(
            "progress",
            {},
        )

        if not progress:
            progress = {
                "source": "projecthub",
                "available": False,
                "reason": "暂无独立进度数据",
            }

        return ToolResult(
            success=True,
            data=progress,
            tool_name=self.name,
        )


class ProjectPublicMaterialsTool(AgentTool):

    name = "project.get_public_materials"

    description = "读取项目组明确允许 Agent 使用的公开资料。"

    read_only = True

    def execute(self, context, arguments=None):
        materials = context.safe_data.get(
            "public_materials",
            [],
        )

        return ToolResult(
            success=True,
            data=materials,
            tool_name=self.name,
        )


from agent.research import ResearchRetriever


class SearchResearchTool(AgentTool):

    name = "research.search"

    description = "根据当前项目研究方向或关键词，" "检索公开的论文和理论资料。" "返回结果属于外部资料，不属于项目组已确认事实。"

    read_only = True

    def __init__(self):
        super().__init__()
        self.retriever = ResearchRetriever()

    def execute(self, context, arguments=None):

        arguments = arguments or {}

        query = arguments.get(
            "query",
            "",
        )

        keywords = arguments.get(
            "keywords",
            [],
        )

        limit = arguments.get(
            "limit",
            5,
        )

        result = self.retriever.search(
            query=query,
            keywords=keywords,
            limit=limit,
        )

        return ToolResult(
            success=result.get(
                "success",
                False,
            ),
            data=result,
            error=result.get("error"),
            tool_name=self.name,
        )
