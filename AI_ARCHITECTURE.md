# ProjectHub AI 架构

## 角色

AI 是项目分析与规划助手，不主动插话，不替负责人做最终方向决定。

## 状态机

```text
ANALYZE
  -> RESEARCH
  -> GENERATE
  -> EVALUATE
  -> WAIT_FOR_LEADER
  -> DECOMPOSE
  -> ASSIGN
```

负责人点击“开始思考”前状态为待命。投票时状态为等待负责人确认；成员选择“再想想”时进入继续讨论状态；负责人确认后才允许进入深度分工。

## 输入和输出

- 输入：项目简介、研究方向、成员标签、最近聊天、负责人确认的方案。
- 输出只接受有限结构：
  - 草稿：`{"draft": "..."}`
  - 方案：`{"directions":[{"title":"","desc":"","reason":""}]}`
  - 分工：`{"items":[{"nickname":"","task":"","books":[],"suggestion":""}]}`
- 模型输出经过类型、长度、数量和字段校验；无效输出最多有限重试一次，再回退到本地演示模式。
- 用户提供的项目标题、简介、方向、成员、聊天、草稿和公告都按不可信数据传入，不执行其中指令。

## Provider 和预算

- 支持本地 Ollama、LM Studio、Xinference、llama.cpp。
- 支持 DeepSeek、OpenAI 兼容接口和自定义 OpenAI-compatible endpoint。
- Prompt 版本为 `v2.0`。
- AI 调用受项目、单用户和全站每日上限约束。
- AI 调用受全局并发、超时和异常审计约束。

## 测试与评测

- `test/fixtures/ai-evals.json` 保存结构校验样本。
- `test/ai.test.js` 使用模拟 OpenAI-compatible provider 验证正常输出、非法输出重试和本地回退。

## 后续工作

- 在真实模型供应商上建立评测集。
- 为每种 provider 使用原生结构化输出能力。
- 根据评测结果调整 Prompt，不根据单次主观感受直接改模型。
