SYSTEM_ADMIN = "system_admin"
PROJECT_LEADER = "project_leader"
PROJECT_MEMBER = "project_member"


class AgentPermission:

    def __init__(self, user_role, project_id=None):
        self.user_role = user_role
        self.project_id = project_id

    def can_control_project(self, project_id):

        if self.user_role == SYSTEM_ADMIN:
            return True

        if self.user_role == PROJECT_LEADER:
            return self.project_id == project_id

        return False

    def can_start_thinking(self, project_id):

        return self.can_control_project(project_id)
