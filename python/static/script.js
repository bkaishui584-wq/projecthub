(function () {
  "use strict";


  /* ================= 常量 ================= */
  const MAJORS = [
    { id: "m1", label: "计算机科学与技术", icon: "laptop" },
    { id: "m2", label: "软件工程", icon: "puzzle-piece" },
    { id: "m3", label: "人工智能", icon: "robot" },
    { id: "m4", label: "数据科学与大数据技术", icon: "bar-chart" },
    { id: "m5", label: "电子信息工程", icon: "satellite-antenna" },
    { id: "m6", label: "通信工程", icon: "antenna-bars" },
    { id: "m7", label: "自动化", icon: "gear" },
    { id: "m8", label: "机器人工程", icon: "mechanical-arm" },
    { id: "m9", label: "机械设计制造及其自动化", icon: "nut-and-bolt" },
    { id: "m10", label: "电气工程及其自动化", icon: "high-voltage" },
    { id: "m11", label: "数学与应用数学", icon: "triangular-ruler" },
    { id: "m12", label: "信息与计算科学", icon: "input-numbers" },
    { id: "m13", label: "物理学", icon: "telescope" },
    { id: "m14", label: "化学", icon: "test-tube" },
    { id: "m15", label: "环境工程", icon: "seedling" },
    { id: "m16", label: "生物医学工程", icon: "dna" },
    { id: "m17", label: "材料科学与工程", icon: "brick" },
    { id: "m18", label: "建筑学 / 土木工程", icon: "building-construction" },
    { id: "m19", label: "经济学 / 金融学", icon: "money-bag" },
    { id: "m20", label: "管理科学", icon: "clipboard" },
    { id: "m21", label: "新闻传播学", icon: "newspaper" },
    { id: "m22", label: "设计学 / 视觉传达", icon: "artist-palette" },
    { id: "m23", label: "医学 / 药学", icon: "stethoscope" },
    { id: "m24", label: "心理学", icon: "brain" },
    { id: "m25", label: "教育学", icon: "books" },
    { id: "m26", label: "法学", icon: "balance-scale" },
    { id: "m27", label: "能源与动力工程", icon: "battery" },
    { id: "m28", label: "航空航天工程", icon: "airplane" }
  ];
  const ROLE_TAGS = ["作品策划", "技术成员", "设计成员", "文案/材料成员", "调研成员", "答辩成员"];
  const GRADES = ["大一", "大二", "大三", "大四", "研一", "研二", "研三"];
  const PROJECT_STATUS_LABELS = { recruiting: "招集中", formed: "已组建", active: "进行中", paused: "已暂停", completed: "已完成", archived: "已归档" };
  const PROJECT_STATUS_NEXT = { recruiting: ["formed", "archived"], formed: ["active", "paused", "archived"], active: ["paused", "completed", "archived"], paused: ["active", "completed", "archived"], completed: ["archived"], archived: [] };
  const TASK_STATUS_LABELS = { todo: "待开始", in_progress: "进行中", completed: "已完成", overdue: "已逾期" };
  const TASK_PRIORITY_LABELS = { low: "低", medium: "中", high: "高" };
  const ANNOUNCEMENT_STATUS_LABELS = { draft: "草稿", published: "已发布", withdrawn: "已撤回", archived: "已归档" };
  /* ================= 主题配置 ================= */
  const THEMES = {
    starry: {
      id: "starry",
      name: "星穹·探索",
      description: "星空 · 科技 · 探索",
      preview: "images/styles/starry.jpg"
    },

    deepsea: {
      id: "deepsea",
      name: "深海·幻境",
      description: "深海 · 沉浸 · 清冷",
      preview: "images/styles/deepsea.jpg"
    },

    sky: {
      id: "sky",
      name: "晴空·幻想",
      description: "晴空 · 明亮 · 轻盈",
      preview: "images/styles/sky.jpg"
    },

    flower: {
      id: "flower",
      name: "花羽·梦境",
      description: "花羽 · 梦幻 · 柔和",
      preview: "images/styles/flower.png"
    },

    dragon: {
      id: "dragon",
      name: "星龙·秘境",
      description: "星龙 · 神秘 · 史诗",
      preview: "images/styles/dragon.jpg"
    },

    qingli: {
      id: "qingli",
      name: "青璃·映界",
      description: "清透青绿与柔和暖光交织，营造安静、梦幻而轻盈的作品空间。",
      preview: "images/styles/qingli.webp"
    }
  };
  const THEME_STORAGE_KEY = "projecthub_theme_v1";
  const BACKGROUND_KEY = "projecthub_background_v1";
  const DYNAMIC_INTENSITY_KEY = "projecthub_dynamic_intensity_v1";
  const DEFAULT_THEME_ID = "starry";
  function initializeTheme() {
    let savedTheme = null;

    // 读取浏览器中保存的主题
    try {
      savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
      console.warn("读取主题设置失败：", error);
    }

    // 有效主题：直接使用
    if (savedTheme && THEMES[savedTheme]) {
      applyTheme(savedTheme);
      return true;
    }

    // 有记录，但主题已经不存在：恢复默认主题
    if (savedTheme && !THEMES[savedTheme]) {
      console.warn("发现无效主题，恢复默认主题：", savedTheme);

      if (THEMES[DEFAULT_THEME_ID]) {
        applyTheme(DEFAULT_THEME_ID);

        try {
          localStorage.setItem(
            THEME_STORAGE_KEY,
            DEFAULT_THEME_ID
          );
        } catch (error) {
          console.warn("保存默认主题失败：", error);
        }

        return true;
      }
    }

  // 没有保存过主题
  return false;
}
  
 function applyTheme(themeId) {
  // 根据主题 ID 查找主题
  const theme = THEMES[themeId];

  if (!theme) {
    console.warn("未知主题：", themeId);
    return false;
  }

  // 保存当前主题状态
  state.theme = theme.id;

  // 把主题写到 <html> 标签
  document.documentElement.dataset.theme = theme.id;

  return true;
}
  const majorIcon = (id) => { const m = MAJORS.find((x) => x.id === id); return m ? m.icon : ""; };
  const majorLabel = (id) => majorName(id);
  const majorName = (id) => { const m = MAJORS.find((x) => x.id === id); return m ? m.label : id; };
  const PROJECT_CATEGORY_LABELS = {
    ai: "人工智能", robot: "机器人", vision: "计算机视觉",
    software: "软件", hardware: "硬件", aerospace: "航天", other: "其他"
  };

  function projectSearchText(t) {
    return [t.title, t.desc, t.vibe, topicDirections(t).map(majorName).join(" "), (t.neededRoles || []).join(" "), requiredLabels(t), t.type, t.members && t.members[0] && t.members[0].nickname]
      .filter(Boolean).join(" ").toLowerCase();
  }

  function projectCategory(t) {
    const dirs = topicDirections(t);
    const text = projectSearchText(t);
    if (dirs.indexOf("m28") >= 0 || /航天|航空|无人机|卫星|space|aerospace/.test(text)) return "aerospace";
    if (dirs.indexOf("m7") >= 0 || dirs.indexOf("m8") >= 0 || /机器人|ros|slam|机械臂|自动驾驶/.test(text)) return "robot";
    if (/计算机视觉|目标检测|图像|视觉|yolo|opencv|cnn|识别/.test(text)) return "vision";
    if (["m5", "m6", "m9", "m10", "m27"].some((id) => dirs.indexOf(id) >= 0) || /硬件|嵌入式|单片机|传感器|arduino|stm32|esp32|电路/.test(text)) return "hardware";
    if (dirs.indexOf("m3") >= 0 || dirs.indexOf("m4") >= 0 || /人工智能|机器学习|深度学习|大模型|nlp|算法/.test(text)) return "ai";
    if (dirs.indexOf("m1") >= 0 || dirs.indexOf("m2") >= 0 || /软件|前端|后端|小程序|网页|python|java|c\+\+|数据库/.test(text)) return "software";
    return "other";
  }
  const gradeOptions = (selected) => GRADES.map((g) => '<option value="' + g + '"' + (g === selected ? " selected" : "") + '>' + g + '</option>').join("");
  const tagOptions = (selected) => '<option value="">未分配</option>' + ROLE_TAGS.map((t) => '<option value="' + t + '"' + (t === selected ? " selected" : "") + '>' + t + '</option>').join("");

  const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const formatSize = (n) => (n < 1024 ? n + " B" : (n < 1024 * 1024 ? (n / 1024).toFixed(1) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB"));
  const { formatDate, formatTime } = window.ProjectHubTime || { formatDate: function () { return ""; }, formatTime: function () { return ""; } };

  /* ================= 状态与本地存储 ================= */
  const USER_KEY = "projecthub_session_v3";
  const OUTBOX_KEY = "projecthub_outbox_v1";
  const THEME_KEY = "projecthub_theme_v1";

  let state = {
    user: null,
    token: "",
    topics: [],
    messages: {},
    files: {},
    myApplications: [],
    inbox: [],
    notifications: [],
    unread: 0,
    announcements: [],
    announcementsUnread: 0,
    appeals: [],
    outbox: [],
    replyTo: null,
    filter: "all",
    categoryFilter: "all",
    statusFilter: "all",
    recruitingOnly: false,
    search: "",
    online: false,
    theme: "starry"
  };
  let currentTopicId = null;
  let petController = null;
  let lastPetUnread = 0;

  function loadThemePreference() {
    try {
      const saved = localStorage.getItem(THEME_KEY);

      if (saved && THEMES[saved]) {
        applyTheme(saved);
      } else {
        applyTheme("starry");
      }
    } catch (e) {
      applyTheme("starry");
    }
  }
  function saveThemePreference() {
    try {
      const theme = THEMES[state.theme];

      if (!theme) {
        console.warn("无法保存未知主题：", state.theme);
        return false;
      }

      localStorage.setItem(THEME_KEY, theme.id);
      return true;
    } catch (e) {
      console.warn("保存主题失败：", e);
      return false;
    }
  }

  function hasThemePreference() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return !!(saved && THEMES[saved]);
    } catch (e) {
      return false;
    }
  }

  function loadSession() {
    state.outbox = loadOutbox();
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.user = parsed.user || null;      // 仅缓存用户资料；会话凭据在 HttpOnly Cookie 中，JS 读不到
      state.token = "";                      // 兼容旧数据：不再使用 localStorage 中的 Token
    } catch (e) {}
  }
  function loadOutbox() {
    try { const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); return Array.isArray(parsed) ? parsed : []; }
    catch (e) { return []; }
  }
  function saveOutbox() {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(state.outbox || [])); } catch (e) {}
  }
  function saveSession() {
    try { localStorage.setItem(USER_KEY, JSON.stringify({ user: state.user })); } catch (e) {}
  }
  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)ph_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function clearSession() {
    state.user = null; state.token = ""; state.inbox = []; state.myApplications = []; state.outbox = [];
    try { localStorage.removeItem(USER_KEY); localStorage.removeItem(OUTBOX_KEY); } catch (e) {}
  }

  /* ================= 动态背景 ================= */

  const StarryRenderer = {
  ctx: null,
  width: 0,
  height: 0,
  particles: [],
  orbs: [],
  fireflies: [],
  pulses: [],
  comets: [],
  particleCount: 72,
  lastCometAt: 0,
  lastPulseAt: 0,
  intensity: "standard",

  color(c, alpha) {
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  },

  palette() {
    const theme = document.documentElement.dataset.theme || "starry";
    const palettes = {
      starry: { bg1: [5, 14, 39], bg2: [28, 16, 66], blue: [86, 142, 255], violet: [170, 100, 255], cyan: [75, 229, 210], rose: [255, 126, 184], gold: [255, 194, 112], core: [235, 243, 255], line: [112, 153, 255], light: false },
      deepsea: { bg1: [4, 24, 47], bg2: [7, 60, 83], blue: [54, 166, 235], violet: [115, 126, 255], cyan: [73, 230, 224], rose: [255, 139, 178], gold: [255, 210, 122], core: [205, 250, 255], line: [80, 198, 240], light: false },
      sky: { bg1: [220, 244, 255], bg2: [255, 237, 252], blue: [52, 143, 235], violet: [132, 121, 235], cyan: [63, 205, 210], rose: [236, 126, 181], gold: [242, 176, 88], core: [255, 255, 255], line: [70, 150, 230], light: true },
      flower: { bg1: [255, 245, 252], bg2: [242, 231, 255], blue: [130, 151, 235], violet: [185, 105, 220], cyan: [117, 210, 193], rose: [235, 126, 187], gold: [236, 174, 101], core: [255, 250, 255], line: [190, 120, 220], light: true },
      dragon: { bg1: [10, 7, 28], bg2: [53, 17, 78], blue: [96, 141, 255], violet: [177, 95, 255], cyan: [86, 224, 210], rose: [255, 116, 190], gold: [255, 190, 101], core: [255, 231, 255], line: [177, 105, 255], light: false },
      qingli: { bg1: [246, 241, 231], bg2: [220, 237, 234], blue: [110, 170, 166], violet: [155, 199, 195], cyan: [155, 199, 195], rose: [217, 189, 138], gold: [217, 189, 138], core: [255, 253, 248], line: [110, 170, 166], light: true }
    };
    return palettes[theme] || palettes.starry;
  },

  init(ctx, width, height, intensity) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.intensity = intensity || "standard";
    this.lastCometAt = 0;
    this.lastPulseAt = 0;
    this.updateParticleCount();
    this.createParticles();
    this.createOrbs();
    this.createFireflies();
  },

  updateParticleCount() {
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    if (mobile) {
      this.particleCount = this.intensity === "soft" ? 24 : (this.intensity === "immersive" ? 72 : 44);
      return;
    }
    this.particleCount = this.intensity === "soft" ? 44 : (this.intensity === "immersive" ? 132 : 78);
  },

  createParticles() {
    const palette = this.palette();
    this.particles = [];
    for (let i = 0; i < this.particleCount; i += 1) {
      const depth = Math.random() * 0.82 + 0.18;
      const tint = [palette.core, palette.cyan, palette.violet, palette.rose][i % 4];
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: (Math.random() * 1.8 + 0.42) * depth * (palette.light ? 1.22 : 1),
        vx: (Math.random() - 0.5) * (palette.light ? 0.14 : 0.11) * depth,
        vy: (Math.random() - 0.5) * (palette.light ? 0.14 : 0.11) * depth,
        baseAlpha: Math.random() * (palette.light ? 0.6 : 0.5) + (palette.light ? 0.28 : 0.2),
        alpha: Math.random() * 0.58 + 0.2,
        phase: Math.random() * Math.PI * 2,
        tint,
        depth
      });
    }
    this.pulses = [];
    this.comets = [];
  },

  createOrbs() {
    const palette = this.palette();
    const count = this.intensity === "soft" ? 4 : (this.intensity === "immersive" ? 13 : 9);
    const colors = [palette.blue, palette.violet, palette.cyan, palette.rose, palette.gold];
    this.orbs = [];
    for (let i = 0; i < count; i += 1) {
      this.orbs.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: Math.random() * Math.min(this.width, this.height) * (palette.light ? 0.27 : 0.22) + (palette.light ? 110 : 90),
        vx: (Math.random() - 0.5) * (palette.light ? 0.22 : 0.15),
        vy: (Math.random() - 0.5) * (palette.light ? 0.22 : 0.15),
        alpha: Math.random() * (palette.light ? 0.08 : 0.055) + (palette.light ? 0.045 : 0.03),
        color: colors[i % colors.length]
      });
    }
  },

  createFireflies() {
    const palette = this.palette();
    const count = this.intensity === "soft" ? 28 : (this.intensity === "immersive" ? 96 : 56);
    const colors = [palette.cyan, palette.violet, palette.blue, palette.gold, palette.rose];
    this.fireflies = [];
    for (let i = 0; i < count; i += 1) {
      this.fireflies.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: Math.random() * 2.2 + 1.1,
        vx: (Math.random() - 0.5) * 0.16,
        vy: -(Math.random() * 0.16 + 0.02),
        phase: Math.random() * Math.PI * 2,
        alpha: Math.random() * (palette.light ? 0.36 : 0.42) + 0.16,
        color: colors[i % colors.length]
      });
    }
  },

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.createParticles();
    this.createOrbs();
    this.createFireflies();
  },

  setIntensity(intensity) {
    this.intensity = intensity || "standard";
    this.updateParticleCount();
    this.createParticles();
    this.createOrbs();
    this.createFireflies();
  },

  update(timestamp) {
    const time = timestamp || 0;
    const palette = this.palette();
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      const twinkle = Math.sin(time * 0.0015 + p.phase);
      p.alpha = Math.max(0.07, Math.min(1, p.baseAlpha + twinkle * 0.19));
      if (p.x < -10) p.x = this.width + 10; else if (p.x > this.width + 10) p.x = -10;
      if (p.y < -10) p.y = this.height + 10; else if (p.y > this.height + 10) p.y = -10;
    }
    for (const o of this.orbs) {
      o.x += o.vx; o.y += o.vy;
      if (o.x < -o.r) o.x = this.width + o.r; else if (o.x > this.width + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = this.height + o.r; else if (o.y > this.height + o.r) o.y = -o.r;
    }
    for (const f of this.fireflies) {
      f.x += f.vx + Math.sin(time * 0.001 + f.phase) * 0.06;
      f.y += f.vy;
      if (f.y < -18) { f.y = this.height + 18; f.x = Math.random() * this.width; }
      if (f.x < -18) f.x = this.width + 18; else if (f.x > this.width + 18) f.x = -18;
    }
    if (!this.lastPulseAt) this.lastPulseAt = time;
    else if (time - this.lastPulseAt > (palette.light ? 1900 : 3000) + Math.random() * 1600) {
      this.lastPulseAt = time;
      this.pulses.push({ x: Math.random() * this.width, y: Math.random() * this.height, r: 8, speed: 0.8 + Math.random() * 1.5, life: 1, color: palette.line });
    }
    if (!this.lastCometAt) this.lastCometAt = time;
    else if (time - this.lastCometAt > (palette.light ? 3000 : 4200) + Math.random() * 2600) {
      this.lastCometAt = time;
      this.comets.push({ x: this.width * (0.4 + Math.random() * 0.65), y: this.height * (0.04 + Math.random() * 0.35), vx: -(3 + Math.random() * 2.5), vy: 0.9 + Math.random() * 0.9, life: 0, color: palette.core });
    }
    for (const p of this.pulses) { p.r += p.speed; p.life -= 0.012; }
    this.pulses = this.pulses.filter((p) => p.life > 0);
    for (const c of this.comets) { c.life += 0.013; c.x += c.vx; c.y += c.vy; }
    this.comets = this.comets.filter((c) => c.life < 1);
  },

  render() {
    if (!this.ctx) return;
    const palette = this.palette();
    const now = performance.now();
    const px = (typeof pointer !== "undefined" ? pointer.x : 0) * 22;
    const py = (typeof pointer !== "undefined" ? pointer.y : 0) * 16;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const bg = this.ctx.createLinearGradient(0, 0, this.width, this.height);
    bg.addColorStop(0, this.color(palette.bg1, palette.light ? 0.15 : 0.24));
    bg.addColorStop(1, this.color(palette.bg2, palette.light ? 0.1 : 0.18));
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, this.width, this.height);

    for (const o of this.orbs) {
      const x = o.x + px * o.r / 500, y = o.y + py * o.r / 500;
      const g = this.ctx.createRadialGradient(x, y, 0, x, y, o.r);
      g.addColorStop(0, this.color(o.color, o.alpha));
      g.addColorStop(0.46, this.color(o.color, o.alpha * 0.26));
      g.addColorStop(1, this.color(o.color, 0));
      this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.arc(x, y, o.r, 0, Math.PI * 2); this.ctx.fill();
    }

    for (let i = 0; i < 5; i += 1) {
      const y = this.height * (0.1 + i * 0.18) + Math.sin(now * 0.00035 + i) * 30 + py;
      const g = this.ctx.createLinearGradient(-100, y, this.width + 100, y + 90);
      const c1 = i % 3 === 0 ? palette.cyan : (i % 3 === 1 ? palette.violet : palette.blue);
      const c2 = i % 2 === 0 ? palette.rose : palette.cyan;
      g.addColorStop(0, this.color(c1, 0)); g.addColorStop(0.3, this.color(c2, palette.light ? 0.035 : 0.075));
      g.addColorStop(0.62, this.color(c1, palette.light ? 0.055 : 0.11)); g.addColorStop(1, this.color(c2, 0));
      this.ctx.strokeStyle = g; this.ctx.lineWidth = 24 + i * 8; this.ctx.lineCap = 'round';
      this.ctx.beginPath(); this.ctx.moveTo(-80 + px, y);
      this.ctx.bezierCurveTo(this.width * 0.2, y - 100, this.width * 0.58, y + 130, this.width + 80 + px, y - 35);
      this.ctx.stroke();
    }

    this.ctx.save();
    this.ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      this.ctx.save();
      this.ctx.translate(this.width * 0.5 + px * 0.25, this.height * 0.5 + py * 0.25);
      this.ctx.rotate(now * (i % 2 ? -0.00008 : 0.0001) + i);
      this.ctx.scale(1, 1 - (0.18 + i * 0.08));
      this.ctx.strokeStyle = this.color(i === 0 ? palette.line : (i === 1 ? palette.violet : palette.cyan), palette.light ? 0.09 : 0.075);
      this.ctx.lineWidth = i === 0 ? 1.4 : 0.9;
      this.ctx.setLineDash(i === 0 ? [20, 16, 4, 18] : [9, 18]);
      this.ctx.beginPath(); this.ctx.arc(0, 0, Math.min(this.width, this.height) * (0.28 + i * 0.15), 0, Math.PI * 2); this.ctx.stroke();
      this.ctx.restore();
    }
    this.ctx.restore();

    const maxDistance = this.width < 640 ? (palette.light ? 92 : 78) : (palette.light ? 142 : 120);
    for (let i = 0; i < this.particles.length; i += 1) {
      for (let j = i + 1; j < this.particles.length; j += 1) {
        const a = this.particles[i], b = this.particles[j];
        const ax = a.x + px * a.depth, ay = a.y + py * a.depth;
        const bx = b.x + px * b.depth, by = b.y + py * b.depth;
        const d = Math.hypot(ax - bx, ay - by);
        if (d > maxDistance) continue;
        this.ctx.strokeStyle = this.color(i % 4 === 0 ? palette.violet : palette.line, (1 - d / maxDistance) * (palette.light ? 0.22 : 0.17));
        this.ctx.lineWidth = palette.light ? 0.95 : 0.7;
        this.ctx.beginPath(); this.ctx.moveTo(ax, ay); this.ctx.lineTo(bx, by); this.ctx.stroke();
      }
    }

    for (const p of this.particles) {
      const x = p.x + px * p.depth, y = p.y + py * p.depth;
      const radius = p.r * (palette.light ? 8 : 7);
      const g = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, this.color(p.tint, p.alpha));
      g.addColorStop(0.32, this.color(p.tint, p.alpha * 0.28));
      g.addColorStop(1, this.color(p.tint, 0));
      this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.fillStyle = this.color(p.tint, p.alpha); this.ctx.beginPath(); this.ctx.arc(x, y, p.r, 0, Math.PI * 2); this.ctx.fill();
    }

    for (const f of this.fireflies) {
      const pulse = 0.72 + Math.sin(now * 0.002 + f.phase) * 0.28;
      const g = this.ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 11);
      g.addColorStop(0, this.color(f.color, f.alpha * pulse));
      g.addColorStop(0.26, this.color(f.color, f.alpha * pulse * 0.3));
      g.addColorStop(1, this.color(f.color, 0));
      this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.arc(f.x, f.y, f.r * 11, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.fillStyle = this.color(f.color, Math.min(1, f.alpha * pulse * 1.25));
      this.ctx.beginPath(); this.ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); this.ctx.fill();
    }

    for (const p of this.pulses) {
      this.ctx.strokeStyle = this.color(p.color, Math.max(0, p.life) * (palette.light ? 0.3 : 0.24));
      this.ctx.lineWidth = palette.light ? 1.4 : 1;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); this.ctx.stroke();
    }

    for (const c of this.comets) {
      const alpha = Math.sin(Math.min(c.life, 1) * Math.PI) * (palette.light ? 0.78 : 0.9);
      const tx = c.x - c.vx * 12, ty = c.y - c.vy * 12;
      const g = this.ctx.createLinearGradient(tx, ty, c.x, c.y);
      g.addColorStop(0, this.color(c.color, 0)); g.addColorStop(0.68, this.color(c.color, alpha * 0.45)); g.addColorStop(1, this.color(c.color, alpha));
      this.ctx.strokeStyle = g; this.ctx.lineWidth = palette.light ? 1.8 : 1.5;
      this.ctx.beginPath(); this.ctx.moveTo(tx, ty); this.ctx.lineTo(c.x, c.y); this.ctx.stroke();
    }
  }
};

