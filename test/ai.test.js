"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const AI = require("../ai");

const topic = {
  title: "校园垃圾分类识别",
  desc: "做一个可以拍照识别垃圾类别的校园项目",
  directions: ["m1", "m3"],
  neededRoles: ["技术成员", "调研成员"],
  vibe: "认真、友好",
  members: [
    { id: "u1", nickname: "张三", tag: "技术成员" },
    { id: "u2", nickname: "李四", tag: "调研成员" }
  ],
  ai: { announcement: { text: "方案A：YOLO 拍照识别" } }
};
const messages = [
  { authorName: "张三", text: "可以用 Python 和 YOLO 先做目标检测，数据先收集 500 张。" },
  { authorName: "李四", text: "我来负责问卷和数据标注规范。" }
];

function responseFor(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content: content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("AI evaluation fixtures obey their expected validation result", () => {
  const evals = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ai-evals.json"), "utf8"));
  for (const item of evals.draft) assert.equal(!!AI.validateDraft(item.input), item.valid, item.name);
  for (const item of evals.directions) assert.equal(!!AI.validateDirections(item.input), item.valid, item.name);
  for (const item of evals.deep) assert.equal(!!AI.validateDeepItems(item.input), item.valid, item.name);
});

test("AI provider adapter accepts valid JSON and retries one malformed response", async () => {
  const originalFetch = global.fetch;
  const queue = [
    "not-json",
    JSON.stringify({ draft: "一、项目定位：校园垃圾分类识别。二、问题：分类效率低。三、功能：拍照识别、结果展示、统计。四、技术：Python、OpenCV、YOLO。五、分工：张三负责模型，李四负责数据。六、里程碑：两周完成原型。七、风险：样本不足。八、待确认：部署设备。" }),
    JSON.stringify({ directions: [{ title: "校园垃圾识别 MVP", desc: "使用 Python、OpenCV 和 YOLO 完成拍照识别、结果展示和统计，先收集 500 张图片。", reason: "范围小且可以快速演示。" }] }),
    JSON.stringify({ items: [{ nickname: "张三", task: "训练 YOLO 模型并交付可运行原型", books: ["《动手学深度学习》"], suggestion: "先跑通小样本训练，再扩充数据。" }, { nickname: "李四", task: "完成数据标注规范并整理调研结论", books: ["《社会研究方法》"], suggestion: "先制定标注验收标准，再安排复核。" }] })
  ];
  global.fetch = async () => responseFor(queue.shift());
  AI.__setActiveConfigForTest({ provider: "mock", label: "Mock", baseUrl: "https://mock.local/v1", apiKey: "x", model: "mock-model", apiStyle: "chat", search: false });
  try {
    const draft = await AI.generateDraft(topic, messages);
    assert.ok(draft.draft.includes("校园垃圾分类"));
    const directions = await AI.generateDirections(topic, messages, draft.draft);
    assert.equal(directions.directions.length, 1);
    const deep = await AI.generateDeepPlan(topic, messages, draft.draft);
    assert.equal(deep.items.length, 2);
    assert.equal(deep.items[0].memberId, "u1");
  } finally {
    global.fetch = originalFetch;
    AI.__resetConfigForTest();
  }
});

test("AI fallback remains usable without an external provider", async () => {
  AI.__setActiveConfigForTest({ provider: "local", label: "本地", baseUrl: "", apiKey: "", model: "", apiStyle: "local", search: false });
  try {
    const draft = await AI.generateDraft(topic, messages);
    const directions = await AI.generateDirections(topic, messages, draft.draft);
    assert.equal(draft.source, "local");
    assert.ok(draft.draft.length > 100);
    assert.ok(directions.directions.length >= 1);
  } finally {
    AI.__resetConfigForTest();
  }
});
