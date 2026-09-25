from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class ResearchSource:
    """
    外部研究资料。

    外部资料永远与项目组内部信息分开保存。
    """

    source_type: str
    title: str
    url: Optional[str] = None
    authors: list = field(default_factory=list)
    year: Optional[int] = None
    abstract: str = ""
    keywords: list = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self):
        return {
            "source_type": self.source_type,
            "title": self.title,
            "url": self.url,
            "authors": self.authors,
            "year": self.year,
            "abstract": self.abstract,
            "keywords": self.keywords,
            "metadata": self.metadata,
        }
