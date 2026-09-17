# ProjectHub V2 测试报告

测试日期：2026-09-17

## 已执行

```text
node --check server.js
node --check ai.js
node --check security.js
node --check storage.js
node --check script.js
npm test
npm audit --omit=dev
git diff --check
```

## 结果

- 语法检查：通过。
- 自动化测试：10 项全部通过。
- npm audit：0 个已知漏洞。
- git diff --check：通过（仅有 Windows 换行提示，没有空白错误）。

## 测试覆盖

- JSON 文件持久化、备份、恢复读取和文件键防穿越。
- PostgreSQL 状态和文件 Blob 的参数化读写（mock pool）。
- 空数据库首次导入旧 JSON。
- 生产环境拒绝隐式文件存储。
- 公开话题不泄露完整 AI 对象。
- 私密项目元数据投影。
- 消息作者撤回与负责人越权拒绝。
- 申请重复、取消、冷却和重新申请。
- 普通用户无法访问管理员 API。
- 非成员无法查看其他项目消息和文件。
- 管理员密码轮换后旧密码失败、新密码成功。
- 消息作者可编辑自己的消息，负责人编辑他人消息被拒绝。
- 模拟实例重启后，临时文件后端仍能读取已创建的项目数据。
- 真实 Chrome CDP 在约 390px 宽度验证首页与身份选择弹窗，`scrollWidth === innerWidth`，未出现横向溢出。

## 未完成验证

真实 PostgreSQL 集成迁移、320/375 以下的真机浏览器、真实多实例并发、真实文件杀毒和外部备份灾备演练尚未执行。

在真实 PostgreSQL 和生产 Secret 配置完成前，不能声称 Phase 9/10 已上线完成。


## 生产验收

- Render 正式网址可用。
- 最新提交已成功部署。
- PostgreSQL 健康检查通过，存储驱动为 `postgres`。
- 重新部署后线上仍有 2 个项目，项目和消息未丢失。
- 管理员新密码已同步到数据库并验证登录成功。
- 免费 PostgreSQL 到期日为 2026-10-17。
