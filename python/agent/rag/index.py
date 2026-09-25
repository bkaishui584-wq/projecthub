import math
import re


class RAGIndex:
    """
    轻量 RAG 索引。

    当前阶段：
    - 不使用外部数据库
    - 不使用向量数据库
    - 使用关键词匹配
    - 为后续 Embedding 检索保留接口
    """

    def __init__(self):
        self.chunks = []

    def clear(self):
        self.chunks = []

    def add_chunk(self, chunk):
        if not isinstance(chunk, dict):
            return False

        content = (chunk.get("content") or "").strip()

        if not content:
            return False

        self.chunks.append(chunk)

        return True

    def add_chunks(self, chunks):
        count = 0

        for chunk in chunks:
            if self.add_chunk(chunk):
                count += 1

        return count

    def _tokenize(self, text):
        if not isinstance(text, str):
            return []

        text = text.lower()

        tokens = re.findall(
            r"[\u4e00-\u9fff]|[a-zA-Z0-9_+#.-]+",
            text,
        )

        return tokens

    def _score(self, query, chunk):
        query_tokens = set(self._tokenize(query))

        if not query_tokens:
            return 0.0

        content = " ".join(
            [
                chunk.get("title", ""),
                chunk.get("content", ""),
                " ".join(chunk.get("keywords", [])),
            ]
        )

        content_tokens = set(self._tokenize(content))

        if not content_tokens:
            return 0.0

        matched = query_tokens & content_tokens

        if not matched:
            return 0.0

        score = len(matched) / math.sqrt(len(query_tokens) * len(content_tokens))

        return round(score, 6)

    def search(
        self,
        query,
        limit=5,
    ):
        query = (query or "").strip()

        if not query:
            return []

        limit = max(
            int(limit),
            1,
        )

        scored = []

        for chunk in self.chunks:

            score = self._score(
                query,
                chunk,
            )

            if score <= 0:
                continue

            item = dict(chunk)

            item["score"] = score

            scored.append(item)

        scored.sort(
            key=lambda item: item["score"],
            reverse=True,
        )

        return scored[:limit]

    def size(self):
        return len(self.chunks)
