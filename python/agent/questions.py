class OpenQuestionManager:
    def __init__(self):
        self.questions = []
        self.counter = 0
        self.message_ids = set()

    def add_question(self, item):
        """
        添加一个开放问题。

        item 预期包含：
        content
        message_id
        author
        authorName
        time
        keywords
        """

        message_id = item.get("message_id")

        # 防止同一条消息被重复加入
        if message_id and message_id in self.message_ids:
            return None

        content = item.get("content", "").strip()

        if not content:
            return None

        self.counter += 1

        question = {
            "id": f"question_{self.counter:03d}",
            "content": content,
            "source": {
                "message_id": message_id,
                "author": item.get("author"),
                "authorName": item.get("authorName"),
                "time": item.get("time"),
            },
            "status": "open",
            "related_keywords": list(dict.fromkeys(item.get("keywords", []))),
        }

        self.questions.append(question)

        if message_id:
            self.message_ids.add(message_id)

        return question

    def get_open_questions(self):
        """
        获取当前仍然开放的问题。
        """

        return [question for question in self.questions if question.get("status") == "open"]

    def get_all(self):
        """
        获取所有问题。
        """

        return self.questions

    def resolve_question(self, question_id):
        """
        将问题标记为已解决。
        """

        question = self._find_question(question_id)

        if question is None:
            return False

        question["status"] = "resolved"

        return True

    def dismiss_question(self, question_id):
        """
        将问题标记为暂不处理/忽略。
        """

        question = self._find_question(question_id)

        if question is None:
            return False

        question["status"] = "dismissed"

        return True

    def reopen_question(self, question_id):
        """
        重新打开已经解决或忽略的问题。
        """

        question = self._find_question(question_id)

        if question is None:
            return False

        question["status"] = "open"

        return True

    def _find_question(self, question_id):
        for question in self.questions:
            if question.get("id") == question_id:
                return question

        return None

    def clear(self):
        """
        清空所有问题。
        """

        self.questions = []
        self.counter = 0
        self.message_ids = set()
