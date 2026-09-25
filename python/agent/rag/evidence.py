from agent.evidence import EvidenceManager


class RAGEvidenceBuilder:
    """
    将 RAG 检索结果转换为 Evidence。

    所有 RAG 结果默认属于 external，
    不允许被识别为 project fact。
    """

    def __init__(
        self,
        evidence_manager=None,
    ):
        self.evidence = evidence_manager or EvidenceManager()

    def build(
        self,
        rag_result,
    ):
        if not isinstance(
            rag_result,
            dict,
        ):
            return []

        if not rag_result.get(
            "success",
            False,
        ):
            return []

        evidence_items = []

        for result in rag_result.get(
            "results",
            [],
        ):
            evidence = self.evidence.add(
                evidence_type=(EvidenceManager.TYPE_RAG),
                content=result.get(
                    "content",
                    "",
                ),
                source_id=result.get("chunk_id"),
                source_name=result.get("title"),
                source_category=(EvidenceManager.SOURCE_EXTERNAL),
                metadata={
                    "document_id": result.get("document_id"),
                    "url": result.get("url"),
                    "authors": result.get(
                        "authors",
                        [],
                    ),
                    "year": result.get("year"),
                    "score": result.get(
                        "score",
                        0,
                    ),
                    "keywords": result.get(
                        "keywords",
                        [],
                    ),
                },
            )

            if evidence:
                evidence_items.append(evidence)

        return evidence_items
