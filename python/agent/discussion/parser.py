import re


def clean_text(text):
    if not isinstance(text, str):
        return ""

    text = text.strip()

    text = re.sub(r"\s+", " ", text)

    return text


def extract_keywords(text):

    keywords = []

    patterns = [
        r"ROS2",
        r"ROS",
        r"Python",
        r"C\+\+",
        r"机器学习",
        r"深度学习",
        r"计算机视觉",
        r"视觉导航",
        r"SLAM",
        r"机器人",
        r"人工智能",
    ]

    for pattern in patterns:

        if re.search(pattern, text, re.IGNORECASE):
            keywords.append(pattern.replace(r"\+\+", "++"))

    return list(dict.fromkeys(keywords))


def detect_negation(sentence):

    negation_patterns = [
        r"(?<!不)不要",
        r"不能",
        r"无需",
        r"不再",
        r"暂不",
        r"暂时不",
        r"禁止",
        r"没有",
        r"并非",
    ]

    for pattern in negation_patterns:

        if re.search(pattern, sentence):
            return True

    return False


def detect_question(sentence):

    question_words = [
        "是否",
        "有没有",
        "能否",
        "如何",
        "怎么",
        "哪个",
        "哪些",
        "为什么",
        "需不需要",
        "要不要",
        "是否需要",
    ]

    # 明确问句
    if sentence.endswith(("?", "？")):
        return True

    # 常见疑问表达
    for word in question_words:

        if word in sentence:
            return True

    return False


def classify_sentence(sentence):

    sentence = sentence.strip()

    if not sentence:

        return {
            "type": "empty",
            "content": "",
            "confidence": 0,
            "keywords": [],
            "negated": False,
            "is_question": False,
        }

    decision_words = [
        "决定",
        "确定",
        "确认",
        "最终采用",
        "正式采用",
        "已经确定",
    ]

    opinion_words = [
        "我觉得",
        "我认为",
        "我建议",
        "感觉",
        "在我看来",
        "建议",
    ]

    uncertain_words = [
        "可能",
        "也许",
        "可以考虑",
        "暂时",
        "还没确定",
        "是否",
        "有待讨论",
        "不确定",
    ]

    is_question = detect_question(sentence)

    negated = detect_negation(sentence)

    if any(word in sentence for word in decision_words):

        info_type = "decision"
        confidence = 0.90

    elif any(word in sentence for word in uncertain_words):

        info_type = "uncertain"
        confidence = 0.85

    elif any(word in sentence for word in opinion_words):

        info_type = "opinion"
        confidence = 0.85

    else:

        info_type = "fact"
        confidence = 0.60

    return {
        "type": info_type,
        "content": sentence,
        "keywords": extract_keywords(sentence),
        "confidence": confidence,
        "negated": negated,
        "is_question": is_question,
    }


def parse_discussion(text):

    text = clean_text(text)

    sentences = re.split(r"[。！？!?；;]", text)

    result = {
        "keywords": [],
        "facts": [],
        "opinions": [],
        "decisions": [],
        "uncertain": [],
    }

    for sentence in sentences:

        sentence = sentence.strip()

        if not sentence:
            continue

        item = classify_sentence(sentence)

        if item["type"] == "fact":

            result["facts"].append(item)

        elif item["type"] == "opinion":

            result["opinions"].append(item)

        elif item["type"] == "decision":

            result["decisions"].append(item)

        elif item["type"] == "uncertain":

            result["uncertain"].append(item)

        result["keywords"].extend(item["keywords"])

    result["keywords"] = list(dict.fromkeys(result["keywords"]))

    return result


def parse_messages(messages):

    result = {
        "keywords": [],
        "facts": [],
        "opinions": [],
        "decisions": [],
        "uncertain": [],
    }

    for message in messages:

        # 撤回消息不进入 Agent
        if message.get("recalled"):
            continue

        text = clean_text(message.get("text", ""))

        if not text:
            continue

        sentences = re.split(r"[。！？!?；;]", text)

        for sentence in sentences:

            sentence = sentence.strip()

            if not sentence:
                continue

            item = classify_sentence(sentence)

            # 保存消息来源
            item["author"] = message.get("author")

            item["authorName"] = message.get("authorName")

            item["message_id"] = message.get("id")

            item["time"] = message.get("time")

            result["keywords"].extend(item["keywords"])

            if item["type"] == "fact":

                result["facts"].append(item)

            elif item["type"] == "opinion":

                result["opinions"].append(item)

            elif item["type"] == "decision":

                result["decisions"].append(item)

            elif item["type"] == "uncertain":

                result["uncertain"].append(item)

    result["keywords"] = list(dict.fromkeys(result["keywords"]))

    return result