const dynamicBackground = {
  canvas: null,
  ctx: null,

  running: false,
  animationId: null,

  mode: "static",
  intensity: "standard",

  renderer: null,

  init() {
    this.canvas = document.getElementById("dynamic-bg-canvas");

    if (!this.canvas) {
      console.warn("未找到动态背景 Canvas");
      return false;
    }

    this.ctx = this.canvas.getContext("2d");

    if (!this.ctx) {
      console.warn("当前浏览器不支持 Canvas 2D");
      return false;
    }

    this.resize();

    return true;
  },

  resize() {
    if (!this.canvas || !this.ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);

    this.canvas.style.width = window.innerWidth + "px";
    this.canvas.style.height = window.innerHeight + "px";

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.renderer && typeof this.renderer.resize === "function") {
      this.renderer.resize(
        window.innerWidth,
        window.innerHeight
      );
    }
  },

  setMode(mode) {
    this.mode = mode === "dynamic" ? "dynamic" : "static";

    if (this.mode === "dynamic") {
      this.start();
    } else {
      this.stop();
      this.clear();
    }
  },

  setIntensity(intensity) {
    const allowed = ["soft", "standard", "immersive"];

    this.intensity = allowed.includes(intensity)
      ? intensity
      : "standard";

    if (
      this.renderer &&
      typeof this.renderer.setIntensity === "function"
    ) {
      this.renderer.setIntensity(this.intensity);
    }
  },

  setRenderer(renderer) {
    this.stop();

    this.renderer = renderer || null;

    if (
      this.renderer &&
      typeof this.renderer.init === "function"
    ) {
      this.renderer.init(
        this.ctx,
        window.innerWidth,
        window.innerHeight,
        this.intensity
      );
    }

    if (this.mode === "dynamic") {
      this.start();
    }
  },

  start() {
    if (!this.canvas || !this.ctx) return;
    if (!this.renderer) return;
    if (this.running) return;

    this.running = true;
    this.canvas.style.display = "block";

    this.loop();
  },

  stop() {
    this.running = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  },

  clear() {
    if (!this.ctx) return;

    this.ctx.clearRect(
      0,
      0,
      window.innerWidth,
      window.innerHeight
    );

    this.canvas.style.display = "none";
  },

  loop(timestamp) {
    if (!this.running) return;

    this.animationId = requestAnimationFrame(
      (time) => this.loop(time)
    );

    if (!this.renderer) return;

    if (typeof this.renderer.update === "function") {
      this.renderer.update(timestamp);
    }

    if (typeof this.renderer.render === "function") {
      this.renderer.render();
    }
  }
};

  /* ================= DOM / 弹窗 ================= */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const FA_ALIASES = {
    megaphone: "bullhorn", "speech-balloon": "comment-dots", pushpin: "thumbtack",
    "office-worker": "user-tie", "person-raising-hand": "hand", unlocked: "unlock",
    locked: "lock", eyes: "eye", "check-mark-button": "circle-check",
    "satellite-antenna": "satellite-dish", "antenna-bars": "tower-broadcast",
    "mechanical-arm": "robot", "nut-and-bolt": "screwdriver-wrench", "high-voltage": "bolt",
    "triangular-ruler": "ruler-combined", "input-numbers": "calculator", telescope: "atom",
    "test-tube": "flask-vial", brick: "cubes-stacked", "building-construction": "building",
    "money-bag": "sack-dollar", clipboard: "clipboard-list", "artist-palette": "palette",
    books: "book-open", "balance-scale": "scale-balanced", battery: "battery-full", airplane: "plane"
  };
  const faIcon = (name, className) => '<i class="fa-solid fa-' + (FA_ALIASES[name] || name) + ' ui-icon ' + (className || "") + '" aria-hidden="true"></i>';
  const modalOverlay = $("#modal-overlay");
  const modalContent = $("#modal-content");
  const modalClose = $("#modal-close");
  let modalClosable = true;

  function showModal(html, closable) {
    modalClosable = closable !== false;
    modalContent.innerHTML = html;
    modalOverlay.hidden = false;
    modalClose.style.display = modalClosable ? "" : "none";
    const box = modalContent;
    box.scrollTop = 0;
  }
  function hideModal() {
    modalOverlay.hidden = true;
    modalClosable = true;
  }

