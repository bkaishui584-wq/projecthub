import re


class TextChunker:
    """
    RAG 文本切分器。

    将长文本切分成适合检索的小片段。
    """

    def __init__(
        self,
        chunk_size=500,
        overlap=80,
    ):
        self.chunk_size = max(
            int(chunk_size),
            100,
        )

        self.overlap = max(
            int(overlap),
            0,
        )

        if self.overlap >= self.chunk_size:
            self.overlap = self.chunk_size // 4

    def split(self, text):
        if not isinstance(text, str):
            return []

        text = text.strip()

        if not text:
            return []

        text = re.sub(
            r"\s+",
            " ",
            text,
        )

        if len(text) <= self.chunk_size:
            return [text]

        chunks = []

        start = 0
        text_length = len(text)

        while start < text_length:

            end = min(
                start + self.chunk_size,
                text_length,
            )

            chunk = text[start:end].strip()

            if chunk:
                chunks.append(chunk)

            if end >= text_length:
                break

            start = max(
                end - self.overlap,
                start + 1,
            )

        return chunks

    def split_document(self, document):
        chunks = self.split(document.content)

        results = []

        for index, content in enumerate(chunks):

            results.append(
                {
                    "chunk_id": (f"{document.document_id}" f"_chunk_{index + 1:03d}"),
                    "document_id": document.document_id,
                    "title": document.title,
                    "content": content,
                    "source_type": document.source_type,
                    "url": document.url,
                    "authors": document.authors,
                    "year": document.year,
                    "keywords": document.keywords,
                    "chunk_index": index,
                }
            )

        return results
