from agent.research.source import ResearchSource


class PaperRecord(ResearchSource):
    """
    论文资料记录。
    """

    def __init__(
        self,
        title,
        authors=None,
        year=None,
        url=None,
        abstract="",
        keywords=None,
        metadata=None,
    ):
        super().__init__(
            source_type="paper",
            title=title,
            url=url,
            authors=authors or [],
            year=year,
            abstract=abstract,
            keywords=keywords or [],
            metadata=metadata or {},
        )
