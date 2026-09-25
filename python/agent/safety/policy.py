class SafetyPolicy:
    """
    ProjectHub Agent 安全策略。

    这里只定义 Agent 的安全边界，
    不负责具体业务逻辑。
    """

    # 明确禁止的工具类型
    FORBIDDEN_TOOL_PREFIXES = (
        "system.",
        "admin.",
    )

    FORBIDDEN_TOOL_NAMES = {
        "project.delete_data",
        "project.modify_core_data",
        "system.execute_command",
        "system.read_source_code",
        "system.read_env",
        "system.read_credentials",
        "system.read_database",
        "system.read_sessions",
        "system.read_cookies",
        "system.read_files",
        "system.deploy",
        "admin.grant_permission",
        "admin.change_role",
        "admin.change_password",
    }

    # 不允许 Agent 声称自己已经替项目做出的结论
    DECISION_CLAIM_PATTERNS = [
        "最终决定采用",
        "项目最终采用",
        "已经决定采用",
        "必须采用",
        "负责人已经决定",
        "团队已经决定",
        "项目组已经确认",
    ]

    # 敏感信息
    SECRET_PATTERNS = [
        "password",
        "passwd",
        "secret",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "private_key",
        ".env",
        "session",
        "cookie",
    ]

    # 明显危险操作关键词
    DANGEROUS_PATTERNS = [
        "绕过权限",
        "绕过认证",
        "窃取密码",
        "窃取凭证",
        "获取他人账号",
        "删除数据库",
        "破坏服务器",
        "植入木马",
        "恶意攻击",
        "ddos",
        "勒索软件",
        "木马",
        "病毒",
        "忽略之前",
        "忽略以上",
        "ignore previous",
        "system prompt",
        "开发者消息",
        "越狱",
    ]

    @classmethod
    def is_forbidden_tool(cls, tool_name):
        if not isinstance(tool_name, str):
            return True

        if tool_name in cls.FORBIDDEN_TOOL_NAMES:
            return True

        return any(tool_name.startswith(prefix) for prefix in cls.FORBIDDEN_TOOL_PREFIXES)

    @classmethod
    def contains_secret_reference(cls, text):
        if not isinstance(text, str):
            return False

        lowered = text.lower()

        return any(pattern.lower() in lowered for pattern in cls.SECRET_PATTERNS)

    @classmethod
    def contains_dangerous_content(cls, text):
        if not isinstance(text, str):
            return False

        lowered = text.lower()

        return any(pattern.lower() in lowered for pattern in cls.DANGEROUS_PATTERNS)

    @classmethod
    def contains_unauthorized_decision_claim(
        cls,
        text,
    ):
        if not isinstance(text, str):
            return False

        return any(pattern in text for pattern in cls.DECISION_CLAIM_PATTERNS)
