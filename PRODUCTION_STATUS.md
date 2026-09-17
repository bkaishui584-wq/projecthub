# ProjectHub Production Status

- 正式网址：https://projecthub-7ul0.onrender.com
- Git 分支：`main`
- 最近成功部署提交：`1151de1`
- Web Service：Docker / Render / Oregon
- 数据库：Render PostgreSQL / Oregon / Free
- 存储驱动：`postgres`
- 持久化状态：已启用
- 健康检查：通过
- 管理员新密码：已与数据库同步，验证登录返回 200
- 线上数据：2 个用户、2 个项目、3 条消息、1 条申请
- 重启验收：连续两次重启后，2 个项目仍存在，未再发生旧实例覆盖新数据

## 需要注意

Render 免费 PostgreSQL 的到期日为 **2026-10-17**。到期前需要在 Render 控制台升级数据库计算方案，否则数据库会停止或删除。

生产管理员密码只保存在 Render Secret 和数据库哈希中，不写入代码、Git、README 或 ZIP。
