class ToolPolicy:

    SAFE_READ_ONLY_TOOLS = {
        "project.get_info",
        "project.get_discussion",
        "project.get_decisions",
        "project.get_questions",
        "project.get_research_directions",
        "project.get_progress",
        "project.get_public_materials",
        "research.search",
        "research.rag_search",
    }

    FORBIDDEN_TOOLS = {
        "system.read_source_code",
        "system.read_env",
        "system.read_credentials",
        "system.read_database",
        "system.read_sessions",
        "system.read_cookies",
        "system.read_files",
        "system.execute_command",
        "system.deploy",
        "admin.grant_permission",
        "admin.change_role",
        "admin.change_password",
        "project.delete_data",
        "project.modify_core_data",
    }

    @classmethod
    def is_allowed(
        cls,
        tool_name,
    ):
        if tool_name in cls.FORBIDDEN_TOOLS:
            return False

        return tool_name in cls.SAFE_READ_ONLY_TOOLS

    @classmethod
    def is_forbidden(
        cls,
        tool_name,
    ):
        if not isinstance(tool_name, str):
            return True
        if tool_name in cls.FORBIDDEN_TOOLS:
            return True
        return tool_name.startswith(("system.", "admin."))
