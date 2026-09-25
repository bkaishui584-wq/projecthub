from agent.research.paper import PaperRecord


class ResearchRetriever:
    """
    外部研究资料检索器。

    当前阶段只定义接口和结果规范。

    不直接：
    - 修改项目
    - 修改项目决策
    - 修改研究方向
    - 执行系统命令
    - 访问敏感文件
    """

    MAX_RESULTS = 10

    def __init__(self):
        self.sources = []

    def search(
        self,
        query,
        keywords=None,
        limit=5,
    ):
        """
        当前阶段只返回安全的检索接口结果。

        真正接入论文数据库/API将在后续实现。
        """

        query = (query or "").strip()

        if not query:
            return {
                "success": False,
                "error": "Search query is empty",
                "results": [],
            }

        limit = min(
            max(int(limit), 1),
            self.MAX_RESULTS,
        )

        return {
            "success": True,
            "query": query,
            "keywords": keywords or [],
            "limit": limit,
            "results": [],
            "source_category": "external",
            "evidence_type": "external",
            "message": ("Research provider is not connected yet."),
        }

    def add_source(self, source):
        """
        保存已经明确获得的外部资料。

        这里只保存资料，
        不把资料转换成项目事实。
        """

        if not isinstance(
            source,
            PaperRecord,
        ):
            raise TypeError("source must be PaperRecord")

        self.sources.append(source)

        return source.to_dict()

    def get_sources(self):
        return [source.to_dict() for source in self.sources]

    def clear(self):
        self.sources = []
