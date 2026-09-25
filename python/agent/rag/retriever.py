from __future__ import annotations

from typing import Any

from agent.rag.chunker import TextChunker
from agent.rag.index import RAGIndex


class RAGRetriever:
    """
    ProjectHub Agent 研究资料检索器。

    当前使用轻量级关键词索引。
    后续可以替换为向量数据库，但上层接口保持不变。
    """

    SOURCE_CATEGORY = "external"

    def __init__(
        self,
        chunker: TextChunker | None = None,
        index: RAGIndex | None = None,
    ):
        self.chunker = chunker or TextChunker()

        self.index = index or RAGIndex()

        self.documents: dict[
            str,
            dict[str, Any],
        ] = {}

    # =========================================================
    # 添加资料
    # =========================================================

    def add_document(
        self,
        document: dict[str, Any],
    ) -> dict[str, Any]:

        document_id = str(document.get("id") or "")

        if not document_id:
            return {
                "success": False,
                "error": "资料缺少 id",
            }

        title = str(document.get("title") or document.get("name") or "").strip()

        content = str(document.get("content") or "").strip()

        if not content:
            return {
                "success": False,
                "error": "资料没有可检索内容",
            }

        safe_document = {
            "id": document_id,
            "title": title,
            "content": content,
            "source": document.get("source"),
            "url": document.get("url"),
            "authors": document.get(
                "authors",
                [],
            ),
            "year": document.get("year"),
            "type": document.get(
                "type",
                "document",
            ),
            "source_category": (self.SOURCE_CATEGORY),
        }

        self.documents[document_id] = safe_document

        chunks = self.chunker.split(content)

        for index, chunk in enumerate(chunks):

            self.index.add_chunk(
                {
                    "id": (f"{document_id}_" f"{index}"),
                    "chunk_id": (f"{document_id}_" f"{index}"),
                    "document_id": (document_id),
                    "text": chunk,
                    "content": chunk,
                    "title": title,
                    "source": safe_document.get("source"),
                    "url": safe_document.get("url"),
                    "authors": safe_document.get(
                        "authors",
                        [],
                    ),
                    "year": safe_document.get("year"),
                    "keywords": [],
                    "source_category": (self.SOURCE_CATEGORY),
                    "evidence_type": "external",
                }
            )

        return {
            "success": True,
            "document_id": document_id,
            "chunks": len(chunks),
        }

    # =========================================================
    # 批量添加
    # =========================================================

    def add_documents(
        self,
        documents: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:

        return [self.add_document(document) for document in documents]

    # =========================================================
    # 搜索
    # =========================================================

    def search(
        self,
        query: str,
        limit: int = 8,
    ) -> dict[str, Any]:

        query = str(query or "").strip()

        if not query:
            return {
                "success": True,
                "query": "",
                "results": [],
                "source_category": (self.SOURCE_CATEGORY),
            }

        results = self.index.search(
            query=query,
            limit=limit,
        )

        normalized = []

        for result in results:

            normalized.append(
                {
                    "id": result.get("id"),
                    "chunk_id": result.get("chunk_id") or result.get("id"),
                    "document_id": result.get("document_id"),
                    "title": result.get("title"),
                    "text": result.get("text"),
                    "content": result.get("content") or result.get("text"),
                    "source": result.get("source"),
                    "url": result.get("url"),
                    "authors": result.get(
                        "authors",
                        [],
                    ),
                    "year": result.get("year"),
                    "source_category": (self.SOURCE_CATEGORY),
                    "evidence_type": ("external"),
                }
            )

        return {
            "success": True,
            "query": query,
            "results": normalized,
            "source_category": (self.SOURCE_CATEGORY),
        }

    # =========================================================
    # 获取资料
    # =========================================================

    def get_document(
        self,
        document_id: str,
    ) -> dict[str, Any] | None:

        return self.documents.get(str(document_id))

    def get_documents(self):

        return list(self.documents.values())

    # =========================================================
    # 清空
    # =========================================================

    def clear(self):

        self.documents.clear()

        self.index.clear()
