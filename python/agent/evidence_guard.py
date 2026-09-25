from __future__ import annotations

import json
import re
from typing import Any


class EvidenceGuard:
    """
    Agent 输出证据约束层。

    目标：
    1. 区分项目事实、外部资料、Agent 推断。
    2. 检查重要结论是否存在来源。
    3. 阻止 Agent 把推测说成已经确定的事实。
    4. 不允许虚构论文、项目决定或实验结果。
    """

    FACT_TYPES = {
        "project",
        "discussion",
        "decision",
        "question",
        "direction",
        "progress",
        "material",
    }

    EXTERNAL_TYPES = {
        "paper",
        "research",
        "external",
        "rag",
    }

    INFERENCE_TYPES = {
        "inference",
        "suggestion",
        "hypothesis",
        "recommendation",
    }

    HIGH_RISK_PATTERNS = [
        r"已经确定",
        r"已经决定",
        r"项目组决定",
        r"项目组确认",
        r"负责人决定",
        r"负责人确认",
        r"实验已经证明",
        r"研究已经证明",
        r"论文证明",
        r"一定可以",
        r"一定能够",
        r"必然",
        r"肯定可以",
        r"毫无疑问",
    ]

    PAPER_PATTERNS = [
        r"论文《(.+?)》",
        r"论文\s*[\"“](.+?)[\"”]",
        r"作者\s*[:：]\s*(.+)",
        r"DOI\s*[:：]\s*(.+)",
    ]

    def __init__(self):
        self.blocked_count = 0
        self.warning_count = 0

    def normalize_evidence(
        self,
        evidence: Any,
    ) -> dict[str, Any]:
        if not isinstance(evidence, dict):
            return {
                "type": "unknown",
                "source": None,
                "content": "",
                "verified": False,
            }

        evidence_type = str(evidence.get("type") or evidence.get("source_type") or "unknown").lower()

        content = str(evidence.get("content") or evidence.get("text") or "").strip()

        source = evidence.get("source") or evidence.get("source_id") or evidence.get("message_id")

        verified = bool(evidence.get("verified", evidence_type in self.FACT_TYPES))

        return {
            **evidence,
            "type": evidence_type,
            "source": source,
            "content": content,
            "verified": verified,
        }

    def build_evidence_map(
        self,
        evidence_items: list[Any],
    ) -> list[dict[str, Any]]:
        result = []

        for item in evidence_items:
            normalized = self.normalize_evidence(item)

            if not normalized["content"]:
                continue

            result.append(normalized)

        return result

    def has_supporting_evidence(
        self,
        text: str,
        evidence_items: list[dict[str, Any]],
    ) -> bool:
        if not text.strip():
            return False

        text_lower = text.lower()

        for evidence in evidence_items:
            content = str(evidence.get("content") or "").lower()

            if not content:
                continue

            keywords = self._keywords(text_lower)

            if not keywords:
                continue

            matched = sum(1 for keyword in keywords if keyword in content)

            if matched >= min(2, len(keywords)):
                return True

        return False

    def _keywords(
        self,
        text: str,
    ) -> list[str]:
        words = re.findall(
            r"[\u4e00-\u9fff]{2,8}|" r"[A-Za-z][A-Za-z0-9_+\-]{2,}",
            text,
        )

        stop_words = {
            "项目",
            "目前",
            "这个",
            "可以",
            "可能",
            "建议",
            "我们",
            "应该",
            "进行",
            "相关",
            "问题",
            "方向",
            "内容",
        }

        result = []

        for word in words:
            if word in stop_words:
                continue

            if word not in result:
                result.append(word)

        return result[:12]

    def detect_unverified_claims(
        self,
        text: str,
    ) -> list[str]:
        warnings = []

        if not isinstance(text, str):
            return warnings

        for pattern in self.HIGH_RISK_PATTERNS:
            if re.search(pattern, text):
                warnings.append(f"发现未经证据支持的确定性表达：{pattern}")

        return warnings

    def detect_possible_fake_paper(
        self,
        text: str,
        evidence_items: list[dict[str, Any]],
    ) -> list[str]:
        warnings = []

        if not isinstance(text, str):
            return warnings

        paper_related = "论文" in text or "paper" in text.lower() or "doi" in text.lower()

        if not paper_related:
            return warnings

        external_sources = [item for item in evidence_items if item.get("type") in self.EXTERNAL_TYPES]

        if not external_sources:
            return ["回答提到了论文或研究资料，但当前没有对应的外部证据来源。"]

        corpus = json.dumps(external_sources, ensure_ascii=False).lower()
        claims = []

        for pattern in self.PAPER_PATTERNS:
            for match in re.findall(pattern, text):
                claim = str(match).strip()
                if claim:
                    claims.append(claim)

        for claim in dict.fromkeys(claims):
            if claim.lower() not in corpus:
                warnings.append(f"外部证据中无法核验引用信息：{claim}")

        return warnings

    def validate_text(
        self,
        text: str,
        evidence_items: list[dict[str, Any]],
    ) -> dict[str, Any]:
        warnings = []

        warnings.extend(self.detect_unverified_claims(text))

        warnings.extend(
            self.detect_possible_fake_paper(
                text,
                evidence_items,
            )
        )

        supported = self.has_supporting_evidence(
            text,
            evidence_items,
        )

        if warnings:
            self.warning_count += len(warnings)

        return {
            "safe": not warnings,
            "supported": supported,
            "warnings": warnings,
        }

    def sanitize_text(
        self,
        text: str,
        evidence_items: list[dict[str, Any]],
    ) -> str:
        if not isinstance(text, str):
            return ""

        result = text

        replacements = {
            "已经确定": "目前记录显示",
            "已经决定": "目前讨论中曾提出",
            "项目组决定": "项目讨论曾提出",
            "负责人决定": "负责人相关讨论曾提出",
            "实验已经证明": "现有记录显示相关实验结果",
            "研究已经证明": "相关资料可能支持",
            "一定可以": "可能可以",
            "一定能够": "可能能够",
            "一定可行": "可能可行",
            "必然": "可能",
            "肯定可以": "可能可以",
            "毫无疑问": "目前证据不足以确认",
        }

        for old, new in replacements.items():
            result = result.replace(
                old,
                new,
            )

        paper_warnings = self.detect_possible_fake_paper(
            result,
            evidence_items,
        )

        if paper_warnings:
            result += "\n\n【资料核验提醒】\n" "以上回答涉及研究资料，但当前上下文中" "没有足够的外部来源信息。请在引用前进行核验。"

        return result

    def validate(self, result: Any, evidence_items: list[Any] | None = None) -> dict[str, Any]:
        return self.validate_result(result, evidence_items)

    def validate_result(
        self,
        result: Any,
        evidence_items: list[Any] | None = None,
    ) -> dict[str, Any]:
        evidence = self.build_evidence_map(evidence_items or [])
        validations = []

        def walk(value, path):
            if isinstance(value, str):
                validation = self.validate_text(value, evidence)
                safe_value = self.sanitize_text(value, evidence)
                validations.append({"path": path, **validation})
                return safe_value

            if isinstance(value, list):
                return [walk(item, f"{path}[{index}]") for index, item in enumerate(value)]

            if isinstance(value, dict):
                return {key: walk(item, f"{path}.{key}") for key, item in value.items()}

            return value

        safe_result = walk(result, "result")

        return {
            "result": safe_result,
            "validation": validations,
            "evidence_count": len(evidence),
        }