function showThemeChooser() {
  const currentThemeId = document.documentElement.dataset.theme;

  let selectedThemeId =
    THEMES[currentThemeId]
      ? currentThemeId
      : null;

  // 从 THEMES 对象中取出全部主题
  const themes = Object.values(THEMES);

  // 根据主题数据自动生成主题卡片
  const themeCards = themes.map((theme) => `
  <button
    class="theme-option${theme.id === selectedThemeId ? " is-selected" : ""}"
    type="button"
    data-theme="${theme.id}"
  >
      <div class="theme-preview">
        <img
          src="${theme.preview}"
          alt="${escapeHtml(theme.name)}"
        >
      </div>

      <div class="theme-info">
        <strong>${escapeHtml(theme.name)}</strong>
        <span>${escapeHtml(theme.description)}</span>
      </div>
    </button>
  `).join("");

  // 显示主题选择弹窗
  showModal(`
    <div class="theme-chooser">
      <h2 class="modal-title">选择你喜欢的风格</h2>

      <p class="modal-sub">
        为芳菲文学社选择一个你喜欢的视觉主题
      </p>

      <div class="theme-options">
        ${themeCards}
      </div>

      <div class="wizard-foot">
      <button
        id="theme-reset"
        class="btn btn-ghost"
        type="button"
      >
        恢复默认主题
      </button>

       <button
        id="theme-confirm"
        class="btn btn-primary"
        type="button"
        disabled
      >
        确认选择
      </button>
    </div>
  `, true);

  const options = modalContent.querySelectorAll(".theme-option");
  const confirmButton = modalContent.querySelector("#theme-confirm");
  const resetButton = modalContent.querySelector("#theme-reset");

  // 根据当前主题决定“确认选择”按钮是否可用
  confirmButton.disabled = !selectedThemeId;

  // 点击主题卡片
  options.forEach((option) => {
    option.addEventListener("click", () => {
      selectedThemeId = option.dataset.theme;

      // 清除其他卡片的选中状态
      options.forEach((item) => {
        item.classList.remove("is-selected");
      });

      // 当前卡片变成选中状态
      option.classList.add("is-selected");

      // 立即切换主题，实现实时预览
      applyTheme(selectedThemeId);

      // 选择之后才能确认
      confirmButton.disabled = false;
    });
  });
resetButton.addEventListener("click", () => {
  if (!THEMES[DEFAULT_THEME_ID]) {
    console.warn("默认主题不存在：", DEFAULT_THEME_ID);
    return;
  }

  selectedThemeId = DEFAULT_THEME_ID;

  options.forEach((item) => {
    item.classList.remove("is-selected");
  });

  const defaultOption = modalContent.querySelector(
    `[data-theme="${DEFAULT_THEME_ID}"]`
  );

  if (defaultOption) {
    defaultOption.classList.add("is-selected");
  }

  applyTheme(DEFAULT_THEME_ID);

  localStorage.setItem(
    THEME_STORAGE_KEY,
    DEFAULT_THEME_ID
  );

  confirmButton.disabled = false;
});


  // 点击确认
  confirmButton.addEventListener("click", () => {
  if (!selectedThemeId) return;

  // 立即应用主题
  applyTheme(selectedThemeId);

  // 保存用户选择
  localStorage.setItem(
    THEME_STORAGE_KEY,
    selectedThemeId
  );

  // 关闭主题选择器
  hideModal();

  // 如果用户还没有完成身份选择，
  // 则继续原来的角色选择流程
  if (!isLogged()) {
    openRoleModal();
  }
});
}

  let toastTimer = null;
  function showToast(msg) {
    if (petController) petController.react(msg);
    const toast = $("#toast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  /* ================= 讨论辅助 ================= */
  const isLogged = () => !!(state.user && state.user.id);
  const isAdmin = () => !!(state.user && state.user.role === "admin");
  const isMember = (topic) => !!(state.user && topic.members.some((m) => m.id === state.user.id));
  const isLeader = (topic) => !!(state.user && (topic.creatorId === state.user.id || state.user.role === "admin"));
  const myAppStatus = (topicId) => { const a = state.myApplications.find((x) => x.topicId === topicId); return a ? a.status : ""; };
  const topicDirections = (topic) => (Array.isArray(topic.directions) && topic.directions.length) ? topic.directions : (topic.direction ? [topic.direction] : []);
  const topicDirectionLabel = (topic) => topicDirections(topic).map(majorLabel).join(" · ");
  const requiredLabels = (topic) => (topic.required || []).map(majorName).join(" / ");
  const filledTags = (topic) => topic.members.map((m) => m.tag).filter(Boolean);
  const missingTags = (topic) => {
    const filled = filledTags(topic);
    return (topic.neededRoles || []).filter((r) => filled.indexOf(r) < 0);
  };

  /* ================= API 层 ================= */
  async function api(method, path, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (state.token) headers["Authorization"] = "Bearer " + state.token;
    if (["POST", "PATCH", "DELETE"].indexOf(String(method).toUpperCase()) >= 0) {
      const csrf = csrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    let res;
    if (petController && String(method).toUpperCase() !== "GET") petController.loading();
    try {
      const url = path.startsWith("/") ? path : "/" + path;
      res = await fetch(url, { method: method, headers: headers, credentials: "same-origin", body: body !== undefined ? JSON.stringify(body) : undefined, cache: "no-store" });
    } catch (e) {
      if (petController) petController.error();
      throw new Error("无法连接服务器，请检查网络");
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      if (petController) petController.error();
      if (res.status === 401 && state.user) { clearSession(); renderHeader(); showToast("登录状态已失效，请重新登录"); }
      const err = new Error(data.error || "请求失败"); err.status = res.status; throw err;
    }
    if (petController && String(method).toUpperCase() !== "GET") petController.success();
    return data;
  }

  const Store = {
    health: () => api("GET", "api/health"),
    topics: () => api("GET", "api/topics"),
    register: (p) => api("POST", "api/register", p),
    login: (p) => api("POST", "api/login", p),
    logout: () => api("POST", "api/logout", {}),
    updateMe: (p) => api("PATCH", "api/me", p),
    createTopic: (p) => api("POST", "api/topics", p),
    deleteTopic: (id) => api("DELETE", "api/topics/" + encodeURIComponent(id)),
    apply: (id, p) => api("POST", "api/topics/" + encodeURIComponent(id) + "/applications", p),
    cancelApplication: (id) => api("DELETE", "api/topics/" + encodeURIComponent(id) + "/applications"),
    inbox: () => api("GET", "api/inbox"),
    myApplications: () => api("GET", "api/my-applications"),
    decide: (id, action) => api("POST", "api/applications/" + encodeURIComponent(id) + "/" + action, {}),
    messages: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/messages?limit=300"),
    sendMessage: (id, text, replyTo, clientId) => api("POST", "api/topics/" + encodeURIComponent(id) + "/messages", { text: text, replyTo: replyTo || null, clientId: clientId || "" }),
    files: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/files"),
    uploadFile: (id, payload) => api("POST", "api/topics/" + encodeURIComponent(id) + "/files", payload),
    setTag: (id, memberId, tag) => api("POST", "api/topics/" + encodeURIComponent(id) + "/members/" + encodeURIComponent(memberId) + "/tag", { tag: tag }),
    removeMember: (id, memberId) => api("DELETE", "api/topics/" + encodeURIComponent(id) + "/members/" + encodeURIComponent(memberId)),
    deleteFile: (topicId, fileId) => api("DELETE", "api/topics/" + encodeURIComponent(topicId) + "/files/" + encodeURIComponent(fileId)),
    editMessage: (topicId, msgId, text) => api("PATCH", "api/topics/" + encodeURIComponent(topicId) + "/messages/" + encodeURIComponent(msgId), { text: text }),
    recallMessage: (topicId, msgId) => api("DELETE", "api/topics/" + encodeURIComponent(topicId) + "/messages/" + encodeURIComponent(msgId)),
    sseTicket: () => api("POST", "api/sse/ticket", {}),
    report: (payload) => api("POST", "api/reports", payload),
    adminReports: () => api("GET", "api/admin/reports"),
    resolveReport: (id, payload) => api("POST", "api/admin/reports/" + encodeURIComponent(id) + "/resolve", payload || {}),
    notifications: () => api("GET", "api/notifications"),
    readNotifications: (payload) => api("POST", "api/notifications/read", payload || { all: true }),
    adminUsers: () => api("GET", "api/admin/users"),
    adminBan: (userId, banned) => api("POST", "api/admin/users/" + encodeURIComponent(userId) + "/ban", { banned: banned }),
    adminMute: (userId, muted) => api("POST", "api/admin/users/" + encodeURIComponent(userId) + "/mute", { muted: muted }),
    adminStats: () => api("GET", "api/admin/stats"),
    adminAudit: () => api("GET", "api/admin/audit"),
    adminTopics: () => api("GET", "api/admin/topics"),
    adminFiles: () => api("GET", "api/admin/files"),
    adminDeleteFile: (id) => api("DELETE", "api/admin/files/" + encodeURIComponent(id)),
    adminAnnouncements: () => api("GET", "api/admin/announcements"),
    adminCreateAnnouncement: (payload) => api("POST", "api/admin/announcements", payload),
    adminUpdateAnnouncement: (id, payload) => api("PATCH", "api/admin/announcements/" + encodeURIComponent(id), payload),
    adminDeleteAnnouncement: (id) => api("DELETE", "api/admin/announcements/" + encodeURIComponent(id)),
    adminAppeals: () => api("GET", "api/admin/appeals"),
    adminResolveAppeal: (id, payload) => api("POST", "api/admin/appeals/" + encodeURIComponent(id) + "/resolve", payload),
    adminPenalties: () => api("GET", "api/admin/penalties"),
    adminRevokePenalty: (id) => api("POST", "api/admin/penalties/" + encodeURIComponent(id) + "/revoke", {}),
    announcements: () => api("GET", "api/announcements"),
    readAnnouncement: (id) => api("POST", "api/announcements/" + encodeURIComponent(id) + "/read", {}),
    appeals: () => api("GET", "api/appeals"),
    createAppeal: (payload) => api("POST", "api/appeals", payload),
    setProjectStatus: (id, status) => api("POST", "api/topics/" + encodeURIComponent(id) + "/status", { status: status }),
    transferOwner: (id, userId) => api("POST", "api/topics/" + encodeURIComponent(id) + "/owner", { userId: userId }),
    tasks: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/tasks"),
    createTask: (id, payload) => api("POST", "api/topics/" + encodeURIComponent(id) + "/tasks", payload),
    updateTask: (id, taskId, payload) => api("PATCH", "api/topics/" + encodeURIComponent(id) + "/tasks/" + encodeURIComponent(taskId), payload),
    deleteTask: (id, taskId) => api("DELETE", "api/topics/" + encodeURIComponent(id) + "/tasks/" + encodeURIComponent(taskId)),
    activities: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/activities"),
    resources: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/resources"),
    createResource: (id, payload) => api("POST", "api/topics/" + encodeURIComponent(id) + "/resources", payload),
    deleteResource: (id, resourceId) => api("DELETE", "api/topics/" + encodeURIComponent(id) + "/resources/" + encodeURIComponent(resourceId)),
    outcome: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/outcome"),
    saveOutcome: (id, payload) => api("PATCH", "api/topics/" + encodeURIComponent(id) + "/outcome", payload)

  };

  /* ================= 顶部信息 ================= */
  function renderHeader() {
    const chip = $("#user-chip");
    if (typeof renderBell === "function") renderBell();
    if (typeof renderAnnouncementBell === "function") renderAnnouncementBell();
    const authBtn = $("#btn-auth");
    const logoutBtn = $("#btn-logout");
    const inboxBtn = $("#btn-inbox");
    const adminBtn = $("#btn-admin");
    const badge = $("#inbox-badge");
    const u = state.user;

    if (!isLogged()) {
      chip.innerHTML = '<span class="u-avatar">?</span><span class="u-name">未登录</span>';
      authBtn.hidden = false; logoutBtn.hidden = true; inboxBtn.hidden = true; adminBtn.hidden = true;
      badge.hidden = true;
      return;
    }
    const sub = u.role === "admin" ? "管理员" : (u.grade || "");
    chip.innerHTML = '<span class="u-avatar">' + escapeHtml((u.nickname || "我").slice(0, 1)) + '</span><span class="u-name">' + escapeHtml(u.nickname || "我") + '</span>' + (sub ? '<span class="u-grade">' + escapeHtml(sub) + '</span>' : '');
    authBtn.hidden = true;
    logoutBtn.hidden = false;
    inboxBtn.hidden = false;
    adminBtn.hidden = u.role !== "admin";
    const pending = state.inbox.filter((a) => a.status === "pending").length;
    badge.hidden = pending === 0;
    badge.textContent = pending > 99 ? "99+" : String(pending);
  }

  /* ================= 讨论广场 ================= */
  function renderFilterBar() {
    const bar = $("#filter-bar");
    const distinct = [];
    state.topics.forEach((t) => topicDirections(t).forEach((id) => { if (distinct.indexOf(id) < 0) distinct.push(id); }));
    let html = '<button class="filter-chip' + (state.filter === "all" ? " is-on" : "") + '" data-filter="all" type="button">全部</button>';
    distinct.forEach((id) => {
      html += '<button class="filter-chip' + (state.filter === id ? " is-on" : "") + '" data-filter="' + id + '" type="button">' + faIcon(majorIcon(id), "filter-icon-img") + escapeHtml(majorLabel(id)) + '</button>';
    });
    bar.innerHTML = html;
    bar.querySelectorAll("[data-filter]").forEach((b) => {
      b.addEventListener("click", () => { state.filter = b.getAttribute("data-filter"); renderFilterBar(); renderTopicGrid(); });
    });
  }

  function topicCard(t) {
    const dirs = topicDirections(t);
    const statusLabel = PROJECT_STATUS_LABELS[t.status] || "招集中";
    const category = PROJECT_CATEGORY_LABELS[projectCategory(t)] || "其他";
    const dirChips = dirs.slice(0, 2).map((id) => '<span class="topic-direction">' + faIcon(majorIcon(id), "inline-icon") + escapeHtml(majorName(id)) + '</span>').join("") +
      (dirs.length > 2 ? '<span class="topic-direction">+' + (dirs.length - 2) + '</span>' : "");
    const typeBadge = t.type === "public" ? '<span class="badge badge-public">' + faIcon("unlocked", "badge-icon") + '公开讨论</span>' : '<span class="badge badge-private">' + faIcon("locked", "badge-icon") + '私密讨论</span>';
    const need = (t.neededRoles || []).length ? escapeHtml(t.neededRoles.join(" / ")) : "不限";
    const miss = missingTags(t);
    const missHtml = t.neededRoles && t.neededRoles.length
      ? (miss.length ? '<p class="topic-missing">还缺：<strong>' + escapeHtml(miss.slice(0, 3).join(" / ")) + '</strong></p>' : '<p class="topic-missing is-done">角色已齐 ✓</p>')
      : "";
    const member = isMember(t);
    const leader = isLeader(t);
    const appStatus = myAppStatus(t.id);
    const memberCount = Number.isFinite(t.memberCount) ? t.memberCount : t.members.length;
    const full = !member && memberCount >= t.limit;
    let label = "查看作品", cls = "btn-ghost", actionAttr = 'data-open="' + t.id + '"';
    if (member) { label = "进入作品"; cls = "btn-primary"; }
    else if (appStatus === "pending") { label = "取消申请"; cls = "btn-danger"; actionAttr = 'data-cancel-app="' + t.id + '"'; }
    const recruit = t.status === "recruiting" ? '<span class="topic-recruit">正在招募</span>' : "";
    const fullBadge = full ? '<span class="topic-full">已满员</span>' : "";
    return '<article class="topic-card">' +
      '<div class="topic-head">' + typeBadge + recruit + fullBadge + '<span class="topic-status">' + escapeHtml(statusLabel) + '</span>' + dirChips + '</div>' +
      '<div class="topic-card-body"><div class="topic-card-kicker">' + escapeHtml(category) + ' · <span class="topic-count">成员 ' + memberCount + '/' + t.limit + '</span></div>' +
      '<h3 class="topic-title">' + escapeHtml(t.title) + '</h3>' +
      '<p class="topic-desc">' + escapeHtml(t.desc || "暂无简介") + '</p>' +
      '<p class="topic-vibe">组内氛围：' + escapeHtml(t.vibe || "负责人还没有填写") + '</p>' +
      '<p class="topic-require">研究方向：' + escapeHtml(topicDirectionLabel(t) || "不限") + '</p>' +
      '<p class="topic-roles">需要角色：' + need + '</p>' + missHtml + '</div>' +
      '<div class="topic-foot"><span class="topic-owner">负责人 · <strong>' + (t.memberHidden ? "私密作品" : escapeHtml(t.members[0] ? t.members[0].nickname : "—")) + '</strong></span>' +
      '<span class="topic-actions">' +
        '<button class="btn ' + cls + ' btn-small" type="button" ' + actionAttr + '>' + label + '</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-share="' + t.id + '">复制链接</button>' +
        (leader ? '<button class="btn btn-danger btn-small" type="button" data-delete="' + t.id + '">删除</button>' : '') +
      '</span></div></article>';
  }

  function renderTopicGrid() {
    const grid = $("#topic-grid");
    const empty = $("#empty-state");
    const kw = (state.search || "").trim().toLowerCase();
    const category = state.categoryFilter || "all";
    const list = state.topics.filter((t) => {
      const dirs = topicDirections(t);
      const okDirection = state.filter === "all" || dirs.indexOf(state.filter) >= 0 || (t.required || []).indexOf(state.filter) >= 0;
      if (!okDirection) return false;
      if (category !== "all" && projectCategory(t) !== category) return false;
      if (state.statusFilter !== "all" && t.status !== state.statusFilter) return false;
      if (state.recruitingOnly && t.status !== "recruiting") return false;
      return !kw || projectSearchText(t).indexOf(kw) >= 0;
    });

    $("#stat-topics").textContent = state.topics.length;
    $("#stat-members").textContent = state.topics.reduce((n, t) => n + (Number.isFinite(t.memberCount) ? t.memberCount : t.members.length), 0);
    const resultCount = $("#result-count");
    if (resultCount) {
      resultCount.textContent = kw ? ("搜索到 " + list.length + " 个作品") : ((category !== "all" || state.statusFilter !== "all" || state.recruitingOnly) ? ("筛选出 " + list.length + " 个作品") : ("共 " + list.length + " 个作品 · 可搜索名称、简介、研究方向"));
    }

    grid.innerHTML = list.map(topicCard).join("");
    empty.hidden = list.length > 0;
    if (!empty.hidden) {
      const titleEl = empty.querySelector("[data-empty-title]");
      const subEl = empty.querySelector("[data-empty-sub]");
      const createBtn = $("#empty-create-btn");
      if (state.topics.length === 0) {
        titleEl.textContent = "还没有任何作品";
        subEl.textContent = "发布第一个作品，成为这里的第一个负责人。";
        createBtn.hidden = false;
      } else if (kw) {
        titleEl.textContent = "没有找到匹配的作品";
        subEl.textContent = "试试其他作品名称、简介或研究方向。";
        createBtn.hidden = true;
      } else {
        titleEl.textContent = "当前筛选下没有作品";
        subEl.textContent = "换一个分类、方向或状态再试试。";
        createBtn.hidden = true;
      }
    }

    grid.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => handleOpenTopic(b.getAttribute("data-open"))));
    grid.querySelectorAll("[data-cancel-app]").forEach((b) => b.addEventListener("click", () => {
      const topic = state.topics.find((t) => t.id === b.getAttribute("data-cancel-app"));
      if (topic) openCancelApplicationModal(topic);
    }));
    grid.querySelectorAll("[data-share]").forEach((b) => b.addEventListener("click", () => copyProjectLink(b.getAttribute("data-share"))));
    grid.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => {
      const topic = state.topics.find((t) => t.id === b.getAttribute("data-delete"));
      if (topic) openDeleteModal(topic);
    }));
  }

  async function copyProjectLink(topicId) {
    const url = location.origin + "/project/" + encodeURIComponent(topicId);
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
      else {
        const input = document.createElement("textarea");
        input.value = url; input.setAttribute("readonly", ""); input.style.position = "fixed"; input.style.opacity = "0";
        document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
      }
      showToast("作品链接已复制");
    } catch (e) {
      window.prompt("复制作品链接", url);
    }
  }

  async function openSharedProject(topicId) {
    if (!topicId) return;
    if (!state.topics.some((t) => t.id === topicId)) { showToast("作品不存在或暂不可访问"); return; }
    await handleOpenTopic(topicId);
  }

  function renderPlaza() {
    renderHeader();
    renderFilterBar();
    renderTopicGrid();
  }

  /* ================= 登录 / 注册 ================= */
  function authFormHtml(mode, d) {
    return '<div class="auth-tabs">' +
      '<button class="auth-tab' + (mode === "login" ? " is-on" : "") + '" type="button" data-mode="login">登录</button>' +
      '<button class="auth-tab' + (mode === "register" ? " is-on" : "") + '" type="button" data-mode="register">注册</button>' +
      '</div>' +
      '<div class="field"><label>昵称</label><input class="input js-nickname" type="text" placeholder="例如：陈同学" value="' + escapeHtml(d.nickname) + '"></div>' +
      '<div class="field"><label>密码</label><input class="input js-password" type="password" placeholder="至少 10 位" value="' + escapeHtml(d.password) + '"></div>' +
      (mode === "register" ? '<div class="field"><label>大学几年级</label><select class="select js-grade">' + gradeOptions(d.grade) + '</select></div>' : '') +
      '<p class="form-error js-error" hidden></p>' +
      '<button class="btn btn-primary btn-full" type="button" data-submit>' + (mode === "login" ? "登录" : "注册并登录") + '</button>' +
      '<p class="form-note note-center note-mt-14">' + (mode === "login" ? "还没有账号？点上面的「注册」" : "已有账号？点上面的「登录」") + '</p>' +
      '<p class="form-note note-center auth-legal">继续使用即表示你同意 <a href="terms.html" target="_blank" rel="noopener">用户协议</a> 与 <a href="privacy.html" target="_blank" rel="noopener">隐私政策</a>。</p>';
  }

  function openAuthModal(opts) {
    opts = opts || {};
    const d = { nickname: opts.nickname || "", password: "", grade: (opts.grade || state.user && state.user.grade || GRADES[0]) };
    let mode = opts.mode === "register" ? "register" : "login";

    function render() {
      showModal('<h2 class="modal-title">登录 / 注册</h2><p class="modal-sub">登录后可以发布作品、申请加入、在讨论里聊天。</p>' + authFormHtml(mode, d), true);
      const box = modalContent;
      box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.getAttribute("data-mode"); render(); }));
      box.querySelector("[data-submit]").addEventListener("click", async () => {
        const nickname = box.querySelector(".js-nickname").value.trim();
        const password = box.querySelector(".js-password").value;
        const grade = mode === "register" ? (box.querySelector(".js-grade") ? box.querySelector(".js-grade").value : d.grade) : "";
        const err = box.querySelector(".js-error");
        if (!nickname) { err.textContent = "请填写昵称"; err.hidden = false; return; }
        if (password.length < 10) { err.textContent = "密码至少需要 10 位"; err.hidden = false; return; }
        const btn = box.querySelector("[data-submit]");
        btn.disabled = true; btn.textContent = mode === "login" ? "正在登录…" : "正在注册…";
        try {
          const payload = { nickname: nickname, password: password };
          if (mode === "register") { payload.grade = grade; payload.directions = opts.directions || []; }
          const res = mode === "login" ? await Store.login(payload) : await Store.register(payload);
          state.user = res.user; state.token = ""; saveSession();
          await loadPrivateData();
          renderPlaza();
          ensureSse();
          hideModal();
          showToast(mode === "login" ? "登录成功，欢迎回来" : "注册成功，欢迎加入");
          if (opts.onDone) opts.onDone();
        } catch (e) {
          btn.disabled = false; btn.textContent = mode === "login" ? "登录" : "注册并登录";
          err.textContent = e.message || "操作失败"; err.hidden = false;
        }
      });
    }
    render();
  }

  async function loadPrivateData() {
    if (!isLogged()) { state.inbox = []; state.myApplications = []; state.appeals = []; return; }
    try { const r = await Store.myApplications(); state.myApplications = r.applications || []; } catch (e) {}
    try { const r = await Store.inbox(); state.inbox = r.applications || []; } catch (e) {}
    try { const r = await Store.appeals(); state.appeals = r.appeals || []; } catch (e) {}
    await loadNotifications();
    await flushOutbox();
  }

    /* ================= 首次主题选择 ================= */
  function openThemeChooser() {
    return showThemeChooser();
  }

  function loadBackgroundPreference() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dynamicBackground.setMode("static");
      dynamicBackground.setIntensity("soft");
      return;
    }
    let mode = "dynamic";
    let intensity = "standard";
    try {
      const savedMode = localStorage.getItem(BACKGROUND_KEY);
      const savedIntensity = localStorage.getItem(DYNAMIC_INTENSITY_KEY);
      if (savedMode === "dynamic") mode = "dynamic";
      if (["soft", "standard", "immersive"].includes(savedIntensity)) intensity = savedIntensity;
    } catch (e) {}
    dynamicBackground.setMode(mode);
    dynamicBackground.setIntensity(intensity);
  }

  function saveBackgroundPreference(mode, intensity) {
    try {
      localStorage.setItem(BACKGROUND_KEY, mode === "dynamic" ? "dynamic" : "static");
      localStorage.setItem(DYNAMIC_INTENSITY_KEY, ["soft", "standard", "immersive"].includes(intensity) ? intensity : "standard");
    } catch (e) {}
  }

  /* ================= 身份选择 ================= */
  function openRoleModal() {
    showModal(
      '<h2 class="modal-title">你是谁？</h2>' +
      '<p class="modal-sub">选择你的身份，芳菲文学社会带你去到对应的地方。</p>' +
      '<div class="role-options">' +
        '<button class="role-option" type="button" data-role="leader"><span class="role-icon">' + faIcon("office-worker", "role-icon-img") + '</span><h3>作品负责人</h3><p>我有一个作品想法，想创建讨论、招募队友。</p></button>' +
        '<button class="role-option" type="button" data-role="member"><span class="role-icon">' + faIcon("person-raising-hand", "role-icon-img") + '</span><h3>作品成员</h3><p>我想找感兴趣的作品，申请加入团队。</p></button>' +
      '</div>' +
      '<p class="form-note note-center note-mt-18"><button class="link-btn" type="button" data-login>' + (isLogged() ? "已登录：" + escapeHtml(state.user.nickname) : "已有账号？直接登录") + '</button></p>', false);
    $("#modal-content [data-role='leader']").addEventListener("click", openLeaderFlow);
    $("#modal-content [data-role='member']").addEventListener("click", openMemberFlow);
    const loginLink = $("#modal-content [data-login]");
    if (loginLink) loginLink.addEventListener("click", () => openAuthModal({ mode: "login" }));
  }

  /* ================= 作品负责人流程 ================= */
  function openLeaderFlow() {
    const logged = isLogged();
    const flow = logged ? [0, 1, 3] : [0, 1, 2, 3];
    const d = {
      directions: [], type: null, neededRoles: [],
      nickname: logged ? state.user.nickname : "",
      password: "",
      grade: logged ? (state.user.grade || GRADES[0]) : GRADES[0],
      title: "", desc: "", vibe: "", limit: 6, required: [], code: ""
    };

    function go(stepValue) { const i = flow.indexOf(stepValue); render(i < 0 ? 0 : i); }

    function render(idx) {
      const step = flow[idx];
      let html = '<div class="wizard-steps">' + flow.map((s, i) => '<div class="wizard-dot' + (i <= idx ? " is-active" : "") + '"></div>').join("") + '</div>';

      if (step === 0) {
        html += '<h2 class="modal-title">你的作品涉及哪些方向？</h2><p class="modal-sub">参考中国高校专业方向，可多选，最多 5 个。</p><div class="major-grid">';
        MAJORS.forEach((m) => { html += '<button class="major-chip' + (d.directions.indexOf(m.id) >= 0 ? " is-on" : "") + '" type="button" data-major="' + m.id + '">' + faIcon(m.icon, "mj-icon-img") + m.label + '</button>'; });
        html += '</div><p class="wizard-hint">已选 ' + d.directions.length + ' / 5</p><div class="wizard-foot"><button class="btn btn-primary btn-full" type="button" data-next' + (d.directions.length ? "" : " disabled") + '>下一步</button></div>';
        showModal(html, true);
        const box = modalContent, hint = box.querySelector(".wizard-hint"), next = box.querySelector("[data-next]");
        box.querySelectorAll("[data-major]").forEach((b) => b.addEventListener("click", () => {
          const id = b.getAttribute("data-major");
          if (d.directions.indexOf(id) >= 0) d.directions = d.directions.filter((x) => x !== id);
          else if (d.directions.length < 5) d.directions.push(id);
          else { showToast("最多选择 5 个方向"); return; }
          b.classList.toggle("is-on", d.directions.indexOf(id) >= 0);
          hint.textContent = "已选 " + d.directions.length + " / 5";
          next.disabled = d.directions.length === 0;
        }));
        next.addEventListener("click", () => go(1));
      }

      else if (step === 1) {
        html += '<h2 class="modal-title">公开讨论还是私密讨论？</h2><p class="modal-sub">公开讨论按方向申请；私密讨论需要 6 位密码才能申请。</p><div class="choice-grid">' +
          '<button class="choice-card' + (d.type === "public" ? " is-on" : "") + '" type="button" data-type="public"><span class="choice-icon">' + faIcon("unlocked", "choice-icon-img") + '</span><h4>公开讨论</h4><p>设置申请加入所需的方向，符合方向的同学可以申请。</p></button>' +
          '<button class="choice-card' + (d.type === "private" ? " is-on" : "") + '" type="button" data-type="private"><span class="choice-icon">' + faIcon("locked", "choice-icon-img") + '</span><h4>私密讨论</h4><p>设置 6 位密码，拿到密码的同学才能申请加入。</p></button>' +
          '</div><p class="wizard-hint" data-type-hint>' + (d.type ? "已选择：" + (d.type === "public" ? "公开讨论" : "私密讨论") : "请点击上面的卡片选择讨论类型") + '</p>' +
          '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-prev>上一步</button><button class="btn btn-primary" type="button" data-next' + (d.type ? "" : " disabled") + '>下一步</button></div>';
        showModal(html, true);
        const box = modalContent, hint = box.querySelector("[data-type-hint]"), next = box.querySelector("[data-next]");
        box.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
          d.type = b.getAttribute("data-type");
          box.querySelectorAll("[data-type]").forEach((x) => x.classList.toggle("is-on", x === b));
          hint.textContent = "已选择：" + (d.type === "public" ? "公开讨论" : "私密讨论");
          next.disabled = false;
        }));
        box.querySelector("[data-prev]").addEventListener("click", () => go(0));
        next.addEventListener("click", () => { const i = flow.indexOf(1); go(flow[i + 1]); });
      }

      else if (step === 2) {
        html += '<h2 class="modal-title">注册账号</h2><p class="modal-sub">创建作品前，先注册一个账号。</p>' +
          '<div class="field"><label>昵称</label><input class="input js-nickname" type="text" placeholder="例如：陈同学" value="' + escapeHtml(d.nickname) + '"></div>' +
          '<div class="field"><label>密码</label><input class="input js-password" type="password" placeholder="至少 10 位"></div>' +
          '<div class="field"><label>大学几年级</label><select class="select js-grade">' + gradeOptions(d.grade) + '</select></div>' +
          '<p class="form-error js-reg-error" hidden></p>' +
          '<p class="form-note note-center"><button class="link-btn" type="button" data-login>已有账号？直接登录</button></p>' +
          '<p class="form-note note-center auth-legal">继续使用即表示你同意 <a href="terms.html" target="_blank" rel="noopener">用户协议</a> 与 <a href="privacy.html" target="_blank" rel="noopener">隐私政策</a>。</p>' +
          '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-prev>上一步</button><button class="btn btn-primary" type="button" data-next>注册并继续</button></div>';
        showModal(html, true);
        const box = modalContent;
        box.querySelector("[data-prev]").addEventListener("click", () => go(1));
        box.querySelector("[data-login]").addEventListener("click", () => openAuthModal({ mode: "login", nickname: box.querySelector(".js-nickname").value.trim(), onDone: () => go(3) }));
        box.querySelector("[data-next]").addEventListener("click", async () => {
          const nickname = box.querySelector(".js-nickname").value.trim();
          const password = box.querySelector(".js-password").value;
          const grade = box.querySelector(".js-grade").value;
          const err = box.querySelector(".js-reg-error");
          if (!nickname) { err.textContent = "请填写昵称"; err.hidden = false; return; }
          if (password.length < 10) { err.textContent = "密码至少需要 10 位"; err.hidden = false; return; }
          const btn = box.querySelector("[data-next]");
          btn.disabled = true; btn.textContent = "正在注册…";
          try {
            const res = await Store.register({ nickname: nickname, password: password, grade: grade, directions: d.directions });
            state.user = res.user; state.token = ""; saveSession();
            ensureSse();
            d.nickname = nickname; d.grade = grade;
            await loadPrivateData();
            go(3);
          } catch (e) {
            btn.disabled = false; btn.textContent = "注册并继续";
            err.textContent = e.message || "注册失败"; err.hidden = false;
          }
        });
      }

      else {
        html += '<h2 class="modal-title">创建作品</h2><p class="modal-sub">作品名称不能重复；创建后会生成一个专属作品编号。</p>';
        if (logged) html += '<p class="form-note">将使用你当前账号发布：<strong>' + escapeHtml(state.user.nickname) + '</strong>（无需再次注册）</p>';
        html += '<div class="field"><label>作品名称</label><input class="input js-title" type="text" placeholder="例如：校园智能垃圾分类系统" value="' + escapeHtml(d.title) + '"></div>' +
          '<div class="field"><label>作品简介</label><textarea class="textarea js-desc" placeholder="简单说说这个作品想做什么">' + escapeHtml(d.desc) + '</textarea></div>' +
          '<div class="field"><label>组内氛围</label><input class="input js-vibe" type="text" maxlength="60" placeholder="例如：轻松但高效，每周一次线上同步" value="' + escapeHtml(d.vibe) + '"></div>' +
          '<div class="form-row"><div class="field"><label>需要人数（含负责人）</label><input class="input js-limit" type="number" min="2" max="50" value="' + d.limit + '"></div><div class="field"><label>讨论类型</label><input class="input" type="text" value="' + (d.type === "private" ? "私密讨论" : "公开讨论") + '" readonly></div></div>' +
          '<div class="field"><label>需要的成员标签（可多选）</label></div><div class="chip-grid" data-roles>';
        ROLE_TAGS.forEach((t) => { html += '<button class="chip' + (d.neededRoles.indexOf(t) >= 0 ? " is-on" : "") + '" type="button" data-role-tag="' + t + '">' + t + '</button>'; });
        html += '</div><p class="wizard-hint js-role-hint hint-left">已选 ' + d.neededRoles.length + ' 个标签' + (d.neededRoles.length ? '：' + escapeHtml(d.neededRoles.join("、")) : '（可以不选，也可以随时修改）') + '</p>';
        if (d.type === "public") {
          html += '<div class="field mt-18"><label>申请加入所需的作品方向（可多选，最多 5 个）</label></div><div class="major-grid">';
          MAJORS.forEach((m) => { html += '<button class="major-chip' + (d.required.indexOf(m.id) >= 0 ? " is-on" : "") + '" type="button" data-req="' + m.id + '">' + faIcon(m.icon, "mj-icon-img") + m.label + '</button>'; });
          html += '</div>';
        } else {
          html += '<div class="field mt-18"><label>加入密码（6 位数字）</label><input class="input input-code js-code" type="password" inputmode="numeric" maxlength="6" placeholder="000000" value="' + escapeHtml(d.code) + '"></div><p class="form-note">同学申请加入时需要输入这 6 位密码。</p>';
        }
        html += '<p class="form-error js-create-error" hidden></p><div class="wizard-foot"><button class="btn btn-quiet" type="button" data-prev>上一步</button><button class="btn btn-primary" type="button" data-next>创建作品</button></div>';
        showModal(html, true);
        const box = modalContent;
        const roleHint = box.querySelector(".js-role-hint");
        box.querySelectorAll("[data-role-tag]").forEach((b) => b.addEventListener("click", () => {
          const tag = b.getAttribute("data-role-tag");
          if (d.neededRoles.indexOf(tag) >= 0) d.neededRoles = d.neededRoles.filter((x) => x !== tag);
          else d.neededRoles.push(tag);
          b.classList.toggle("is-on", d.neededRoles.indexOf(tag) >= 0);
          b.setAttribute("aria-pressed", String(d.neededRoles.indexOf(tag) >= 0));
          if (roleHint) roleHint.textContent = "已选 " + d.neededRoles.length + " 个标签" + (d.neededRoles.length ? "：" + d.neededRoles.join("、") : "（可以不选，也可以随时修改）");
        }));
        if (d.type === "public") {
          box.querySelectorAll("[data-req]").forEach((b) => b.addEventListener("click", () => {
            const id = b.getAttribute("data-req");
            if (d.required.indexOf(id) >= 0) d.required = d.required.filter((x) => x !== id);
            else if (d.required.length < 5) d.required.push(id);
            else { showToast("最多选择 5 个方向"); return; }
            b.classList.toggle("is-on", d.required.indexOf(id) >= 0);
          }));
        } else {
          const codeInput = box.querySelector(".js-code");
          codeInput.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 6); });
        }
        box.querySelector("[data-prev]").addEventListener("click", () => go(flow[flow.indexOf(3) - 1]));
        box.querySelector("[data-next]").addEventListener("click", async () => {
          const title = box.querySelector(".js-title").value.trim();
          const desc = box.querySelector(".js-desc").value.trim();
          const vibe = box.querySelector(".js-vibe").value.trim();
          const limit = parseInt(box.querySelector(".js-limit").value, 10);
          const err = box.querySelector(".js-create-error");
          const code = d.type === "private" ? box.querySelector(".js-code").value : "";
          if (!title) { err.textContent = "请填写作品名称"; err.hidden = false; return; }
          if (!limit || limit < 2 || limit > 50) { err.textContent = "人数限制需要在 2 到 50 之间"; err.hidden = false; return; }
          if (d.type === "public" && !d.required.length) { err.textContent = "请至少选择一个申请加入所需的方向"; err.hidden = false; return; }
          if (d.type === "private" && !/^[0-9]{6}$/.test(code)) { err.textContent = "请设置 6 位数字加入密码"; err.hidden = false; return; }
          const btn = box.querySelector("[data-next]");
          btn.disabled = true; btn.textContent = "正在创建…";
          try {
            await Store.createTopic({ title: title, desc: desc, vibe: vibe, directions: d.directions, required: d.required, neededRoles: d.neededRoles, type: d.type, password: code, limit: limit });
            await refreshTopicList();
            hideModal();
            showPlaza();
            showToast("作品已创建，作品编号已生成");
          } catch (e) {
            btn.disabled = false; btn.textContent = "创建作品";
            err.textContent = e.message || "创建失败"; err.hidden = false;
          }
        });
      }
    }
    render(0);
  }

  /* ================= 作品成员流程 ================= */
  function openMemberFlow() {
    const d = { directions: [], mode: null, nickname: "", password: "", grade: GRADES[0] };
    const steps = ["擅长方向", "访问方式", "注册 / 登录"];

    function mount(step) {
      let html = '<div class="wizard-steps">' + steps.map((s, i) => '<div class="wizard-dot' + (i <= step ? " is-active" : "") + '"></div>').join("") + '</div>';

      if (step === 0) {
        html += '<h2 class="modal-title">你擅长或愿意学习哪些方向？</h2><p class="modal-sub">可多选，最多 3 个。哪怕现在还需要学习，也可以先选上。</p><div class="major-grid">';
        MAJORS.forEach((m) => { html += '<button class="major-chip' + (d.directions.indexOf(m.id) >= 0 ? " is-on" : "") + '" type="button" data-major="' + m.id + '">' + faIcon(m.icon, "mj-icon-img") + m.label + '</button>'; });
        html += '</div><p class="wizard-hint">已选 ' + d.directions.length + ' / 3</p><div class="wizard-foot"><button class="btn btn-primary btn-full" type="button" data-next' + (d.directions.length ? "" : " disabled") + '>下一步</button></div>';
        showModal(html, true);
        const box = modalContent, hint = box.querySelector(".wizard-hint"), next = box.querySelector("[data-next]");
        box.querySelectorAll("[data-major]").forEach((b) => b.addEventListener("click", () => {
          const id = b.getAttribute("data-major");
          if (d.directions.indexOf(id) >= 0) d.directions = d.directions.filter((x) => x !== id);
          else if (d.directions.length < 3) d.directions.push(id);
          else { showToast("最多选择 3 个方向"); return; }
          b.classList.toggle("is-on", d.directions.indexOf(id) >= 0);
          hint.textContent = "已选 " + d.directions.length + " / 3";
          next.disabled = d.directions.length === 0;
        }));
        next.addEventListener("click", () => mount(1));
      }

      else if (step === 1) {
        html += '<h2 class="modal-title">如何访问讨论广场？</h2><p class="modal-sub">所有同学都能搜索作品；只有登录用户才能申请加入和聊天。</p><div class="choice-grid">' +
          '<button class="choice-card' + (d.mode === "visitor" ? " is-on" : "") + '" type="button" data-mode="visitor"><span class="choice-icon">' + faIcon("eyes", "choice-icon-img") + '</span><h4>游客访问</h4><p>先逛逛、搜索作品，但不能申请加入。</p></button>' +
          '<button class="choice-card' + (d.mode === "member" ? " is-on" : "") + '" type="button" data-mode="member"><span class="choice-icon">' + faIcon("check-mark-button", "choice-icon-img") + '</span><h4>登录 / 注册</h4><p>可以申请加入作品，和团队一起聊天。</p></button>' +
          '</div><p class="wizard-hint" data-mode-hint>' + (d.mode ? "已选择：" + (d.mode === "visitor" ? "游客访问" : "登录 / 注册") : "请选择访问方式") + '</p>' +
          '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-prev>上一步</button><button class="btn btn-primary" type="button" data-next' + (d.mode ? "" : " disabled") + '>' + (d.mode === "visitor" ? "进入广场" : "下一步") + '</button></div>';
        showModal(html, true);
        const box = modalContent, hint = box.querySelector("[data-mode-hint]"), next = box.querySelector("[data-next]");
        box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
          d.mode = b.getAttribute("data-mode");
          box.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("is-on", x === b));
          hint.textContent = "已选择：" + (d.mode === "visitor" ? "游客访问" : "登录 / 注册");
          next.disabled = false;
          next.textContent = d.mode === "visitor" ? "进入广场" : "下一步";
        }));
        box.querySelector("[data-prev]").addEventListener("click", () => mount(0));
        next.addEventListener("click", async () => {
          if (d.mode === "visitor") { finishMember(d); return; }
          if (isLogged()) { await Store.updateMe({ directions: d.directions }); state.user.directions = d.directions.slice(); saveSession(); finishMember(d); return; }
          mount(2);
        });
      }

      else {
        html += '<h2 class="modal-title">注册账号</h2><p class="modal-sub">注册后就能申请加入作品。已有账号可以直接登录。</p>' +
          '<div class="field"><label>昵称</label><input class="input js-nickname" type="text" placeholder="例如：陈同学"></div>' +
          '<div class="field"><label>密码</label><input class="input js-password" type="password" placeholder="至少 10 位"></div>' +
          '<div class="field"><label>大学几年级</label><select class="select js-grade">' + gradeOptions(d.grade) + '</select></div>' +
          '<p class="form-error js-reg-error" hidden></p>' +
          '<p class="form-note note-center"><button class="link-btn" type="button" data-login>已有账号？直接登录</button></p>' +
          '<p class="form-note note-center auth-legal">继续使用即表示你同意 <a href="terms.html" target="_blank" rel="noopener">用户协议</a> 与 <a href="privacy.html" target="_blank" rel="noopener">隐私政策</a>。</p>' +
          '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-prev>上一步</button><button class="btn btn-primary" type="button" data-next>注册并进入广场</button></div>';
        showModal(html, true);
        const box = modalContent;
        box.querySelector("[data-prev]").addEventListener("click", () => mount(1));
        box.querySelector("[data-login]").addEventListener("click", () => openAuthModal({ mode: "login", onDone: () => finishMember(d) }));
        box.querySelector("[data-next]").addEventListener("click", async () => {
          const nickname = box.querySelector(".js-nickname").value.trim();
          const password = box.querySelector(".js-password").value;
          const grade = box.querySelector(".js-grade").value;
          const err = box.querySelector(".js-reg-error");
          if (!nickname) { err.textContent = "请填写昵称"; err.hidden = false; return; }
          if (password.length < 10) { err.textContent = "密码至少需要 10 位"; err.hidden = false; return; }
          const btn = box.querySelector("[data-next]");
          btn.disabled = true; btn.textContent = "正在注册…";
          try {
            const res = await Store.register({ nickname: nickname, password: password, grade: grade, directions: d.directions });
            state.user = res.user; state.token = ""; saveSession();
            await loadPrivateData();
            finishMember(d);
          } catch (e) {
            btn.disabled = false; btn.textContent = "注册并进入广场";
            err.textContent = e.message || "注册失败"; err.hidden = false;
          }
        });
      }
    }

    function finishMember() {
      hideModal();
      showPlaza();
      if (d.mode !== "visitor") ensureSse();
      showToast(d.mode === "visitor" ? "已进入讨论广场（游客模式）" : "欢迎来到讨论广场");
    }

    mount(0);
  }

  /* ================= 打开作品 / 申请加入 ================= */
  async function refreshTopicList() {
    try { const r = await Store.topics(); state.topics = r.topics || []; renderTopicGrid(); } catch (e) {}
  }

  async function handleOpenTopic(topicId) {
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) return;
    if (isMember(topic)) { openChat(topicId); return; }
    if (!isLogged()) { showToast("请先登录再申请加入"); openAuthModal({ mode: "register", onDone: () => handleOpenTopic(topicId) }); return; }
    if (topic.members.length >= topic.limit) { showToast("该作品已经满员"); return; }
    if (myAppStatus(topicId) === "pending") { showToast("申请已提交，正在等待负责人确认"); return; }
    openApplyModal(topic);
  }

  function openCancelApplicationModal(topic) {
    showModal('<h2 class="modal-title">取消加入申请？</h2><p class="modal-sub">取消后，负责人将不再看到你的待处理申请。冷却结束后可以重新申请。</p>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>继续等待</button><button class="btn btn-danger" type="button" data-confirm>确认取消</button></div>', true);
    const box = modalContent;
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-confirm]").addEventListener("click", async () => {
      try {
        await Store.cancelApplication(topic.id);
        await loadPrivateData();
        await refreshTopicList();
        hideModal();
        showToast("已取消加入申请");
      } catch (e) {
        showToast(e.message || "取消失败");
      }
    });
  }

  function openApplyModal(topic) {
    const privateTopic = topic.type === "private";
    showModal(
      '<h2 class="modal-title">申请加入作品</h2>' +
      '<p class="modal-sub">你的申请会以私信的形式发送给「' + escapeHtml(topic.members[0] ? topic.members[0].nickname : "负责人") + '」，由负责人决定是否通过。</p>' +
      '<div class="apply-card"><strong>' + escapeHtml(topic.title) + '</strong><span>' + escapeHtml(topicDirectionLabel(topic)) + '</span><span>组内氛围：' + escapeHtml(topic.vibe || "未填写") + '</span></div>' +
      (privateTopic ? '<div class="field"><label>加入密码（6 位数字）</label><input class="input input-code js-code" type="password" inputmode="numeric" maxlength="6" placeholder="000000"></div>' : '') +
      '<div class="field"><label>给负责人的留言（可选）</label><textarea class="textarea js-message" placeholder="简单介绍一下你的方向、能做什么，或者想在这个作品里学到什么"></textarea></div>' +
      '<p class="form-error js-error" hidden></p>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-primary" type="button" data-submit>发送申请</button></div>', true);
    const box = modalContent;
    const codeInput = box.querySelector(".js-code");
    if (codeInput) codeInput.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 6); });
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-submit]").addEventListener("click", async () => {
      const err = box.querySelector(".js-error");
      const code = codeInput ? codeInput.value : "";
      if (privateTopic && !/^[0-9]{6}$/.test(code)) { err.textContent = "请输入 6 位数字密码"; err.hidden = false; return; }
      const btn = box.querySelector("[data-submit]");
      btn.disabled = true; btn.textContent = "正在发送…";
      try {
        await Store.apply(topic.id, { password: code, message: box.querySelector(".js-message").value.trim() });
        await loadPrivateData();
        await refreshTopicList();
        hideModal();
        showToast("申请已发送，等待负责人确认");
      } catch (e) {
        btn.disabled = false; btn.textContent = "发送申请";
        err.textContent = e.message || "申请失败"; err.hidden = false;
      }
    });
  }

  /* ================= 删除作品 ================= */
  function openDeleteModal(topic) {
    if (!isLeader(topic)) { showToast("只有作品负责人或管理员才能删除该作品"); return; }
    showModal(
      '<h2 class="modal-title">确认删除这个作品？</h2>' +
      '<p class="modal-sub">「' + escapeHtml(topic.title) + '」删除后，讨论内的聊天记录、成员和文件都会被一并移除，且无法恢复。</p>' +
      '<p class="form-note">作品编号：<span class="mono">' + escapeHtml(topic.code || "—") + '</span></p>' +
      '<label class="confirm-check"><input type="checkbox" class="js-confirm"><span>我确认要删除这个作品，并知道<strong>删除后无法恢复</strong>。</span></label>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-danger" type="button" data-confirm disabled>确认删除</button></div>', true);
    const box = modalContent;
    const check = box.querySelector(".js-confirm");
    const confirmBtn = box.querySelector("[data-confirm]");
    check.addEventListener("change", () => { confirmBtn.disabled = !check.checked; });
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    confirmBtn.addEventListener("click", async () => {
      if (!check.checked) return;
      confirmBtn.disabled = true; confirmBtn.textContent = "正在删除…";
      try {
        await Store.deleteTopic(topic.id);
        await refreshTopicList();
        if (currentTopicId === topic.id) showPlaza();
        hideModal();
        showToast("作品已删除");
      } catch (e) {
        confirmBtn.disabled = false; confirmBtn.textContent = "确认删除";
        showToast(e.message || "删除失败");
      }
    });
  }

  /* ================= 消息中心（私信） ================= */
  async function openInboxModal() {
    if (!isLogged()) { openAuthModal({ mode: "login" }); return; }
    showModal('<h2 class="modal-title">消息中心</h2><p class="modal-sub">同学申请加入你的作品时，会在这里以私信的形式出现。</p><div data-inbox-body><p class="modal-sub">正在加载…</p></div>', true);
    await loadPrivateData();
    renderHeader();
    renderInboxBody();
  }

  function renderInboxBody() {
    const box = modalContent.querySelector("[data-inbox-body]");
    if (!box) return;
    const list = state.inbox.slice().sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.createdAt - a.createdAt);
    if (!list.length) {
      box.innerHTML = '<div class="empty-inbox">暂时没有收到申请。<br>等你的作品有人申请时，这里会出现他们的私信。</div>';
      return;
    }
    box.innerHTML = '<ul class="msg-list">' + list.map((a) => {
      const statusHtml = a.status === "pending"
        ? '<div class="msg-actions"><button class="btn btn-primary btn-small" data-approve="' + a.id + '">欢迎加入</button><button class="btn btn-quiet btn-small" data-reject="' + a.id + '">暂不考虑</button></div>'
        : '<div class="msg-status ' + (a.status === "approved" ? "is-ok" : "is-no") + '">' + (a.status === "approved" ? "已同意加入" : "已婉拒") + '</div>';
      return '<li class="msg-row">' +
        '<span class="msg-avatar">' + escapeHtml((a.nickname || "同").slice(0, 1)) + '</span>' +
        '<div class="msg-body">' +
          '<div class="msg-head"><strong>' + escapeHtml(a.nickname) + '</strong><span class="msg-sub">' + escapeHtml(a.grade || "") + ' · ' + formatDate(a.createdAt) + '</span></div>' +
          '<p class="msg-text">申请加入《' + escapeHtml(a.topicTitle || "作品") + '》</p>' +
          (a.message ? '<p class="msg-quote">留言：' + escapeHtml(a.message) + '</p>' : '') +
          statusHtml +
        '</div></li>';
    }).join("") + '</ul>';

    box.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => decideApplication(b.getAttribute("data-approve"), "approve")));
    box.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => decideApplication(b.getAttribute("data-reject"), "reject")));
  }

  async function decideApplication(appId, action) {
    try {
      await Store.decide(appId, action);
      await loadPrivateData();
      await refreshTopicList();
      renderHeader();
      renderInboxBody();
      showToast(action === "approve" ? "已同意对方加入作品" : "已婉拒这次申请");
    } catch (e) { showToast(e.message || "操作失败"); }
  }

  /* ================= 管理员后台 ================= */
  function openAdminPanel() {
    if (!isAdmin()) { showToast("需要管理员权限"); return; }
    const tabs = [["stats", "概览"], ["users", "用户"], ["projects", "作品"], ["announcements", "公告"], ["reports", "举报"], ["appeals", "申诉"], ["penalties", "处罚"], ["files", "文件"], ["logs", "日志"]];
    showModal('<h2 class="modal-title">管理中心</h2><p class="modal-sub">管理员可以处理公告、账号、作品、举报与安全记录。</p>' +
      '<div class="auth-tabs admin-tabs">' + tabs.map((t, i) => '<button class="auth-tab' + (i === 0 ? " is-on" : "") + '" type="button" data-tab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>' +
      '<div data-admin-body><p class="modal-sub">正在加载…</p></div>', true);
    const box = modalContent;
    box.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      box.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("is-on", x === b));
      renderAdmin(b.getAttribute("data-tab"));
    }));
    renderAdmin("stats");
  }

  async function renderAdmin(tab) {
    const box = modalContent.querySelector("[data-admin-body]");
    if (!box) return;
    box.innerHTML = '<p class="modal-sub">正在加载…</p>';
    try {
      if (tab === "stats") {
        const r = await Store.adminStats();
        const s = r.stats || {};
        const items = [["注册用户", s.users], ["作品讨论", s.topics], ["聊天消息", s.messages], ["共享文件", s.files], ["待处理举报", s.reportsOpen], ["待处理申诉", s.appealsOpen], ["已发布公告", s.announcementsPublished], ["审计日志", s.auditLogs]];
        box.innerHTML = '<div class="admin-stats">' + items.map((x) => '<div class="admin-stat"><strong>' + Number(x[1] || 0) + '</strong><span>' + x[0] + '</span></div>').join("") + '</div>';
      } else if (tab === "users") {
        const r = await Store.adminUsers();
        box.innerHTML = '<ul class="admin-list">' + (r.users || []).map((u) => {
          const muted = Boolean(u.muted) || (u.penalties || []).some((p) => p.type === "mute" && p.active);
          const actions = u.role === "admin" ? '<span class="admin-meta">管理员账号</span>' : '<button class="btn btn-quiet btn-small" data-mute="' + u.id + '" data-muted="' + (muted ? "1" : "0") + '">' + (muted ? "解除禁言" : "禁言") + '</button><button class="btn ' + (u.banned ? "btn-ghost" : "btn-danger") + ' btn-small" data-ban="' + u.id + '" data-banned="' + (u.banned ? "1" : "0") + '">' + (u.banned ? "解封" : "封禁") + '</button>';
          return '<li class="admin-row"><span class="m-avatar">' + escapeHtml((u.nickname || "用").slice(0, 1)) + '</span>' +
            '<span class="admin-name">' + escapeHtml(u.nickname || "用户") + '<em>' + escapeHtml(u.grade || "") + ' · ' + (u.role === "admin" ? "管理员" : "普通用户") + (u.banned ? " · 已封禁" : "") + (muted ? " · 已禁言" : "") + '</em></span>' +
            '<span class="admin-meta">' + Number(u.topicCount || 0) + ' 个作品</span>' + actions + '</li>';
        }).join("") + '</ul>';
        box.querySelectorAll("[data-ban]").forEach((b) => b.addEventListener("click", async () => {
          const banned = b.getAttribute("data-banned") === "1";
          try {
            await Store.adminBan(b.getAttribute("data-ban"), !banned);
            renderAdmin("users");
            showToast(!banned ? "已封禁该账号" : "已解封该账号");
          } catch (e) { showToast(e.message || "操作失败"); }
        }));
        box.querySelectorAll("[data-mute]").forEach((b) => b.addEventListener("click", async () => {
          const muted = b.getAttribute("data-muted") === "1";
          try {
            await Store.adminMute(b.getAttribute("data-mute"), !muted);
            renderAdmin("users");
            showToast(!muted ? "已禁言该账号" : "已解除禁言");
          } catch (e) { showToast(e.message || "操作失败"); }
        }));
      } else if (tab === "announcements") {
        const r = await Store.adminAnnouncements();
        const list = r.announcements || [];
        box.innerHTML = '<div class="admin-form"><div class="field"><label>标题</label><input class="input js-ann-title" maxlength="100" placeholder="例如：平台维护通知"></div>' +
          '<div class="field"><label>内容</label><textarea class="input admin-textarea js-ann-content" maxlength="5000" placeholder="填写公告正文"></textarea></div>' +
          '<div class="admin-form-row"><label>状态<select class="select js-ann-status"><option value="draft">草稿</option><option value="published">立即发布</option></select></label>' +
          '<label>级别<select class="select js-ann-importance"><option value="normal">普通</option><option value="important">重要</option><option value="security">安全</option><option value="policy">政策</option></select></label>' +
          '<label class="confirm-check"><input type="checkbox" class="js-ann-pinned"><span>置顶</span></label><button class="btn btn-primary btn-small" data-ann-create>创建公告</button></div></div>' +
          (list.length ? '<ul class="admin-list">' + list.map((a) => '<li class="admin-row"><span class="admin-name">' + escapeHtml(a.title) + '<em>' + escapeHtml(ANNOUNCEMENT_STATUS_LABELS[a.status] || a.status || "草稿") + ' · ' + escapeHtml(a.importance || "normal") + ' · ' + formatDate(a.createdAt) + '</em></span>' +
            (a.status === "published" ? '<button class="btn btn-quiet btn-small" data-ann-withdraw="' + a.id + '">撤回</button>' : '<button class="btn btn-primary btn-small" data-ann-publish="' + a.id + '">发布</button>') +
            '<button class="btn btn-danger btn-small" data-ann-delete="' + a.id + '">归档</button></li>').join("") + '</ul>' : '<div class="empty-inbox">暂无公告。</div>');
        box.querySelector("[data-ann-create]").addEventListener("click", async () => {
          const payload = {
            title: box.querySelector(".js-ann-title").value.trim(),
            content: box.querySelector(".js-ann-content").value.trim(),
            status: box.querySelector(".js-ann-status").value,
            importance: box.querySelector(".js-ann-importance").value,
            pinned: box.querySelector(".js-ann-pinned").checked
          };
          try { await Store.adminCreateAnnouncement(payload); renderAdmin("announcements"); showToast("公告已创建"); }
          catch (e) { showToast(e.message || "创建失败"); }
        });
        box.querySelectorAll("[data-ann-publish]").forEach((b) => b.addEventListener("click", async () => {
          try { await Store.adminUpdateAnnouncement(b.getAttribute("data-ann-publish"), { status: "published" }); renderAdmin("announcements"); showToast("公告已发布"); }
          catch (e) { showToast(e.message || "发布失败"); }
        }));
        box.querySelectorAll("[data-ann-withdraw]").forEach((b) => b.addEventListener("click", async () => {
          try { await Store.adminUpdateAnnouncement(b.getAttribute("data-ann-withdraw"), { status: "withdrawn" }); renderAdmin("announcements"); showToast("公告已撤回"); }
          catch (e) { showToast(e.message || "撤回失败"); }
        }));
        box.querySelectorAll("[data-ann-delete]").forEach((b) => b.addEventListener("click", async () => {
          if (!window.confirm("确认归档这条公告？")) return;
          try { await Store.adminDeleteAnnouncement(b.getAttribute("data-ann-delete")); renderAdmin("announcements"); showToast("公告已归档"); }
          catch (e) { showToast(e.message || "归档失败"); }
        }));
      } else if (tab === "reports") {
        const r = await Store.adminReports();
        const list = r.reports || [];
        box.innerHTML = list.length ? '<ul class="admin-list">' + list.map((rep) =>
          '<li class="admin-row"><span class="admin-name">' + escapeHtml(rep.reason) + '<em>' + escapeHtml((rep.topicTitle || "（无关联作品）")) + ' · 举报人：' + escapeHtml(rep.reporterName || "") + ' · ' + formatDate(rep.createdAt) + (rep.status === "resolved" ? " · 已处理（" + escapeHtml(rep.handledBy || "") + "）" : "") + '</em></span>' +
          (rep.detail ? '<span class="admin-meta">' + escapeHtml(rep.detail.slice(0, 60)) + '</span>' : "") +
          (rep.status === "open" ? '<button class="btn btn-primary btn-small" data-resolve="' + rep.id + '">标记已处理</button><button class="btn btn-quiet btn-small" data-dismiss="' + rep.id + '">忽略</button>' : "") +
          '</li>').join("") + '</ul>' : '<div class="empty-inbox">暂无举报记录。</div>';
        box.querySelectorAll("[data-resolve]").forEach((b) => b.addEventListener("click", async () => {
          try { await Store.resolveReport(b.getAttribute("data-resolve"), { action: "resolve" }); renderAdmin("reports"); showToast("已标记为处理完成"); }
          catch (e) { showToast(e.message || "操作失败"); }
        }));
        box.querySelectorAll("[data-dismiss]").forEach((b) => b.addEventListener("click", async () => {
          try { await Store.resolveReport(b.getAttribute("data-dismiss"), { action: "dismiss" }); renderAdmin("reports"); showToast("已忽略该举报"); }
          catch (e) { showToast(e.message || "操作失败"); }
        }));
      } else if (tab === "appeals") {
        const r = await Store.adminAppeals();
        const list = r.appeals || [];
        box.innerHTML = list.length ? '<ul class="admin-list">' + list.map((a) => '<li class="admin-row"><span class="admin-name">' + escapeHtml(a.nickname || "用户") + '：' + escapeHtml(a.reason) + '<em>' + escapeHtml(a.penaltyType === "ban" ? "封禁申诉" : "禁言申诉") + ' · ' + formatDate(a.createdAt) + ' · ' + (a.status === "pending" ? "待处理" : "已处理") + '</em></span>' +
          (a.status === "pending" ? '<button class="btn btn-primary btn-small" data-appeal-ok="' + a.id + '">通过</button><button class="btn btn-quiet btn-small" data-appeal-no="' + a.id + '">驳回</button>' : "") + '</li>').join("") + '</ul>' : '<div class="empty-inbox">暂无申诉。</div>';
        box.querySelectorAll("[data-appeal-ok], [data-appeal-no]").forEach((b) => b.addEventListener("click", async () => {
          const ok = b.hasAttribute("data-appeal-ok");
          const id = b.getAttribute(ok ? "data-appeal-ok" : "data-appeal-no");
          try { await Store.adminResolveAppeal(id, { decision: ok ? "approved" : "rejected", result: ok ? "管理员已通过申诉" : "管理员已驳回申诉" }); renderAdmin("appeals"); showToast("申诉已处理"); }
          catch (e) { showToast(e.message || "处理失败"); }
        }));
      } else if (tab === "penalties") {
        const r = await Store.adminPenalties();
        const list = r.penalties || [];
        box.innerHTML = list.length ? '<ul class="admin-list">' + list.map((p) => '<li class="admin-row"><span class="admin-name">' + escapeHtml(p.reason || "未填写原因") + '<em>' + escapeHtml(p.type === "ban" ? "封禁" : "禁言") + ' · ' + escapeHtml(p.createdByName || "") + ' · ' + formatDate(p.createdAt) + ' · ' + (p.active ? "生效中" : "已结束") + '</em></span>' +
          (p.active ? '<button class="btn btn-ghost btn-small" data-revoke="' + p.id + '">撤销</button>' : "") + '</li>').join("") + '</ul>' : '<div class="empty-inbox">暂无处罚记录。</div>';
        box.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
          try { await Store.adminRevokePenalty(b.getAttribute("data-revoke")); renderAdmin("penalties"); showToast("处罚已撤销"); }
          catch (e) { showToast(e.message || "撤销失败"); }
        }));
      } else if (tab === "files") {
        const r = await Store.adminFiles();
        const list = r.files || [];
        box.innerHTML = list.length ? '<ul class="admin-list">' + list.map((f) => '<li class="admin-row"><span class="admin-name">' + escapeHtml(f.name) + '<em>' + escapeHtml(f.topicTitle || "未知作品") + ' · ' + escapeHtml(f.uploaderName || "") + ' · ' + formatSize(f.size) + '</em></span><button class="btn btn-danger btn-small" data-file-delete="' + f.id + '">删除文件</button></li>').join("") + '</ul>' : '<div class="empty-inbox">暂无共享文件。</div>';
        box.querySelectorAll("[data-file-delete]").forEach((b) => b.addEventListener("click", async () => {
          if (!window.confirm("确认删除这个文件？删除后无法恢复。")) return;
          try { await Store.adminDeleteFile(b.getAttribute("data-file-delete")); renderAdmin("files"); showToast("文件已删除"); }
          catch (e) { showToast(e.message || "删除失败"); }
        }));
      } else if (tab === "logs") {
        const r = await Store.adminAudit();
        const logs = r.logs || [];
        box.innerHTML = logs.length ? '<ul class="admin-list admin-log-list">' + logs.map((x) => '<li class="admin-row"><span class="admin-name">' + escapeHtml(x.action || "操作") + '<em>' + escapeHtml(x.targetType || "") + ' ' + escapeHtml(x.targetId || "") + ' · ' + formatDate(x.at) + '</em></span><span class="admin-meta">' + escapeHtml(x.actorName || x.actorId || "") + '</span></li>').join("") + '</ul>' : '<div class="empty-inbox">暂无审计日志。</div>';
      } else {
        const r = await Store.adminTopics();
        const topics = r.topics || [];
        box.innerHTML = topics.length ? '<ul class="admin-list">' + topics.map((t) =>
          '<li class="admin-row"><span class="admin-name">' + escapeHtml(t.title) + '<em>' + escapeHtml(t.type === "private" ? "私密讨论" : "公开讨论") + ' · 编号 ' + escapeHtml(t.code || "—") + ' · ' + Number(t.memberCount || 0) + '/' + Number(t.limit || 0) + ' 人 · ' + escapeHtml(PROJECT_STATUS_LABELS[t.status] || t.status || "招集中") + '</em></span>' +
          '<button class="btn btn-danger btn-small" data-admin-delete="' + t.id + '">删除作品</button></li>').join("") + '</ul>'
          : '<div class="empty-inbox">现在还没有任何作品。</div>';
        box.querySelectorAll("[data-admin-delete]").forEach((b) => b.addEventListener("click", () => {
          const topic = topics.find((t) => t.id === b.getAttribute("data-admin-delete"));
          if (topic) openDeleteModal(topic);
        }));
      }
    } catch (e) { box.innerHTML = '<p class="form-error">' + escapeHtml(e.message || "加载失败") + '</p>'; }
  }

  /* ================= 视图切换 ================= */
  function showPlaza() {
    currentTopicId = null;
    window.currentProjectId = null;
    state.replyTo = null;
    const side = $("#chat-side");
    if (side) side.classList.remove("is-open");
    const picker = $("#mention-picker");
    if (picker) picker.hidden = true;
    $("#view-plaza").hidden = false;
    $("#view-chat").hidden = true;
    renderPlaza();
    if (window.ProjectHubAgent) window.ProjectHubAgent.init({ projectId: null });
  }

  async function openChat(topicId) {
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) return;
    currentTopicId = topicId;
    window.currentProjectId = topicId;
    state.replyTo = null;
    const side = $("#chat-side");
    if (side) side.classList.remove("is-open");
    const picker = $("#mention-picker");
    if (picker) picker.hidden = true;
    $("#view-plaza").hidden = true;
    $("#view-chat").hidden = false;
    await Promise.all([loadMessages(topicId), loadFiles(topicId)]);
    renderChat(topicId);
    if (window.ProjectHubAgent) window.ProjectHubAgent.init({ projectId: topicId });
  }

  async function loadMessages(topicId) {
    try { const r = await Store.messages(topicId); state.messages[topicId] = r.messages || []; } catch (e) { state.messages[topicId] = state.messages[topicId] || []; }
  }
  async function loadFiles(topicId) {
    try { const r = await Store.files(topicId); state.files[topicId] = r.files || []; } catch (e) { state.files[topicId] = state.files[topicId] || []; }
  }

  /* ================= 聊天 ================= */
  function highlightMentions(text, topic) {
    let html = escapeHtml(text || "");
    (topic.members || []).forEach((m) => {
      if (!m.nickname) return;
      const token = escapeHtml("@" + m.nickname);
      html = html.split(token).join('<span class="mention">' + token + '</span>');
    });
    return html;
  }

  function buildMessageEl(topic, m) {
    const mine = !!(state.user && m.author === state.user.id);
    const member = topic.members.find((x) => x.id === m.author);
    const name = mine ? (state.user.nickname || "我") : (m.authorName || (member ? member.nickname : "同学"));
    const role = (member && member.id === topic.creatorId) ? "负责人" : "";
    const timeText = m.at ? formatTime(m.at) : (m.time || "");
    const div = document.createElement("div");

    if (m.recalled) {
      div.className = "msg is-recalled" + (mine ? " mine" : "");
      div.innerHTML = '<div class="msg-author">' + escapeHtml(name) + '</div>' +
        '<div class="bubble">' + escapeHtml(mine ? "你撤回了一条消息" : (name + " 撤回了一条消息")) + '</div>' +
        '<div class="msg-time">' + escapeHtml(timeText) + '</div>';
      return div;
    }

    const canRecall = mine;
    const statusHtml = mine && m.pending ? '<span class="msg-status">发送中…</span>' : (mine && m.failed ? '<span class="msg-status is-failed">发送失败 <button type="button" data-act="retry" data-id="' + m.id + '">重试</button></span>' : "");
    div.className = "msg" + (mine ? " mine" : "");
    div.innerHTML =
      '<div class="msg-author">' + escapeHtml(name) +
        (member && member.tag ? " · " + escapeHtml(member.tag) : "") +
        (role ? '<span class="role">' + role + '</span>' : "") + '</div>' +
      (m.replyTo ? '<div class="msg-quote">引用 ' + escapeHtml(m.replyTo.authorName || "") + '：' + escapeHtml(m.replyTo.text || "") + '</div>' : "") +
      '<div class="bubble">' + highlightMentions(m.text, topic) + '</div>' +
      '<div class="msg-time">' + escapeHtml(timeText) + (m.edited ? " · 已编辑" : "") + statusHtml + '</div>' +
      '<div class="msg-actions">' +
        '<button type="button" data-act="quote" data-id="' + m.id + '">引用</button>' +
        '<button type="button" data-act="copy" data-id="' + m.id + '">复制</button>' +
        (mine ? '<button type="button" data-act="edit" data-id="' + m.id + '">编辑</button>' : '') +
        (canRecall ? '<button type="button" data-act="recall" data-id="' + m.id + '">撤回</button>' : '') +
      '</div>';
    return div;
  }

  async function handleMessageAction(topic, act, id) {
    const msg = (state.messages[topic.id] || []).find((x) => x.id === id);
    if (!msg) return;
    if (act === "quote") {
      state.replyTo = { id: msg.id, authorName: msg.authorName, text: (msg.text || "").slice(0, 60) };
      renderReplyBar();
      const input = $("#chat-input");
      if (input) input.focus();
    } else if (act === "copy") {
      try { await navigator.clipboard.writeText(msg.text || ""); showToast("已复制这条消息"); }
      catch (e) { showToast("复制失败，请手动选择文字复制"); }
    } else if (act === "retry") {
      retryMessage(topic, msg);
    } else if (act === "edit") {
      openEditMessageModal(topic, msg);
    } else if (act === "recall") {
      openRecallModal(topic, msg);
    }
  }

  function openEditMessageModal(topic, msg) {
    showModal('<h2 class="modal-title">编辑这条消息</h2><div class="field"><textarea class="textarea js-edit-text" maxlength="1000"></textarea></div>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-primary" type="button" data-confirm>保存修改</button></div>', true);
    const box = modalContent;
    const input = box.querySelector(".js-edit-text");
    input.value = msg.text || "";
    input.focus();
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-confirm]").addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) { showToast("消息不能为空"); return; }
      try {
        await Store.editMessage(topic.id, msg.id, text);
        await loadMessages(topic.id);
        hideModal();
        renderChat(topic.id);
        showToast("消息已更新");
      } catch (e) {
        showToast(e.message || "编辑失败");
      }
    });
  }

  function openRecallModal(topic, msg) {
    showModal('<h2 class="modal-title">撤回这条消息？</h2><p class="modal-sub">撤回后，群里所有人看到的都会变成「撤回了一条消息」。</p>' +
      '<div class="msg-quote">' + escapeHtml((msg.text || "").slice(0, 80)) + '</div>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-danger" type="button" data-confirm>确认撤回</button></div>', true);
    const box = modalContent;
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-confirm]").addEventListener("click", async () => {
      try {
        await Store.recallMessage(topic.id, msg.id);
        await loadMessages(topic.id);
        hideModal();
        renderChat(topic.id);
        showToast("已撤回");
      } catch (e) { showToast(e.message || "撤回失败"); }
    });
  }

  function renderReplyBar() {
    const bar = $("#reply-bar");
    if (!bar) return;
    if (!state.replyTo) { bar.hidden = true; bar.innerHTML = ""; return; }
    bar.hidden = false;
    bar.innerHTML = '<span>引用 <strong>' + escapeHtml(state.replyTo.authorName || "") + '</strong>：' + escapeHtml(state.replyTo.text || "") + '</span><button type="button" data-cancel-reply>×</button>';
    bar.querySelector("[data-cancel-reply]").addEventListener("click", () => { state.replyTo = null; renderReplyBar(); });
  }

  function renderMentionPicker(show) {
    const picker = $("#mention-picker");
    if (!picker) return;
    const topic = state.topics.find((t) => t.id === currentTopicId);
    if (!show || !topic) { picker.hidden = true; return; }
    const others = topic.members.filter((m) => !state.user || m.id !== state.user.id);
    picker.innerHTML = others.length
      ? others.map((m) => '<button type="button" data-mention="' + escapeHtml(m.nickname) + '">@' + escapeHtml(m.nickname) + (m.tag ? ' <span class="msg-sub">' + escapeHtml(m.tag) + '</span>' : '') + '</button>').join("")
      : '<button type="button" disabled>群里暂时没有其他成员</button>';
    picker.hidden = false;
    picker.querySelectorAll("[data-mention]").forEach((b) => b.addEventListener("click", () => {
      const input = $("#chat-input");
      input.value = (input.value ? input.value + " " : "") + "@" + b.getAttribute("data-mention") + " ";
      picker.hidden = true;
      input.focus();
    }));
  }

  function renderChat(topicId) {
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) return;
    const canManage = isLeader(topic);

    renderReplyBar();

    $("#chat-title").textContent = topic.title;
    const typeText = topic.type === "public" ? ("公开讨论 · 申请需要 " + (requiredLabels(topic) || "不限")) : "私密讨论 · 需要 6 位密码";
    const owner = topic.members.find((m) => m.id === topic.creatorId);
    $("#chat-meta").innerHTML = escapeHtml(typeText) + " · " + escapeHtml(topicDirectionLabel(topic)) + " · 负责人：" + escapeHtml(owner ? owner.nickname : "—") + " · <span class='mono'>" + topic.members.length + "/" + topic.limit + "</span>";
    const descriptionEl = $("#chat-description"); if (descriptionEl) descriptionEl.textContent = "作品简介：" + (topic.desc || "暂无简介");
    $("#chat-member-count").textContent = topic.members.length + "/" + topic.limit;

    const vibeEl = $("#chat-vibe");
    if (vibeEl) vibeEl.textContent = "组内氛围：" + (topic.vibe || "负责人还没有填写");
    const codeEl = $("#chat-code");
    if (codeEl) { if (topic.code && canManage) { codeEl.hidden = false; codeEl.textContent = "作品编号：" + topic.code; } else codeEl.hidden = true; }
    const missing = missingTags(topic);
    const rolesInfo = (topic.neededRoles || []).length
      ? ("需要角色：" + topic.neededRoles.join(" / ") + (missing.length ? "　还缺：" + missing.join(" / ") : "　角色已齐 ✓"))
      : "";
    const rolesEl = $("#chat-roles");
    if (rolesEl) { rolesEl.textContent = rolesInfo; rolesEl.hidden = !rolesInfo; }
    const status = topic.status || "recruiting";
    const statusEl = $("#chat-project-status");
    if (statusEl) statusEl.innerHTML = `作品状态：<strong class="status-pill status-${escapeHtml(status)}">${escapeHtml(PROJECT_STATUS_LABELS[status] || status)}</strong> · 创建：${escapeHtml(formatDate(topic.createdAt))} · 更新：${escapeHtml(formatDate(topic.updatedAt || topic.statusAt || topic.createdAt))}`;
    const ownerControls = $("#owner-controls");
    if (ownerControls) {
      if (!canManage) { ownerControls.hidden = true; ownerControls.innerHTML = ""; }
      else {
        const nextStatuses = PROJECT_STATUS_NEXT[status] || [];
        const transferable = topic.members.filter((m) => m.id !== topic.creatorId);
        ownerControls.hidden = false;
        ownerControls.innerHTML = '<h3 class="side-title">负责人操作</h3>' +
          (nextStatuses.length ? '<div class="owner-status-actions">' + nextStatuses.map((next) => '<button class="btn btn-quiet btn-small" type="button" data-project-status="' + next + '">设为' + escapeHtml(PROJECT_STATUS_LABELS[next] || next) + '</button>').join("") + '</div>' : '') +
          (transferable.length ? '<div class="owner-transfer"><select class="select js-owner-select"><option value="">选择新负责人</option>' + transferable.map((m) => '<option value="' + m.id + '">' + escapeHtml(m.nickname || "成员") + '</option>').join("") + '</select><button class="btn btn-danger btn-small" type="button" data-owner-transfer>转移负责人</button></div>' : '');
        ownerControls.querySelectorAll("[data-project-status]").forEach((btn) => btn.addEventListener("click", async () => {
          const next = btn.getAttribute("data-project-status");
          btn.disabled = true;
          try { await Store.setProjectStatus(topic.id, next); await refreshTopicList(); await refreshAll(); showToast("作品状态已更新为「" + (PROJECT_STATUS_LABELS[next] || next) + "」"); }
          catch (e) { btn.disabled = false; showToast(e.message || "状态更新失败"); }
        }));
        const ownerBtn = ownerControls.querySelector("[data-owner-transfer]");
        if (ownerBtn) ownerBtn.addEventListener("click", async () => {
          const select = ownerControls.querySelector(".js-owner-select");
          const userId = select && select.value;
          if (!userId) { showToast("请先选择新负责人"); return; }
          if (!window.confirm("确认将负责人转移给这位成员？转移后你将失去负责人权限。")) return;
          ownerBtn.disabled = true;
          try { await Store.transferOwner(topic.id, userId); await refreshTopicList(); await refreshAll(); showToast("负责人已转移"); }
          catch (e) { ownerBtn.disabled = false; showToast(e.message || "转移失败"); }
        });
      }
    }
    const uploadWrap = $("#file-upload-wrap");
    if (uploadWrap) uploadWrap.hidden = !(isMember(topic) || isAdmin());
    const removeBtn = $("#btn-delete-topic");
    if (removeBtn) removeBtn.hidden = !canManage;

    const list = $("#member-list");
    list.innerHTML = "";
    topic.members.forEach((m, i) => {
      const li = document.createElement("li");
      li.className = "member-item";
      const tagHtml = canManage
        ? '<select class="tag-select" data-tag-member="' + m.id + '">' + tagOptions(m.tag || "") + '</select>'
        : (m.tag ? '<span class="m-tag">' + escapeHtml(m.tag) + '</span>' : "");
      li.innerHTML = '<span class="m-avatar">' + escapeHtml((m.nickname || "同").slice(0, 1)) + '</span>' +
        '<span class="member-info"><span class="m-name">' + escapeHtml(m.nickname || "同学") + (i === 0 ? '<span class="m-owner">负责人</span>' : '') + '</span>' +
        '<span class="m-grade">' + escapeHtml(m.grade || "") + '</span></span>' + tagHtml +
        (canManage && i !== 0 ? '<button class="btn btn-quiet btn-small" type="button" data-remove="' + m.id + '">移出</button>' : "");
      list.appendChild(li);
    });
    list.querySelectorAll("[data-tag-member]").forEach((sel) => {
      sel.addEventListener("change", async () => {
        try {
          await Store.setTag(topic.id, sel.getAttribute("data-tag-member"), sel.value);
          await refreshTopicList();
          renderChat(topic.id);
          showToast(sel.value ? "已设置为「" + sel.value + "」" : "已取消标签");
        } catch (e) { showToast(e.message || "设置失败"); }
      });
    });
    list.querySelectorAll("[data-remove]").forEach((b) => {
      b.addEventListener("click", () => openRemoveMemberModal(topic, b.getAttribute("data-remove")));
    });

    renderFileList(topic);
    renderTaskList(topic);
    renderResourceList(topic);
    renderActivityList(topic);
    const outcomeBtn = $("#btn-outcome"); if (outcomeBtn) { outcomeBtn.hidden = false; outcomeBtn.onclick = () => openOutcomeModal(topic); }

    const box = $("#chat-messages");
    box.innerHTML = "";
    const msgs = state.messages[topicId] || [];
    if (!msgs.length) {
      box.innerHTML = '<div class="chat-empty">还没有消息，来说第一句吧。</div>';
    } else {
      msgs.forEach((m) => box.appendChild(buildMessageEl(topic, m)));
      box.querySelectorAll("[data-act]").forEach((b) => {
        b.addEventListener("click", () => handleMessageAction(topic, b.getAttribute("data-act"), b.getAttribute("data-id")));
      });
    }
    box.scrollTop = box.scrollHeight;
  }

  function renderActivityList(topic) {
    const listEl = $("#activity-list"); if (!listEl) return;
    const items = topic.activities || [];
    listEl.innerHTML = items.length ? items.map((item) => '<li class="activity-item"><strong>' + escapeHtml(item.actorName || "系统") + '</strong><span>' + escapeHtml(item.text || "") + '</span><time>' + escapeHtml(formatDate(item.at)) + '</time></li>').join("") : '<li class="activity-empty">还没有作品动态。</li>';
  }

  function renderResourceList(topic) {
    const listEl = $("#resource-list"); if (!listEl) return;
    const items = topic.resources || [];
    listEl.innerHTML = items.length ? items.map((item) => { const body = item.kind === "link" ? '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' + escapeHtml(item.title) + '</a>' : '<strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.content || "") + '</p>'; return '<li class="resource-item">' + body + '<small>' + escapeHtml(item.creatorName || "") + ' · ' + escapeHtml(formatDate(item.createdAt)) + '</small><button class="btn btn-quiet btn-small" type="button" data-resource-delete="' + item.id + '">删除</button></li>'; }).join("") : '<li class="resource-empty">还没有笔记或链接。</li>';
    listEl.querySelectorAll("[data-resource-delete]").forEach((btn) => btn.addEventListener("click", async () => { if (!window.confirm("确认删除这条资料？")) return; try { await Store.deleteResource(topic.id, btn.getAttribute("data-resource-delete")); await refreshTopicList(); renderChat(topic.id); showToast("资料已删除"); } catch (e) { showToast(e.message || "删除失败"); } }));
  }

  function openResourceModal(topic, kind) {
    const isLink = kind === "link";
    showModal('<h2 class="modal-title">' + (isLink ? "添加外部链接" : "添加作品笔记") + '</h2><div class="field"><label>标题</label><input class="input js-resource-title" maxlength="80"></div>' + (isLink ? '<div class="field"><label>链接</label><input class="input js-resource-url" type="url" placeholder="https://"></div>' : '<div class="field"><label>内容</label><textarea class="textarea js-resource-content" maxlength="5000"></textarea></div>') + '<p class="form-error js-resource-error" hidden></p><div class="wizard-foot"><button class="btn btn-primary" type="button" data-resource-save>保存</button></div>', true);
    modalContent.querySelector("[data-resource-save]").addEventListener("click", async () => { const title = modalContent.querySelector(".js-resource-title").value.trim(); const url = isLink ? modalContent.querySelector(".js-resource-url").value.trim() : ""; const content = isLink ? "" : modalContent.querySelector(".js-resource-content").value.trim(); try { await Store.createResource(topic.id, { kind: kind, title: title, url: url, content: content }); hideModal(); await refreshTopicList(); renderChat(topic.id); showToast("资料已保存"); } catch (e) { const err = modalContent.querySelector(".js-resource-error"); err.textContent = e.message || "保存失败"; err.hidden = false; } });
  }

  function openOutcomeModal(topic) {
    const editable = isLeader(topic);
    const value = topic.outcome || {};
    const links = (value.links || []).map((x) => '<a href="' + escapeHtml(x.url || "#") + '" target="_blank" rel="noopener">' + escapeHtml(x.label || x.url || "成果链接") + '</a>').join(" · ");
    if (!editable) {
      const memberHtml = (topic.members || []).map((m) => '<li>' + escapeHtml(m.nickname || "成员") + (m.tag ? ' · ' + escapeHtml(m.tag) : "") + '</li>').join("") || '<li>暂无成员信息</li>';
      const fileItems = (state.files[topic.id] || []).map((f) => '<li>' + escapeHtml(f.name || "作品文件") + '</li>').join("") || '<li>暂无作品文件</li>';
      const outcomeText = value.final || value.process || value.summary || "暂无作品成果";
      showModal(
        '<h2 class="modal-title">作品成果</h2><p class="modal-sub">' + escapeHtml(topic.title) + '</p>' +
        '<div class="outcome-view"><h3>作品简介</h3><p>' + escapeHtml(value.summary || topic.desc || "暂无作品简介") + '</p>' +
        '<h3>团队成员</h3><ul>' + memberHtml + '</ul>' +
        '<h3>作品方向</h3><p>' + escapeHtml(topicDirectionLabel(topic) || "暂未设置研究方向") + '</p>' +
        '<h3>作品状态</h3><p>' + escapeHtml(PROJECT_STATUS_LABELS[topic.status] || topic.status || "未设置") + '</p>' +
        '<h3>作品文件</h3><ul>' + fileItems + '</ul>' +
        '<h3>作品成果</h3><p>' + escapeHtml(outcomeText) + '</p>' +
        '<h3>成果链接</h3><p>' + (links || "暂无成果链接") + '</p>' +
        '<h3>获奖信息</h3><p>' + escapeHtml(value.awards || "暂无获奖信息") + '</p></div>', true);
      return;
    }
    const linkText = (value.links || []).map((x) => x.label + ' | ' + x.url).join("\n");
    showModal('<h2 class="modal-title">编辑作品成果</h2><p class="modal-sub">没有填写的内容会保留为“暂无作品成果”。</p><div class="field"><label>作品简介</label><textarea class="textarea js-outcome-summary" maxlength="1000">' + escapeHtml(value.summary || topic.desc || "") + '</textarea></div><div class="field"><label>作品过程</label><textarea class="textarea js-outcome-process" maxlength="5000">' + escapeHtml(value.process || "") + '</textarea></div><div class="field"><label>最终成果</label><textarea class="textarea js-outcome-final" maxlength="5000">' + escapeHtml(value.final || "") + '</textarea></div><div class="field"><label>成果链接（每行：名称 | URL）</label><textarea class="textarea js-outcome-links" maxlength="5000">' + escapeHtml(linkText) + '</textarea></div><div class="field"><label>获奖信息（可选）</label><input class="input js-outcome-awards" maxlength="1000" value="' + escapeHtml(value.awards || "") + '"></div><p class="form-error js-outcome-error" hidden></p><div class="wizard-foot"><button class="btn btn-primary" type="button" data-outcome-save>保存成果</button></div>', true);
    modalContent.querySelector("[data-outcome-save]").addEventListener("click", async () => {
      const linkValues = modalContent.querySelector(".js-outcome-links").value.split("\n").map((line) => { const i = line.indexOf("|"); return i < 0 ? null : { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() }; }).filter(Boolean);
      try {
        await Store.saveOutcome(topic.id, { summary: modalContent.querySelector(".js-outcome-summary").value, process: modalContent.querySelector(".js-outcome-process").value, final: modalContent.querySelector(".js-outcome-final").value, links: linkValues, awards: modalContent.querySelector(".js-outcome-awards").value });
        hideModal(); await refreshTopicList(); const latest = state.topics.find((t) => t.id === topic.id); if (latest) renderChat(topic.id); showToast("作品成果已保存");
      } catch (e) { const err = modalContent.querySelector(".js-outcome-error"); err.textContent = e.message || "保存失败"; err.hidden = false; }
    });
  }

  function taskDateInput(value) {
    if (!value) return "";
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function openTaskModal(topic, task) {
    const editing = !!task;
    const owner = isLeader(topic);
    const assigneeId = (task && task.assigneeId) || (state.user && state.user.id) || "";
    const memberOptions = topic.members.map((m) => '<option value="' + m.id + '"' + (m.id === assigneeId ? " selected" : "") + '>' + escapeHtml(m.nickname || "成员") + '</option>').join("");
    const html = '<h2 class="modal-title">' + (editing ? "编辑任务" : "新建任务") + '</h2>' +
      '<div class="field"><label>任务标题</label><input class="input js-task-title" maxlength="80" value="' + escapeHtml(task ? task.title : "") + '" placeholder="例如：整理数据集"></div>' +
      '<div class="field"><label>任务说明</label><textarea class="textarea js-task-desc" maxlength="500" placeholder="写清楚交付内容">' + escapeHtml(task ? task.desc : "") + '</textarea></div>' +
      '<div class="form-row"><div class="field"><label>负责人</label><select class="select js-task-assignee"' + (owner ? "" : " disabled") + '>' + memberOptions + '</select></div>' +
      '<div class="field"><label>截止时间</label><input class="input js-task-due" type="datetime-local" value="' + taskDateInput(task && task.dueAt) + '"></div></div>' +
      '<div class="form-row"><div class="field"><label>优先级</label><select class="select js-task-priority">' + Object.keys(TASK_PRIORITY_LABELS).map((k) => '<option value="' + k + '"' + ((task && task.priority === k) || (!task && k === "medium") ? " selected" : "") + '>' + TASK_PRIORITY_LABELS[k] + '</option>').join("") + '</select></div>' +
      '<div class="field"><label>状态</label><select class="select js-task-status">' + Object.keys(TASK_STATUS_LABELS).filter((k) => k !== "overdue").map((k) => '<option value="' + k + '"' + ((task && task.status === k) || (!task && k === "todo") ? " selected" : "") + '>' + TASK_STATUS_LABELS[k] + '</option>').join("") + '</select></div></div>' +
      '<p class="form-error js-task-error" hidden></p><div class="wizard-foot"><button class="btn btn-primary" type="button" data-task-save>' + (editing ? "保存任务" : "创建任务") + '</button></div>';
    showModal(html, true);
    const box = modalContent;
    box.querySelector("[data-task-save]").addEventListener("click", async () => {
      const payload = { clientId: editing ? undefined : makeClientId(), title: box.querySelector(".js-task-title").value.trim(), desc: box.querySelector(".js-task-desc").value.trim(), assigneeId: owner ? box.querySelector(".js-task-assignee").value : assigneeId, dueAt: box.querySelector(".js-task-due").value ? new Date(box.querySelector(".js-task-due").value).getTime() : 0, priority: box.querySelector(".js-task-priority").value, status: box.querySelector(".js-task-status").value };
      const btn = box.querySelector("[data-task-save]"); btn.disabled = true; btn.textContent = "保存中…";
      try { if (editing) await Store.updateTask(topic.id, task.id, payload); else await Store.createTask(topic.id, payload); hideModal(); await refreshTopicList(); const latest = state.topics.find((t) => t.id === topic.id); if (latest) renderChat(topic.id); showToast(editing ? "任务已更新" : "任务已创建"); }
      catch (e) { btn.disabled = false; btn.textContent = editing ? "保存任务" : "创建任务"; const err = box.querySelector(".js-task-error"); err.textContent = e.message || "保存失败"; err.hidden = false; }
    });
  }

  function renderTaskList(topic) {
    const listEl = $("#task-list");
    if (!listEl) return;
    const tasks = topic.tasks || [];
    const createBtn = $("#task-create");
    if (createBtn) { createBtn.hidden = !isLeader(topic); createBtn.onclick = () => openTaskModal(topic, null); }
    const count = $("#task-count"); if (count) count.textContent = tasks.length ? "(" + tasks.length + ")" : "";
    listEl.innerHTML = tasks.length ? tasks.map((task) => {
      const canEdit = isLeader(topic) || (state.user && task.assigneeId === state.user.id);
      const due = task.dueAt ? formatDate(task.dueAt) : "无截止时间";
      return '<li class="task-item"><div class="task-line"><strong>' + escapeHtml(task.title) + '</strong><span class="task-status task-status-' + escapeHtml(task.status) + '">' + escapeHtml(TASK_STATUS_LABELS[task.status] || task.status) + '</span></div>' + '<div class="task-meta">' + escapeHtml(task.assigneeName || "未指定") + ' · ' + escapeHtml(TASK_PRIORITY_LABELS[task.priority] || task.priority) + ' · ' + escapeHtml(due) + '</div>' + (canEdit ? '<div class="task-actions"><button class="btn btn-quiet btn-small" type="button" data-task-edit="' + task.id + '">编辑</button>' + (isLeader(topic) ? '<button class="btn btn-danger btn-small" type="button" data-task-delete="' + task.id + '">删除</button>' : "") + '</div>' : "") + '</li>';
    }).join("") : '<li class="task-empty">还没有任务。</li>';
    listEl.querySelectorAll("[data-task-edit]").forEach((btn) => btn.addEventListener("click", () => { const task = tasks.find((x) => x.id === btn.getAttribute("data-task-edit")); if (task) openTaskModal(topic, task); }));
    listEl.querySelectorAll("[data-task-delete]").forEach((btn) => btn.addEventListener("click", async () => { if (!window.confirm("确认删除这个任务？")) return; try { await Store.deleteTask(topic.id, btn.getAttribute("data-task-delete")); await refreshTopicList(); renderChat(topic.id); showToast("任务已删除"); } catch (e) { showToast(e.message || "删除失败"); } }));
  }

  function renderFileList(topic) {
    const listEl = $("#file-list");
    if (!listEl) return;
    const files = state.files[topic.id] || [];
    if (!files.length) { listEl.innerHTML = '<li class="file-empty">还没有上传文件</li>'; return; }
    const canManage = isLeader(topic);
    listEl.innerHTML = files.map((f) => {
      const canDel = canManage || (state.user && f.uploaderId === state.user.id);
      return '<li class="file-item"><button class="file-link" type="button" data-dl-file="' + f.id + '">' + escapeHtml(f.name) + '</button>' +
        '<span>' + formatSize(f.size) + ' · ' + escapeHtml(f.uploaderName || "") +
        (canDel ? ' <button class="file-del" type="button" data-del-file="' + f.id + '">删除</button>' : '') + '</span></li>';
    }).join("");
    listEl.querySelectorAll("[data-dl-file]").forEach((b) => b.addEventListener("click", () => downloadFile(topic, b.getAttribute("data-dl-file"))));
    listEl.querySelectorAll("[data-del-file]").forEach((b) => b.addEventListener("click", () => openDeleteFileModal(topic, b.getAttribute("data-del-file"))));
  }

  /* 通过 Authorization 头下载文件，绝不把会话 Token 放进 URL */
  async function downloadFile(topic, fileId) {
    const file = (state.files[topic.id] || []).find((f) => f.id === fileId);
    if (!file) return;
    try {
      const res = await fetch(file.url, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) { showToast("下载失败（" + res.status + "）"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 30000);
    } catch (e) {
      showToast("下载失败，请稍后重试");
    }
  }

  function openDeleteFileModal(topic, fileId) {
    const file = (state.files[topic.id] || []).find((f) => f.id === fileId);
    if (!file) return;
    showModal('<h2 class="modal-title">删除这个文件？</h2><p class="modal-sub">「' + escapeHtml(file.name) + '」删除后，组内成员都无法再查看。</p>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-danger" type="button" data-confirm>确认删除</button></div>', true);
    const box = modalContent;
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-confirm]").addEventListener("click", async () => {
      try {
        await Store.deleteFile(topic.id, fileId);
        await loadFiles(topic.id);
        hideModal();
        renderFileList(topic);
        showToast("文件已删除");
      } catch (e) { showToast(e.message || "删除失败"); }
    });
  }

  function openRemoveMemberModal(topic, memberId) {
    const member = topic.members.find((m) => m.id === memberId);
    if (!member) return;
    showModal('<h2 class="modal-title">移出该成员？</h2><p class="modal-sub">确定要把「' + escapeHtml(member.nickname) + '」移出《' + escapeHtml(topic.title) + '》吗？移出后他需要重新申请才能加入。</p>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-danger" type="button" data-confirm>确认移出</button></div>', true);
    const box = modalContent;
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-confirm]").addEventListener("click", async () => {
      try {
        await Store.removeMember(topic.id, memberId);
        await refreshTopicList();
        await loadMessages(topic.id);
        hideModal();
        renderChat(topic.id);
        showToast("已移出该成员");
      } catch (e) { showToast(e.message || "移出失败"); }
    });
  }

  function makeClientId() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function removeOutbox(clientId) {
    state.outbox = (state.outbox || []).filter((x) => x.clientId !== clientId);
    saveOutbox();
  }
  function queueOutbox(item) {
    if (!state.outbox) state.outbox = [];
    if (!state.outbox.some((x) => x.clientId === item.clientId)) state.outbox.push(item);
    saveOutbox();
  }
  async function deliverMessage(item) {
    const list = state.messages[item.topicId] = state.messages[item.topicId] || [];
    let local = list.find((m) => m.clientId === item.clientId || m.id === "local-" + item.clientId);
    if (!local) {
      local = { id: "local-" + item.clientId, clientId: item.clientId, author: state.user && state.user.id, authorName: state.user && state.user.nickname, text: item.text, replyTo: item.replyTo || null, mentions: [], recalled: false, at: item.at || Date.now(), pending: true, failed: false };
      list.push(local);
    }
    local.pending = true; local.failed = false;
    if (currentTopicId === item.topicId) renderChat(item.topicId);
    try {
      const r = await Store.sendMessage(item.topicId, item.text, item.replyTo, item.clientId);
      const index = list.findIndex((m) => m.clientId === item.clientId || m.id === "local-" + item.clientId);
      if (r.message) { if (index >= 0) list[index] = r.message; else list.push(r.message); }
      removeOutbox(item.clientId);
      if (currentTopicId === item.topicId) renderChat(item.topicId);
      return true;
    } catch (e) {
      local.pending = false; local.failed = true;
      queueOutbox(item);
      if (currentTopicId === item.topicId) renderChat(item.topicId);
      showToast(e.message || "发送失败，已加入重试队列");
      return false;
    }
  }
  async function flushOutbox() {
    if (!isLogged() || navigator.onLine === false) return;
    for (const item of (state.outbox || []).slice()) await deliverMessage(item);
  }
  async function retryMessage(topic, msg) {
    await deliverMessage({ topicId: topic.id, text: msg.text, replyTo: msg.replyTo || null, clientId: msg.clientId || makeClientId(), at: msg.at || Date.now() });
  }
  async function sendMessage(e) {
    e.preventDefault();
    if (!currentTopicId || !isLogged()) return;
    const input = $("#chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const reply = state.replyTo;
    state.replyTo = null;
    renderReplyBar();
    await deliverMessage({ topicId: currentTopicId, text: text, replyTo: reply, clientId: makeClientId(), at: Date.now() });
  }

  function handleFilePick(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file || !currentTopicId) return;
    const ext = ("." + file.name.split(".").pop()).toLowerCase();
    if ([".doc", ".docx", ".pdf", ".jpg", ".jpeg", ".png"].indexOf(ext) < 0) { showToast("只支持 Word、PDF 和 jpg / png 图片"); return; }
    if (file.size > 5 * 1024 * 1024) { showToast("文件不能超过 5MB"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(",")[1] || "";
      showToast("正在上传…");
      try {
        await Store.uploadFile(currentTopicId, { name: file.name, data: base64 });
        await loadFiles(currentTopicId);
        renderFileList(state.topics.find((t) => t.id === currentTopicId));
        showToast("上传成功");
      } catch (e) { showToast(e.message || "上传失败"); }
    };
    reader.readAsDataURL(file);
  }

  /* ================= 同步 ================= */
  const sig = { topics: "", apps: "", inbox: "", chat: "", files: "", notif: "" };
  let lastNotifId = "";

  async function refreshAll() {
    if (!state.online) return;
    await loadAnnouncements();
    try {
      const r = await Store.topics();
      const tj = JSON.stringify(r.topics || []);
      if (tj !== sig.topics) {
        sig.topics = tj;
        state.topics = r.topics || [];
        if ($("#view-plaza").hidden === false) {
          renderTopicGrid();
        } else if (currentTopicId) {
          const live = state.topics.find((t) => t.id === currentTopicId);
          if (!live) { showPlaza(); showToast("该作品已被负责人删除"); return; }
          if (!isMember(live) && !isAdmin()) { showPlaza(); showToast("你已被移出该作品"); return; }
          renderChat(currentTopicId);
        }
      }
    } catch (e) {}

    if (isLogged()) {
      try {
        const r = await Store.myApplications();
        const aj = JSON.stringify(r.applications || []);
        if (aj !== sig.apps) {
          const prev = state.myApplications.slice();
          sig.apps = aj;
          state.myApplications = r.applications || [];
          state.myApplications.forEach((a) => {
            const old = prev.find((p) => p.topicId === a.topicId);
            if (a.status === "approved" && old && old.status === "pending") {
              const t = state.topics.find((x) => x.id === a.topicId);
              showToast("你的申请已通过：" + (t ? t.title : "作品"));
            }
          });
          if ($("#view-plaza").hidden === false) renderTopicGrid();
        }
      } catch (e) {}
      try {
        const r = await Store.inbox();
        const ij = JSON.stringify(r.applications || []);
        if (ij !== sig.inbox) { sig.inbox = ij; state.inbox = r.applications || []; renderHeader(); }
      } catch (e) {}
      try {
        const r = await Store.notifications();
        const nj = JSON.stringify({ n: r.notifications || [], u: r.unread || 0 });
        if (nj !== sig.notif) {
          sig.notif = nj;
          const prevUnread = state.unread;
          state.notifications = r.notifications || [];
          state.unread = r.unread || 0;
          renderBell();
          if (state.unread > prevUnread) {
            const latest = state.notifications.find((x) => !x.read);
            if (latest) showToast((latest.type === "mention" ? "有人 @ 你：" : "") + (latest.text || "有一条新消息"));
          }
        }
      } catch (e) {}
    }

    if (currentTopicId) {
      try {
        const r = await Store.messages(currentTopicId);
        const mj = JSON.stringify(r.messages || []);
        if (mj !== sig.chat) { sig.chat = mj; state.messages[currentTopicId] = r.messages || []; renderChat(currentTopicId); }
      } catch (e) {
        if (e && e.status === 403) { showPlaza(); showToast("你已不在该作品中，无法查看聊天"); return; }
      }
      try {
        const r = await Store.files(currentTopicId);
        const fj = JSON.stringify(r.files || []);
        if (fj !== sig.files) { sig.files = fj; state.files[currentTopicId] = r.files || []; renderFileList(state.topics.find((t) => t.id === currentTopicId)); }
      } catch (e) {}
    }
  }

  /* ================= 举报（内容治理） ================= */
  function openReportModal(topic) {
    if (!isLogged()) { openAuthModal({ mode: "login" }); return; }
    showModal('<h2 class="modal-title">举报违规内容</h2><p class="modal-sub">举报会提交给平台管理员核查处理。请勿滥用举报。</p>' +
      '<div class="field"><label>举报类型</label><select class="select js-reason">' +
        '<option value="违法违规内容">违法违规内容</option>' +
        '<option value="诈骗或虚假信息">诈骗或虚假信息</option>' +
        '<option value="人身攻击或骚扰">人身攻击或骚扰</option>' +
        '<option value="侵权或隐私泄露">侵权或隐私泄露</option>' +
        '<option value="恶意文件或代码">恶意文件或代码</option>' +
        '<option value="其他">其他</option>' +
      '</select></div>' +
      '<div class="field"><label>补充说明（可选）</label><textarea class="textarea js-detail" placeholder="请描述具体情况，便于管理员核查"></textarea></div>' +
      '<p class="form-error js-error" hidden></p>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-primary" type="button" data-submit>提交举报</button></div>', true);
    const box = modalContent;
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-submit]").addEventListener("click", async () => {
      const btn = box.querySelector("[data-submit]");
      btn.disabled = true; btn.textContent = "正在提交…";
      try {
        await Store.report({ topicId: topic.id, reason: box.querySelector(".js-reason").value, detail: box.querySelector(".js-detail").value.trim() });
        hideModal();
        showToast("举报已提交，管理员会尽快核查");
      } catch (e) {
        btn.disabled = false; btn.textContent = "提交举报";
        const err = box.querySelector(".js-error");
        err.textContent = e.message || "提交失败"; err.hidden = false;
      }
    });
  }

  /* ================= 全站公告 ================= */
  async function loadAnnouncements() {
    try {
      const r = await Store.announcements();
      state.announcements = r.announcements || [];
      state.announcementsUnread = r.unread || 0;
    } catch (e) {}
    renderAnnouncementBell();
  }

  function renderAnnouncementBell() {
    const btn = $("#btn-announcements");
    const badge = $("#announcement-badge");
    if (!btn || !badge) return;
    btn.hidden = !isLogged() && !(state.announcements || []).length;
    badge.hidden = state.announcementsUnread === 0;
    badge.textContent = state.announcementsUnread > 99 ? "99+" : String(state.announcementsUnread || 0);
  }

  async function openAnnouncements() {
    await loadAnnouncements();
    const list = state.announcements || [];
    const importanceLabel = { normal: "普通", important: "重要", security: "安全", policy: "政策" };
    showModal('<h2 class="modal-title">全站公告</h2><p class="modal-sub">平台通知与规则更新都会显示在这里。</p>' +
      (list.length ? '<div class="announcement-list">' + list.map((a) => '<article class="announcement-card' + (a.read ? "" : " is-unread") + '"><div class="announcement-head"><span class="announcement-tag">' + escapeHtml(importanceLabel[a.importance] || "公告") + '</span>' + (a.pinned ? '<span class="announcement-tag is-pinned">置顶</span>' : "") + '<span class="announcement-time">' + escapeHtml(formatDate(a.publishAt || a.createdAt)) + '</span></div><h3>' + escapeHtml(a.title || "公告") + '</h3><p>' + escapeHtml(a.content || "").replace(/\n/g, "<br>") + '</p><small>发布者：' + escapeHtml(a.publisherName || "平台") + '</small></article>').join("") + '</div>' : '<div class="empty-inbox">暂时没有公告。</div>') +
      '<div class="wizard-foot"><button class="btn btn-primary" type="button" data-ann-close>已知晓</button></div>', true);
    const box = modalContent;
    box.querySelector("[data-ann-close]").addEventListener("click", hideModal);
    if (isLogged() && list.some((a) => !a.read)) {
      try { await Promise.all(list.filter((a) => !a.read).map((a) => Store.readAnnouncement(a.id))); await loadAnnouncements(); } catch (e) {}
    }
  }

  /* ================= 消息提醒（类似微信） ================= */
  async function loadNotifications() {
    if (!isLogged()) { state.notifications = []; state.unread = 0; renderBell(); return; }
    try {
      const r = await Store.notifications();
      state.notifications = r.notifications || [];
      state.unread = r.unread || 0;
    } catch (e) {}
    renderBell();
  }

  function renderBell() {
    const btn = $("#btn-bell");
    const badge = $("#bell-badge");
    if (!btn || !badge) return;
    btn.hidden = !isLogged();
    badge.hidden = state.unread === 0;
    badge.textContent = state.unread > 99 ? "99+" : String(state.unread);
    if (petController && state.unread > lastPetUnread) petController.notify();
    lastPetUnread = state.unread;
  }

  function openNotifications() {
    if (!isLogged()) { openAuthModal({ mode: "login" }); return; }
    const list = state.notifications || [];
    const typeLabel = { NEW_MESSAGE: "新消息", MENTION: "@ 提醒", PROJECT_APPLICATION: "入组申请", APPLICATION_CANCELLED: "取消申请", APPLICATION_ACCEPTED: "申请通过", APPLICATION_REJECTED: "申请结果", MEMBER_REMOVED: "移出作品", FILE_UPLOADED: "新文件", PROJECT_UPDATE: "作品公告", TASK_ASSIGNMENT: "任务分配", REPORT_CREATED: "举报", SYSTEM_NOTIFICATION: "系统通知", ANNOUNCEMENT: "全站公告", SECURITY: "安全提醒", PROJECT_STATUS: "作品状态", OWNER_TRANSFER: "负责人转移", APPEAL_RESULT: "申诉结果", PENALTY_APPLIED: "处罚通知", REPORT_HANDLED: "举报处理", message: "新消息", mention: "@ 提醒", apply: "入组申请", application_cancelled: "取消申请", approved: "申请通过", rejected: "申请结果", removed: "移出作品", file: "新文件", announcement: "作品公告" };
    showModal('<h2 class="modal-title">消息提醒</h2><p class="modal-sub">有人发消息、@ 你，或者作品有变化时，会在这里提醒你。</p>' +
      (list.length ? '<ul class="msg-list">' + list.map((n) =>
        '<li class="msg-row bell-row" data-notif="' + n.id + '" data-topic="' + (n.topicId || "") + '">' +
        '<span class="msg-avatar">' + (n.from ? escapeHtml(n.from.slice(0, 1)) : faIcon("bell", "msg-avatar-icon")) + '</span>' +
        '<div class="msg-body"><div class="msg-head">' + (n.read ? "" : '<span class="bell-unread"></span>') + '<strong>' + escapeHtml(n.from || "系统") + '</strong>' +
        '<span class="msg-sub">' + escapeHtml(typeLabel[n.type] || "通知") + " · " + formatDate(n.at) + '</span></div>' +
        '<p class="msg-text">' + escapeHtml(n.text || "") + '</p>' +
        (n.topicTitle ? '<p class="msg-quote">来自《' + escapeHtml(n.topicTitle) + '》</p>' : "") +
        (n.type === "PENALTY_APPLIED" ? '<div class="msg-actions"><button class="btn btn-quiet btn-small" type="button" data-appeal="' + n.id + '">提交申诉</button></div>' : "") +
        '</div></li>').join("") + '</ul>' : '<div class="empty-inbox">还没有新消息。<br>有人给你发消息或 @ 你时，这里会出现提醒。</div>'), true);
    const box = modalContent;
    box.querySelectorAll("[data-appeal]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = list.find((x) => x.id === b.getAttribute("data-appeal"));
      if (n) openAppealModal(n);
    }));
    box.querySelectorAll("[data-notif]").forEach((row) => row.addEventListener("click", async () => {
      const topicId = row.getAttribute("data-topic");
      hideModal();
      if (topicId) {
        const t = state.topics.find((x) => x.id === topicId);
        if (t && (isMember(t) || isAdmin())) openChat(topicId);
        else if (t) showToast("你需要先加入这个作品才能查看");
        else showToast("该作品已不存在");
      }
      try { await Store.readNotifications({ all: true }); } catch (e) {}
      await loadNotifications();
    }));
    Store.readNotifications({ all: true }).then(() => loadNotifications()).catch(() => {});
  }

  function openAppealModal(notification) {
    const penaltyType = String(notification.text || "").includes("封禁") ? "ban" : "mute";
    showModal('<h2 class="modal-title">提交申诉</h2><p class="modal-sub">申诉会提交给平台管理员。请说明处罚有误的原因。</p>' +
      '<div class="field"><label>处罚类型</label><input class="input" type="text" value="' + (penaltyType === "ban" ? "封禁" : "禁言") + '" readonly></div>' +
      '<div class="field"><label>申诉理由</label><textarea class="textarea js-appeal-reason" maxlength="500" placeholder="例如：处罚有误，请复核"></textarea></div>' +
      '<p class="form-error js-appeal-error" hidden></p>' +
      '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-cancel>取消</button><button class="btn btn-primary" type="button" data-submit>提交申诉</button></div>', true);
    const box = modalContent;
    box.querySelector("[data-cancel]").addEventListener("click", hideModal);
    box.querySelector("[data-submit]").addEventListener("click", async () => {
      const reason = box.querySelector(".js-appeal-reason").value.trim();
      const err = box.querySelector(".js-appeal-error");
      if (!reason) { err.textContent = "请填写申诉理由"; err.hidden = false; return; }
      const btn = box.querySelector("[data-submit]");
      btn.disabled = true; btn.textContent = "正在提交…";
      try { await Store.createAppeal({ penaltyType: penaltyType, reason: reason }); hideModal(); showToast("申诉已提交，管理员会尽快处理"); }
      catch (e) { btn.disabled = false; btn.textContent = "提交申诉"; err.textContent = e.message || "提交失败"; err.hidden = false; }
    });
  }

  /* ================= 事件与启动 ================= */
  function bindEvents() {
    $("#search-input").addEventListener("input", (e) => { state.search = e.target.value; renderTopicGrid(); });
    const heroCreate = $("#hero-create");
    if (heroCreate) heroCreate.addEventListener("click", () => { if (!isLogged()) { openAuthModal({ mode: "register", onDone: openLeaderFlow }); return; } openLeaderFlow(); });
    const heroExplore = $("#hero-explore");
    if (heroExplore) heroExplore.addEventListener("click", () => document.querySelector(".plaza-body")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const categoryFilter = $("#category-filter");
    if (categoryFilter) categoryFilter.addEventListener("change", () => { state.categoryFilter = categoryFilter.value; renderTopicGrid(); });
    const statusFilter = $("#status-filter");
    if (statusFilter) statusFilter.addEventListener("change", () => { state.statusFilter = statusFilter.value; renderTopicGrid(); });
    const recruitingFilter = $("#recruiting-filter");
    if (recruitingFilter) recruitingFilter.addEventListener("click", () => { state.recruitingOnly = !state.recruitingOnly; recruitingFilter.classList.toggle("is-on", state.recruitingOnly); renderTopicGrid(); });
    $("#btn-switch").addEventListener("click", openRoleModal);
    $("#btn-theme").addEventListener("click", showThemeChooser);
    $("#btn-create").addEventListener("click", () => { if (!isLogged()) { openAuthModal({ mode: "register", onDone: openLeaderFlow }); return; } openLeaderFlow(); });
    $("#btn-auth").addEventListener("click", () => openAuthModal({ mode: "login" }));
    $("#btn-logout").addEventListener("click", async () => {
      try { await Store.logout(); } catch (e) {}
      clearSession();
      if (sseSource) { try { sseSource.close(); } catch (e) {} sseSource = null; }
      renderPlaza();
      window.currentProjectId = null;
      if (window.ProjectHubAgent) window.ProjectHubAgent.init({ projectId: null });
      showToast("已退出登录");
      openRoleModal();
    });
    $("#btn-inbox").addEventListener("click", openInboxModal);
    const bell = $("#btn-bell");
    if (bell) bell.addEventListener("click", openNotifications);
    const announcementsBtn = $("#btn-announcements");
    if (announcementsBtn) announcementsBtn.addEventListener("click", openAnnouncements);
    window.addEventListener("online", () => { flushOutbox(); });
    const reportBtn = $("#btn-report");
    if (reportBtn) reportBtn.addEventListener("click", () => {
      const t = state.topics.find((x) => x.id === currentTopicId);
      if (t) openReportModal(t);
    });
    const sideBtn = $("#btn-side");
    if (sideBtn) sideBtn.addEventListener("click", () => $("#chat-side").classList.add("is-open"));
    const sideClose = $("#btn-side-close");
    if (sideClose) sideClose.addEventListener("click", () => $("#chat-side").classList.remove("is-open"));
    const mentionBtn = $("#btn-mention");
    if (mentionBtn) mentionBtn.addEventListener("click", () => renderMentionPicker($("#mention-picker").hidden));
    const chatInput = $("#chat-input");
    if (chatInput) chatInput.addEventListener("input", (e) => { if (e.target.value.slice(-1) === "@") renderMentionPicker(true); });
    $("#btn-admin").addEventListener("click", openAdminPanel);
    $("#btn-back").addEventListener("click", showPlaza);
    $("#chat-form").addEventListener("submit", sendMessage);
    const fileInput = $("#file-input");
    if (fileInput) fileInput.addEventListener("change", handleFilePick);
    const resourceNote = $("#resource-note"); if (resourceNote) resourceNote.addEventListener("click", () => { const topic = state.topics.find((t) => t.id === currentTopicId); if (topic) openResourceModal(topic, "note"); });
    const resourceLink = $("#resource-link"); if (resourceLink) resourceLink.addEventListener("click", () => { const topic = state.topics.find((t) => t.id === currentTopicId); if (topic) openResourceModal(topic, "link"); });
    const emptyCreate = $("#empty-create-btn");
    if (emptyCreate) emptyCreate.addEventListener("click", () => { if (!isLogged()) { openAuthModal({ mode: "register", onDone: openLeaderFlow }); return; } openLeaderFlow(); });
    const sideDelete = $("#btn-delete-topic");
    if (sideDelete) sideDelete.addEventListener("click", () => {
      const topic = state.topics.find((t) => t.id === currentTopicId);
      if (topic) openDeleteModal(topic);
    });
    modalClose.addEventListener("click", hideModal);
    modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay && modalClosable) hideModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalOverlay && !modalOverlay.hidden && modalClosable) hideModal(); });
  }

  /* SSE：先用会话 Token 换取一次性短期票据，票据放进 URL 只用于建立连接 */
  let sseSource = null;
  let sseRetryTimer = null;

  function ensureSse() {
    if (!isLogged()) return;
    if (sseSource) return;
    connectSse();
  }

  async function connectSse() {
    if (!isLogged()) return;
    try {
      const r = await Store.sseTicket();
      if (sseSource) { try { sseSource.close(); } catch (e) {} }
      const es = new EventSource("/api/events?ticket=" + encodeURIComponent(r.ticket));
      sseSource = es;
      ["topics", "message", "applications", "files", "notify", "announcements"].forEach((ev) => es.addEventListener(ev, refreshAll));
      es.addEventListener("error", () => {
        try { es.close(); } catch (e) {}
        sseSource = null;
        clearTimeout(sseRetryTimer);
        sseRetryTimer = setTimeout(connectSse, 5000);
      });
    } catch (e) {
      clearTimeout(sseRetryTimer);
      sseRetryTimer = setTimeout(connectSse, 8000);
    }
  }


  function createPetController() {
    const root = document.getElementById("projecthub-pet");
    if (!root) return null;
    const bubble = root.querySelector(".pet-bubble");
    const image = root.querySelector("img");
    if (!bubble || !image) return null;

    const messages = [
      "今天也要一起把作品做出来。",
      "需要我帮你看着进度吗？",
      "有新消息时我会提醒你。",
      "记得把想法写下来，再做下一步。",
      "先休息一会儿，回来继续。",
      "我来陪你把这个作品推进一步。"
    ];
    let stateTimer = null;
    let bubbleTimer = null;
    let dragState = null;
    let moved = false;

    const setState = (next, duration) => {
      if (stateTimer) clearTimeout(stateTimer);
      root.dataset.state = next;
      if (duration) stateTimer = setTimeout(() => { root.dataset.state = "idle"; stateTimer = null; }, duration);
    };
    const pulse = (next, duration) => setState(next, duration || 800);
    const say = (text) => {
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubble.textContent = text;
      bubble.hidden = false;
      bubbleTimer = setTimeout(() => { bubble.hidden = true; bubbleTimer = null; }, 2600);
    };
    const clampPosition = () => {
      const rect = root.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, rect.left));
      const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, rect.top));
      if (root.style.left || root.style.top) { root.style.left = left + "px"; root.style.top = top + "px"; }
    };
    const savePosition = () => {
      try { const rect = root.getBoundingClientRect(); localStorage.setItem("projecthub_pet_position_v1", JSON.stringify({ left: rect.left, top: rect.top })); } catch (e) {}
    };
    const restorePosition = () => {
      try {
        const saved = JSON.parse(localStorage.getItem("projecthub_pet_position_v1") || "null");
        if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
        root.style.left = saved.left + "px"; root.style.top = saved.top + "px"; root.style.right = "auto"; root.style.bottom = "auto"; clampPosition();
      } catch (e) {}
    };

    root.addEventListener("pointerenter", () => { if (!dragState && root.dataset.state === "idle") setState("hover"); });
    root.addEventListener("pointerleave", () => { if (!dragState && root.dataset.state === "hover") setState("idle"); });
    root.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const rect = root.getBoundingClientRect();
      dragState = { id: e.pointerId, startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top };
      moved = false; root.classList.add("is-dragging"); try { root.setPointerCapture(e.pointerId); } catch (err) {}
    });
    root.addEventListener("pointermove", (e) => {
      if (!dragState || dragState.id !== e.pointerId) return;
      const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      root.style.left = dragState.left + dx + "px"; root.style.top = dragState.top + dy + "px"; root.style.right = "auto"; root.style.bottom = "auto"; clampPosition();
    });
    root.addEventListener("pointerup", (e) => {
      if (!dragState || dragState.id !== e.pointerId) return;
      root.classList.remove("is-dragging"); try { root.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) savePosition(); else { pulse("click", 720); say(messages[Math.floor(Math.random() * messages.length)]); }
      dragState = null;
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pulse("click", 720); say(messages[Math.floor(Math.random() * messages.length)]); }
    });
    root.addEventListener("dblclick", () => { pulse("sleep", 1800); say("让我打个盹."); });
    window.addEventListener("resize", clampPosition);
    restorePosition();

    const api = {
      pulse: pulse,
      loading: () => pulse("loading", 1000),
      success: () => pulse("success", 1000),
      error: () => pulse("error", 900),
      notify: () => pulse("notify", 1200),
      music: () => setState("music", 0),
      idle: () => setState("idle", 0),
      happy: () => pulse("success", 1000),
      react: (message) => {
        if (/失败|错误|无法|不存在|权限|不正确/.test(String(message || ""))) pulse("error", 900);
        else pulse("success", 900);
      }
    };
    window.ProjectHubPet = api;
    return api;
  }

  function syncTopbarHeight() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    document.documentElement.style.setProperty('--topbar-h', Math.ceil(topbar.getBoundingClientRect().height) + 'px');
  }

  async function init() {
    const sharedProjectMatch = location.pathname.match(/^\/project\/([^/]+)\/?$/);
    const sharedProjectId = sharedProjectMatch ? decodeURIComponent(sharedProjectMatch[1]) : "";
    petController = createPetController();
    dynamicBackground.init();
    dynamicBackground.setRenderer(StarryRenderer);
      window.addEventListener("resize", () => {
    dynamicBackground.resize();
    syncTopbarHeight();
  });
    document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    dynamicBackground.stop();
  } else if (dynamicBackground.mode === "dynamic") {
    dynamicBackground.start();
  }
});
    loadSession();
    loadThemePreference();
    loadBackgroundPreference();
    bindEvents();
    syncTopbarHeight();
    const topbar = document.querySelector('.topbar');
    if (window.ResizeObserver && topbar) new ResizeObserver(syncTopbarHeight).observe(topbar);
    try {
      await Store.health();
      state.online = true;
      const r = await Store.topics();
      state.topics = r.topics || [];
      sig.topics = JSON.stringify(state.topics);
      await loadAnnouncements();
      if (isLogged()) {
        try { const me = await api("GET", "api/me"); state.user = me.user; saveSession(); } catch (e) { clearSession(); }
        await loadPrivateData();
      }
     renderPlaza();
     if (sharedProjectId) {
       setTimeout(() => openSharedProject(sharedProjectId), 0);
     } else if (!hasThemePreference()) {
       showThemeChooser();
     } else if (!isLogged()) {
       openRoleModal();
     }

connectSse();
      setInterval(refreshAll, 5000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
    } catch (e) {
      state.online = false;
      renderHeader();
      $("#topic-grid").innerHTML = '<div class="empty-state"><p>无法连接到服务器</p><span>请通过服务器网址打开本站（例如 http://localhost:8787），而不是直接双击文件。</span></div>';
    }
  }

  init();
})();
document.addEventListener(
    "DOMContentLoaded",
    () => {
        if (
            window.ProjectHubAgent
        ) {
            window.ProjectHubAgent.init({
                projectId:
                    window.currentProjectId ||
                    null,

                isLeader:
                    Boolean(
                        window.currentUser &&
                        (
                            window.currentUser.role ===
                            "project_leader" ||
                            window.currentUser.isProjectLeader
                        )
                    ),

                isAdmin:
                    Boolean(
                        window.currentUser &&
                        (
                            window.currentUser.role ===
                            "admin" ||
                            window.currentUser.role ===
                            "system_admin"
                        )
                    ),
            });
        }
    }
);
