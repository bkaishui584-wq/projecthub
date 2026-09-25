class AgentState:
    PASSIVE = "passive"
    THINKING = "thinking"
    ANALYZING = "analyzing"
    SUGGESTING = "suggesting"
    WAITING = "waiting"

    VALID_STATES = {
        PASSIVE,
        THINKING,
        ANALYZING,
        SUGGESTING,
        WAITING,
    }

    def __init__(self):
        self.state = self.PASSIVE

    def get_state(self):
        return self.state

    def start_thinking(self):
        if self.state not in {self.PASSIVE, self.WAITING}:
            return False
        self.state = self.THINKING
        return True

    def start_analyzing(self):
        if self.state != self.THINKING:
            return False
        self.state = self.ANALYZING
        return True

    def start_suggesting(self):
        if self.state != self.ANALYZING:
            return False
        self.state = self.SUGGESTING
        return True

    def finish(self):
        if self.state != self.SUGGESTING:
            return False
        self.state = self.WAITING
        return True

    def reset(self):
        self.state = self.PASSIVE

    def abort(self):
        self.state = self.WAITING
        return True

    def is_passive(self):
        return self.state == self.PASSIVE

    def is_thinking(self):
        return self.state == self.THINKING

    def is_analyzing(self):
        return self.state == self.ANALYZING

    def is_suggesting(self):
        return self.state == self.SUGGESTING

    def is_waiting(self):
        return self.state == self.WAITING

    def can_process(self):
        return self.state in {
            self.THINKING,
            self.ANALYZING,
            self.SUGGESTING,
        }
