class ResearchDirectionManager:
    """
    项目研究方向管理器。

    负责：
    1. 保存当前正式研究方向
    2. 保存候选研究方向
    3. 保存方向来源
    4. 保存负责人确认状态
    5. 管理方向生命周期
    """

    STATUS_CANDIDATE = "candidate"
    STATUS_ACTIVE = "active"
    STATUS_REJECTED = "rejected"
    STATUS_ARCHIVED = "archived"

    def __init__(self):
        self.directions = []
        self.counter = 0

    # =========================
    # 创建候选方向
    # =========================

    def add_candidate(
        self,
        name,
        description="",
        keywords=None,
        source=None,
    ):
        """
        添加一个候选研究方向。

        注意：
        添加候选方向 ≠ 确认研究方向。
        """

        name = (name or "").strip()

        if not name:
            return None

        # 防止完全相同的方向重复添加
        for direction in self.directions:
            if direction.get("name") == name and direction.get("status") != self.STATUS_REJECTED:
                return None

        self.counter += 1

        direction = {
            "id": f"direction_{self.counter:03d}",
            "name": name,
            "description": (description or "").strip(),
            "keywords": list(dict.fromkeys(keywords or [])),
            "source": source
            or {
                "type": "agent",
                "message_id": None,
                "author": None,
                "authorName": None,
            },
            "status": self.STATUS_CANDIDATE,
            "confirmed_by": None,
            "confirmed_at": None,
        }

        self.directions.append(direction)

        return direction

    # =========================
    # 获取候选方向
    # =========================

    def get_candidates(self):
        return [direction for direction in self.directions if direction.get("status") == self.STATUS_CANDIDATE]

    # =========================
    # 获取正式方向
    # =========================

    def get_active_directions(self):
        return [direction for direction in self.directions if direction.get("status") == self.STATUS_ACTIVE]

    # =========================
    # 获取全部方向
    # =========================

    def get_all(self):
        return self.directions

    # =========================
    # 负责人确认方向
    # =========================

    def confirm_direction(
        self,
        direction_id,
        user_id,
        confirmed_at=None,
    ):
        """
        将候选方向确认成正式研究方向。

        注意：
        实际项目中还需要由 ProjectHub
        服务端权限层确认 user_id
        是否真的具有负责人权限。
        """

        direction = self._find_direction(direction_id)

        if direction is None:
            return False

        if direction.get("status") != self.STATUS_CANDIDATE:
            return False

        direction["status"] = self.STATUS_ACTIVE

        direction["confirmed_by"] = user_id

        direction["confirmed_at"] = confirmed_at

        return True

    # =========================
    # 拒绝候选方向
    # =========================

    def reject_direction(
        self,
        direction_id,
        user_id=None,
    ):
        direction = self._find_direction(direction_id)

        if direction is None:
            return False

        if direction.get("status") != self.STATUS_CANDIDATE:
            return False

        direction["status"] = self.STATUS_REJECTED

        direction["rejected_by"] = user_id

        return True

    # =========================
    # 归档正式方向
    # =========================

    def archive_direction(
        self,
        direction_id,
        user_id=None,
    ):
        direction = self._find_direction(direction_id)

        if direction is None:
            return False

        if direction.get("status") != self.STATUS_ACTIVE:
            return False

        direction["status"] = self.STATUS_ARCHIVED

        direction["archived_by"] = user_id

        return True

    # =========================
    # 查找方向
    # =========================

    def get_direction(
        self,
        direction_id,
    ):
        return self._find_direction(direction_id)

    def _find_direction(
        self,
        direction_id,
    ):
        for direction in self.directions:

            if direction.get("id") == direction_id:
                return direction

        return None

    # =========================
    # 清空
    # =========================

    def clear(self):
        self.directions = []
        self.counter = 0
