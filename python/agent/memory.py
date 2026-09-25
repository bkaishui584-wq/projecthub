{"facts": [], "decisions": [], "opinions": [], "uncertain": [], "open_questions": [], "keywords": [], "conflicts": []}


class ProjectMemory:
    def __init__(self):
        self.data = {
            "facts": [],
            "decisions": [],
            "opinions": [],
            "uncertain": [],
            "open_questions": [],
            "keywords": [],
            "conflicts": [],
        }

    def get(self):
        return self.data

    def add_fact(self, item):
        self.data["facts"].append(item)

    def add_decision(self, item):
        self.data["decisions"].append(item)

    def add_opinion(self, item):
        self.data["opinions"].append(item)

    def add_uncertain(self, item):
        self.data["uncertain"].append(item)

    def add_keyword(self, keyword):
        if keyword not in self.data["keywords"]:
            self.data["keywords"].append(keyword)

    def add_question(self, question):
        if question not in self.data["open_questions"]:
            self.data["open_questions"].append(question)

    def add_conflict(self, conflict):
        self.data["conflicts"].append(conflict)

    def update_from_discussion(self, discussion):
        for item in discussion.get("facts", []):
            self.add_fact(item)

        for item in discussion.get("decisions", []):
            self.add_decision(item)

        for item in discussion.get("opinions", []):
            self.add_opinion(item)

        for item in discussion.get("uncertain", []):
            self.add_uncertain(item)

        for keyword in discussion.get("keywords", []):
            self.add_keyword(keyword)

    def clear(self):
        self.data = {
            "facts": [],
            "decisions": [],
            "opinions": [],
            "uncertain": [],
            "open_questions": [],
            "keywords": [],
            "conflicts": [],
        }
