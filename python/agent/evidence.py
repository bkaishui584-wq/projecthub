from datetime import datetime, timezone


class EvidenceManager:
    TYPE_MESSAGE = "message"
    TYPE_DECISION = "decision"
    TYPE_FACT = "fact"
    TYPE_DIRECTION = "direction"
    TYPE_QUESTION = "question"
    TYPE_PAPER = "paper"
    TYPE_RAG = "rag"

    SOURCE_PROJECT = "project"
    SOURCE_EXTERNAL = "external"
    SOURCE_MODEL = "model"

    def __init__(self):
        self.evidence = []
        self.counter = 0

    def add(
        self,
        evidence_type,
        content,
        source_id=None,
        source_name=None,
        metadata=None,
        source_category=None,
    ):
        content = (content or "").strip()

        if not content:
            return None

        if source_category is None:
            source_category = self._infer_source_category(evidence_type)

        self.counter += 1

        item = {
            "id": f"evidence_{self.counter:03d}",
            "type": evidence_type,
            "content": content,
            "source_id": source_id,
            "source_name": source_name,
            "source_category": source_category,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }

        self.evidence.append(item)

        return item

    def _infer_source_category(
        self,
        evidence_type,
    ):
        project_types = {
            self.TYPE_MESSAGE,
            self.TYPE_DECISION,
            self.TYPE_FACT,
            self.TYPE_DIRECTION,
            self.TYPE_QUESTION,
        }

        external_types = {
            self.TYPE_PAPER,
            self.TYPE_RAG,
        }

        if evidence_type in project_types:
            return self.SOURCE_PROJECT

        if evidence_type in external_types:
            return self.SOURCE_EXTERNAL

        return self.SOURCE_MODEL

    def get_all(self):
        return self.evidence

    def get(self, evidence_id):
        for item in self.evidence:
            if item.get("id") == evidence_id:
                return item

        return None

    def get_by_type(self, evidence_type):
        return [item for item in self.evidence if item.get("type") == evidence_type]

    def get_by_category(self, source_category):
        return [item for item in self.evidence if item.get("source_category") == source_category]

    def get_project_evidence(self):
        return self.get_by_category(self.SOURCE_PROJECT)

    def get_external_evidence(self):
        return self.get_by_category(self.SOURCE_EXTERNAL)

    def get_model_evidence(self):
        return self.get_by_category(self.SOURCE_MODEL)

    def clear(self):
        self.evidence = []
        self.counter = 0
