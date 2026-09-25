from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class RAGDocument:
    """
    RAG 文档。

    用于保存：
    - 论文
    - 理论资料
    - 项目公开资料
    - 其他允许 Agent 使用的研究资料
    """

    document_id: str
    title: str
    content: str

    source_type: str = "unknown"
    url: Optional[str] = None

    authors: List[str] = field(default_factory=list)
    year: Optional[int] = None

    keywords: List[str] = field(default_factory=list)

    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self):
        return {
            "document_id": self.document_id,
            "title": self.title,
            "content": self.content,
            "source_type": self.source_type,
            "url": self.url,
            "authors": self.authors,
            "year": self.year,
            "keywords": self.keywords,
            "metadata": self.metadata,
        }
