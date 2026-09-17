(function () {
  "use strict";

  /* ================= 常量 ================= */
  const MAJORS = [
    { id: "m1", label: "计算机科学与技术", icon: "💻" },
    { id: "m2", label: "软件工程", icon: "🧩" },
    { id: "m3", label: "人工智能", icon: "🤖" },
    { id: "m4", label: "数据科学与大数据技术", icon: "📊" },
    { id: "m5", label: "电子信息工程", icon: "📡" },
    { id: "m6", label: "通信工程", icon: "📶" },
    { id: "m7", label: "自动化", icon: "⚙️" },
    { id: "m8", label: "机器人工程", icon: "🦾" },
    { id: "m9", label: "机械设计制造及其自动化", icon: "🔩" },
    { id: "m10", label: "电气工程及其自动化", icon: "⚡" },
    { id: "m11", label: "数学与应用数学", icon: "📐" },
    { id: "m12", label: "信息与计算科学", icon: "🔢" },
    { id: "m13", label: "物理学", icon: "🔭" },
    { id: "m14", label: "化学", icon: "🧪" },
    { id: "m15", label: "环境工程", icon: "🌱" },
    { id: "m16", label: "生物医学工程", icon: "🧬" },
    { id: "m17", label: "材料科学与工程", icon: "🧱" },
    { id: "m18", label: "建筑学 / 土木工程", icon: "🏗️" },
    { id: "m19", label: "经济学 / 金融学", icon: "💰" },
    { id: "m20", label: "管理科学", icon: "📋" },
    { id: "m21", label: "新闻传播学", icon: "📰" },
    { id: "m22", label: "设计学 / 视觉传达", icon: "🎨" },
    { id: "m23", label: "医学 / 药学", icon: "🩺" },
    { id: "m24", label: "心理学", icon: "🧠" },
    { id: "m25", label: "教育学", icon: "📚" },
    { id: "m26", label: "法学", icon: "⚖️" },
    { id: "m27", label: "能源与动力工程", icon: "🔋" },
    { id: "m28", label: "航空航天工程", icon: "✈️" }
  ];
  const ROLE_TAGS = ["项目策划", "技术成员", "设计成员", "文案/材料成员", "调研成员", "答辩成员"];
  const GRADES = ["大一", "大二", "大三", "大四", "研一", "研二", "研三"];

  const majorLabel = (id) => { const m = MAJORS.find((x) => x.id === id); return m ? (m.icon + " " + m.label) : id; };
  const majorName = (id) => { const m = MAJORS.find((x) => x.id === id); return m ? m.label : id; };
  const gradeOptions = (selected) => GRADES.map((g) => '<option value="' + g + '"' + (g === selected ? " selected" : "") + '>' + g + '</option>').join("");
  const tagOptions = (selected) => '<option value="">未分配</option>' + ROLE_TAGS.map((t) => '<option value="' + t + '"' + (t === selected ? " selected" : "") + '>' + t + '</option>').join("");

  const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const formatSize = (n) => (n < 1024 ? n + " B" : (n < 1024 * 1024 ? (n / 1024).toFixed(1) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB"));
  const formatDate = (ts) => { try { return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  const formatTime = (ts) => { try { return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

  /* ================= 状态与本地存储 ================= */
  const USER_KEY = "projecthub_session_v3";
  let state = {
    user: null,
    token: "",
    topics: [],
    messages: {},
    files: {},
    myApplications: [],
    inbox: [],
    ai: {},
    notifications: [],
    unread: 0,
    replyTo: null,
    filter: "all",
    search: "",
    online: false
  };
  let currentTopicId = null;

  function loadSession() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.user = parsed.user || null;      // 仅缓存用户资料；会话凭据在 HttpOnly Cookie 中，JS 读不到
      state.token = "";                      // 兼容旧数据：不再使用 localStorage 中的 Token
    } catch (e) {}
  }
  function saveSession() {
    try { localStorage.setItem(USER_KEY, JSON.stringify({ user: state.user })); } catch (e) {}
  }
  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)ph_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function clearSession() {
    state.user = null; state.token = ""; state.inbox = []; state.myApplications = [];
    try { localStorage.removeItem(USER_KEY); } catch (e) {}
  }

  /* ================= DOM / 弹窗 ================= */
  const $ = (sel, root) => (root || document).querySelector(sel);
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
  function hideModal() { modalOverlay.hidden = true; }

  let toastTimer = null;
  function showToast(msg) {
    const toast = $("#toast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  /* ================= 话题辅助 ================= */
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
    try {
      res = await fetch(path, { method: method, headers: headers, credentials: "same-origin", body: body !== undefined ? JSON.stringify(body) : undefined, cache: "no-store" });
    } catch (e) {
      throw new Error("无法连接服务器，请检查网络");
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      if (res.status === 401 && state.user) { clearSession(); renderHeader(); showToast("登录状态已失效，请重新登录"); }
      const err = new Error(data.error || "请求失败"); err.status = res.status; throw err;
    }
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
    sendMessage: (id, text, replyTo) => api("POST", "api/topics/" + encodeURIComponent(id) + "/messages", { text: text, replyTo: replyTo || null }),
    files: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/files"),
    uploadFile: (id, payload) => api("POST", "api/topics/" + encodeURIComponent(id) + "/files", payload),
    setTag: (id, memberId, tag) => api("POST", "api/topics/" + encodeURIComponent(id) + "/members/" + encodeURIComponent(memberId) + "/tag", { tag: tag }),
    removeMember: (id, memberId) => api("DELETE", "api/topics/" + encodeURIComponent(id) + "/members/" + encodeURIComponent(memberId)),
    aiConfig: () => api("GET", "api/ai/config"),
    ai: (id) => api("GET", "api/topics/" + encodeURIComponent(id) + "/ai"),
    aiToggle: (id, enabled) => api("POST", "api/topics/" + encodeURIComponent(id) + "/ai/toggle", { enabled: enabled }),
    aiThink: (id) => api("POST", "api/topics/" + encodeURIComponent(id) + "/ai/think", {}),
    aiVote: (id, optionId) => api("POST", "api/topics/" + encodeURIComponent(id) + "/ai/vote", { optionId: optionId }),
    aiClose: (id) => api("POST", "api/topics/" + encodeURIComponent(id) + "/ai/close", {}),
    aiDeep: (id) => api("POST", "api/topics/" + encodeURIComponent(id) + "/ai/deep", {}),
    deleteFile: (topicId, fileId) => api("DELETE", "api/topics/" + encodeURIComponent(topicId) + "/files/" + encodeURIComponent(fileId)),
    editMessage: (topicId, msgId, text) => api("PATCH", "api/topics/" + encodeURIComponent(topicId) + "/messages/" + encodeURIComponent(msgId), { text: text }),
    recallMessage: (topicId, msgId) => api("DELETE", "api/topics/" + encodeURIComponent(topicId) + "/messages/" + encodeURIComponent(msgId)),
    sseTicket: () => api("POST", "api/sse/ticket", {}),
    report: (payload) => api("POST", "api/reports", payload),
    adminReports: () => api("GET", "api/admin/reports"),
    resolveReport: (id) => api("POST", "api/admin/reports/" + encodeURIComponent(id) + "/resolve", {}),
    notifications: () => api("GET", "api/notifications"),
    readNotifications: (payload) => api("POST", "api/notifications/read", payload || { all: true }),
    adminUsers: () => api("GET", "api/admin/users"),
    adminBan: (userId, banned) => api("POST", "api/admin/users/" + encodeURIComponent(userId) + "/ban", { banned: banned })
  };

  /* ================= 顶部信息 ================= */
  function renderHeader() {
    const chip = $("#user-chip");
    if (typeof renderBell === "function") renderBell();
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

  /* ================= 话题广场 ================= */
  function renderFilterBar() {
    const bar = $("#filter-bar");
    const distinct = [];
    state.topics.forEach((t) => topicDirections(t).forEach((id) => { if (distinct.indexOf(id) < 0) distinct.push(id); }));
    let html = '<button class="filter-chip' + (state.filter === "all" ? " is-on" : "") + '" data-filter="all" type="button">全部</button>';
    distinct.forEach((id) => {
      html += '<button class="filter-chip' + (state.filter === id ? " is-on" : "") + '" data-filter="' + id + '" type="button">' + majorLabel(id) + '</button>';
    });
    bar.innerHTML = html;
    bar.querySelectorAll("[data-filter]").forEach((b) => {
      b.addEventListener("click", () => { state.filter = b.getAttribute("data-filter"); renderFilterBar(); renderTopicGrid(); });
    });
  }

  function topicCard(t) {
    const dirs = topicDirections(t);
    const dirChips = dirs.slice(0, 2).map((id) => '<span class="topic-direction">' + escapeHtml(majorLabel(id)) + '</span>').join("") +
      (dirs.length > 2 ? '<span class="topic-direction">+' + (dirs.length - 2) + '</span>' : "");
    const typeBadge = t.type === "public" ? '<span class="badge badge-public">🔓 公开话题</span>' : '<span class="badge badge-private">🔒 私密话题</span>';
    const need = (t.neededRoles || []).length ? escapeHtml(t.neededRoles.join(" / ")) : "不限";
    const miss = missingTags(t);
    const missHtml = t.neededRoles && t.neededRoles.length
      ? (miss.length ? '<p class="topic-missing">还缺：<strong>' + escapeHtml(miss.join(" / ")) + '</strong></p>' : '<p class="topic-missing is-done">角色已齐 ✓</p>')
      : "";

    const member = isMember(t);
    const leader = isLeader(t);
    const appStatus = myAppStatus(t.id);
    const memberCount = Number.isFinite(t.memberCount) ? t.memberCount : t.members.length;
    const full = !member && memberCount >= t.limit;
    let label = "申请加入", cls = "btn-ghost", disabled = "", actionAttr = 'data-open="' + t.id + '"';
    if (member) { label = "进入话题"; cls = "btn-primary"; }
    else if (full) { label = "已满员"; disabled = " disabled"; }
    else if (appStatus === "pending") { label = "取消申请"; cls = "btn-danger"; actionAttr = 'data-cancel-app="' + t.id + '"'; }
    else if (appStatus === "rejected") { label = "重新申请"; }

    return '<article class="topic-card">' +
      '<div class="topic-head">' + typeBadge + dirChips + '<span class="topic-limit">' + t.members.length + '/' + t.limit + '</span></div>' +
      '<h3 class="topic-title">' + escapeHtml(t.title) + '</h3>' +
      '<p class="topic-desc">' + escapeHtml(t.desc || "暂无简介") + '</p>' +
      '<p class="topic-vibe">组内氛围：' + escapeHtml(t.vibe || "负责人还没有填写") + '</p>' +
      '<p class="topic-require">' + (t.type === "public" ? "加入需要方向：" + escapeHtml(requiredLabels(t) || "不限") : "🔒 需要负责人提供的 6 位密码") + '</p>' +
      '<p class="topic-roles">需要角色：' + need + '</p>' + missHtml +
      '<div class="topic-foot"><span class="topic-owner">' + (t.memberHidden ? '负责人 · <strong>（私密项目）</strong>' : '负责人 · <strong>' + escapeHtml(t.members[0] ? t.members[0].nickname : "—") + '</strong>') + '</span>' +
      '<span class="topic-actions">' +
        '<button class="btn ' + cls + ' btn-small" type="button" ' + actionAttr + disabled + '>' + label + '</button>' +
        (leader ? '<button class="btn btn-danger btn-small" type="button" data-delete="' + t.id + '">删除</button>' : '') +
      '</span></div></article>';
  }

  function renderTopicGrid() {
    const grid = $("#topic-grid");
    const empty = $("#empty-state");
    const kw = (state.search || "").trim().toLowerCase();
    const list = state.topics.filter((t) => {
      const dirs = topicDirections(t);
      const okFilter = state.filter === "all" || dirs.indexOf(state.filter) >= 0 || (t.required || []).indexOf(state.filter) >= 0;
      if (!okFilter) return false;
      if (!kw) return true;
      const hay = (t.title + " " + (t.desc || "") + " " + (t.vibe || "") + " " + dirs.map(majorName).join(" ") + " " + (t.neededRoles || []).join(" ") + " " + requiredLabels(t) + " " + t.type + " " + (t.members[0] && t.members[0].nickname)).toLowerCase();
      return hay.indexOf(kw) >= 0;
    });

    $("#stat-topics").textContent = state.topics.length;
    $("#stat-members").textContent = state.topics.reduce((n, t) => n + (Number.isFinite(t.memberCount) ? t.memberCount : t.members.length), 0);
    $("#result-count").textContent = "共 " + list.length + " 个项目";

    grid.innerHTML = list.map(topicCard).join("");
    empty.hidden = list.length > 0;
    if (!empty.hidden) {
      const titleEl = empty.querySelector("[data-empty-title]");
      const subEl = empty.querySelector("[data-empty-sub]");
      const createBtn = $("#empty-create-btn");
      if (state.topics.length === 0) {
        titleEl.textContent = "还没有任何项目";
        subEl.textContent = "发布第一个项目，成为这里的第一个负责人。";
        createBtn.hidden = false;
      } else {
        titleEl.textContent = "没有找到匹配的项目";
        subEl.textContent = "换个关键词或方向试试，也可以发布一个新项目。";
        createBtn.hidden = true;
      }
    }

    grid.querySelectorAll("[data-open]").forEach((b) => {
      b.addEventListener("click", () => handleOpenTopic(b.getAttribute("data-open")));
    });
    grid.querySelectorAll("[data-cancel-app]").forEach((b) => {
      b.addEventListener("click", () => {
        const topic = state.topics.find((t) => t.id === b.getAttribute("data-cancel-app"));
        if (topic) openCancelApplicationModal(topic);
      });
    });
    grid.querySelectorAll("[data-delete]").forEach((b) => {
      b.addEventListener("click", () => {
        const topic = state.topics.find((t) => t.id === b.getAttribute("data-delete"));
        if (topic) openDeleteModal(topic);
      });
    });
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
      '<p class="form-note note-center note-mt-14">' + (mode === "login" ? "还没有账号？点上面的「注册」" : "已有账号？点上面的「登录」") + '</p>';
  }

  function openAuthModal(opts) {
    opts = opts || {};
    const d = { nickname: opts.nickname || "", password: "", grade: (opts.grade || state.user && state.user.grade || GRADES[0]) };
    let mode = opts.mode === "register" ? "register" : "login";

    function render() {
      showModal('<h2 class="modal-title">登录 / 注册</h2><p class="modal-sub">登录后可以发布项目、申请加入、在话题里聊天。</p>' + authFormHtml(mode, d), true);
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
    if (!isLogged()) { state.inbox = []; state.myApplications = []; return; }
    try { const r = await Store.myApplications(); state.myApplications = r.applications || []; } catch (e) {}
    try { const r = await Store.inbox(); state.inbox = r.applications || []; } catch (e) {}
    await loadNotifications();
  }

  /* ================= 身份选择 ================= */
  function openRoleModal() {
    showModal(
      '<h2 class="modal-title">你是谁？</h2>' +
      '<p class="modal-sub">选择你的身份，ProjectHub 会带你去到对应的地方。</p>' +
      '<div class="role-options">' +
        '<button class="role-option" type="button" data-role="leader"><span class="role-icon">🧑‍💼</span><h3>项目负责人</h3><p>我有一个项目想法，想创建话题、招募队友。</p></button>' +
        '<button class="role-option" type="button" data-role="member"><span class="role-icon">🙋</span><h3>项目成员</h3><p>我想找感兴趣的项目，申请加入团队。</p></button>' +
      '</div>' +
      '<p class="form-note note-center note-mt-18"><button class="link-btn" type="button" data-login>' + (isLogged() ? "已登录：" + escapeHtml(state.user.nickname) : "已有账号？直接登录") + '</button></p>', false);
    $("#modal-content [data-role='leader']").addEventListener("click", openLeaderFlow);
    $("#modal-content [data-role='member']").addEventListener("click", openMemberFlow);
    const loginLink = $("#modal-content [data-login]");
    if (loginLink) loginLink.addEventListener("click", () => openAuthModal({ mode: "login" }));
  }

  /* ================= 项目负责人流程 ================= */
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
        html += '<h2 class="modal-title">你的项目涉及哪些方向？</h2><p class="modal-sub">参考中国高校专业方向，可多选，最多 5 个。</p><div class="major-grid">';
        MAJORS.forEach((m) => { html += '<button class="major-chip' + (d.directions.indexOf(m.id) >= 0 ? " is-on" : "") + '" type="button" data-major="' + m.id + '"><span class="mj-icon">' + m.icon + '</span>' + m.label + '</button>'; });
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
        html += '<h2 class="modal-title">公开话题还是私密话题？</h2><p class="modal-sub">公开话题按方向申请；私密话题需要 6 位密码才能申请。</p><div class="choice-grid">' +
          '<button class="choice-card' + (d.type === "public" ? " is-on" : "") + '" type="button" data-type="public"><span class="choice-icon">🔓</span><h4>公开话题</h4><p>设置申请加入所需的方向，符合方向的同学可以申请。</p></button>' +
          '<button class="choice-card' + (d.type === "private" ? " is-on" : "") + '" type="button" data-type="private"><span class="choice-icon">🔒</span><h4>私密话题</h4><p>设置 6 位密码，拿到密码的同学才能申请加入。</p></button>' +
          '</div><p class="wizard-hint" data-type-hint>' + (d.type ? "已选择：" + (d.type === "public" ? "公开话题" : "私密话题") : "请点击上面的卡片选择话题类型") + '</p>' +
          '<div class="wizard-foot"><button class="btn btn-quiet" type="button" data-prev>上一步</button><button class="btn btn-primary" type="button" data-next' + (d.type ? "" : " disabled") + '>下一步</button></div>';
        showModal(html, true);
        const box = modalContent, hint = box.querySelector("[data-type-hint]"), next = box.querySelector("[data-next]");
        box.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
          d.type = b.getAttribute("data-type");
          box.querySelectorAll("[data-type]").forEach((x) => x.classList.toggle("is-on", x === b));
          hint.textContent = "已选择：" + (d.type === "public" ? "公开话题" : "私密话题");
          next.disabled = false;
        }));
        box.querySelector("[data-prev]").addEventListener("click", () => go(0));
        next.addEventListener("click", () => { const i = flow.indexOf(1); go(flow[i + 1]); });
      }

      else if (step === 2) {
        html += '<h2 class="modal-title">注册账号</h2><p class="modal-sub">创建项目前，先注册一个账号。</p>' +
          '<div class="field"><label>昵称</label><input class="input js-nickname" type="text" placeholder="例如：陈同学" value="' + escapeHtml(d.nickname) + '"></div>' +
          '<div class="field"><label>密码</label><input class="input js-password" type="password" placeholder="至少 10 位"></div>' +
          '<div class="field"><label>大学几年级</label><select class="select js-grade">' + gradeOptions(d.grade) + '</select></div>' +
          '<p class="form-error js-reg-error" hidden></p>' +
          '<p class="form-note note-center"><button class="link-btn" type="button" data-login>已有账号？直接登录</button></p>' +
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
        html += '<h2 class="modal-title">创建项目</h2><p class="modal-sub">项目名称不能重复；创建后会生成一个专属项目编号。</p>';
        if (logged) html += '<p class="form-note">将使用你当前账号发布：<strong>' + escapeHtml(state.user.nickname) + '</strong>（无需再次注册）</p>';
        html += '<div class="field"><label>项目名称</label><input class="input js-title" type="text" placeholder="例如：校园智能垃圾分类系统" value="' + escapeHtml(d.title) + '"></div>' +
          '<div class="field"><label>项目简介</label><textarea class="textarea js-desc" placeholder="简单说说这个项目想做什么">' + escapeHtml(d.desc) + '</textarea></div>' +
          '<div class="field"><label>组内氛围</label><input class="input js-vibe" type="text" maxlength="60" placeholder="例如：轻松但高效，每周一次线上同步" value="' + escapeHtml(d.vibe) + '"></div>' +
          '<div class="form-row"><div class="field"><label>人数限制</label><input class="input js-limit" type="number" min="2" max="50" value="' + d.limit + '"></div><div class="field"><label>话题类型</label><input class="input" type="text" value="' + (d.type === "private" ? "🔒 私密话题" : "🔓 公开话题") + '" readonly></div></div>' +
          '<div class="field"><label>需要的成员标签（可多选）</label></div><div class="chip-grid" data-roles>';
        ROLE_TAGS.forEach((t) => { html += '<button class="chip' + (d.neededRoles.indexOf(t) >= 0 ? " is-on" : "") + '" type="button" data-role-tag="' + t + '">' + t + '</button>'; });
        html += '</div><p class="wizard-hint js-role-hint hint-left">已选 ' + d.neededRoles.length + ' 个标签' + (d.neededRoles.length ? '：' + escapeHtml(d.neededRoles.join("、")) : '（可以不选，也可以随时修改）') + '</p>';
        if (d.type === "public") {
          html += '<div class="field mt-18"><label>申请加入所需的项目方向（可多选，最多 5 个）</label></div><div class="major-grid">';
          MAJORS.forEach((m) => { html += '<button class="major-chip' + (d.required.indexOf(m.id) >= 0 ? " is-on" : "") + '" type="button" data-req="' + m.id + '"><span class="mj-icon">' + m.icon + '</span>' + m.label + '</button>'; });
          html += '</div>';
        } else {
          html += '<div class="field mt-18"><label>加入密码（6 位数字）</label><input class="input input-code js-code" type="password" inputmode="numeric" maxlength="6" placeholder="000000" value="' + escapeHtml(d.code) + '"></div><p class="form-note">同学申请加入时需要输入这 6 位密码。</p>';
        }
        html += '<p class="form-error js-create-error" hidden></p><div class="wizard-foot"><button class="btn btn-quiet" type="button" data-prev>上一步</button><button class="btn btn-primary" type="button" data-next>创建项目</button></div>';
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
          if (!title) { err.textContent = "请填写项目名称"; err.hidden = false; return; }
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
            showToast("项目已创建，项目编号已生成");
          } catch (e) {
            btn.disabled = false; btn.textContent = "创建项目";
            err.textContent = e.message || "创建失败"; err.hidden = false;
          }
        });
      }
    }
    render(0);
  }

  /* ================= 项目成员流程 ================= */
  function openMemberFlow() {
    const d = { directions: [], mode: null, nickname: "", password: "", grade: GRADES[0] };
    const steps = ["擅长方向", "访问方式", "注册 / 登录"];

    function mount(step) {
      let html = '<div class="wizard-steps">' + steps.map((s, i) => '<div class="wizard-dot' + (i <= step ? " is-active" : "") + '"></div>').join("") + '</div>';

      if (step === 0) {
        html += '<h2 class="modal-title">你擅长或愿意学习哪些方向？</h2><p class="modal-sub">可多选，最多 3 个。哪怕现在还需要学习，也可以先选上。</p><div class="major-grid">';
        MAJORS.forEach((m) => { html += '<button class="major-chip' + (d.directions.indexOf(m.id) >= 0 ? " is-on" : "") + '" type="button" data-major="' + m.id + '"><span class="mj-icon">' + m.icon + '</span>' + m.label + '</button>'; });
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
        html += '<h2 class="modal-title">如何访问话题广场？</h2><p class="modal-sub">所有同学都能搜索项目；只有登录用户才能申请加入和聊天。</p><div class="choice-grid">' +
          '<button class="choice-card' + (d.mode === "visitor" ? " is-on" : "") + '" type="button" data-mode="visitor"><span class="choice-icon">👀</span><h4>游客访问</h4><p>先逛逛、搜索项目，但不能申请加入。</p></button>' +
          '<button class="choice-card' + (d.mode === "member" ? " is-on" : "") + '" type="button" data-mode="member"><span class="choice-icon">✅</span><h4>登录 / 注册</h4><p>可以申请加入项目，和团队一起聊天。</p></button>' +
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
        html += '<h2 class="modal-title">注册账号</h2><p class="modal-sub">注册后就能申请加入项目。已有账号可以直接登录。</p>' +
          '<div class="field"><label>昵称</label><input class="input js-nickname" type="text" placeholder="例如：陈同学"></div>' +
          '<div class="field"><label>密码</label><input class="input js-password" type="password" placeholder="至少 10 位"></div>' +
          '<div class="field"><label>大学几年级</label><select class="select js-grade">' + gradeOptions(d.grade) + '</select></div>' +
          '<p class="form-error js-reg-error" hidden></p>' +
          '<p class="form-note note-center"><button class="link-btn" type="button" data-login>已有账号？直接登录</button></p>' +
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
      showToast(d.mode === "visitor" ? "已进入话题广场（游客模式）" : "欢迎来到话题广场");
    }

    mount(0);
  }

  /* ================= 打开项目 / 申请加入 ================= */
  async function refreshTopicList() {
    try { const r = await Store.topics(); state.topics = r.topics || []; renderTopicGrid(); } catch (e) {}
  }

  async function handleOpenTopic(topicId) {
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) return;
    if (isMember(topic)) { openChat(topicId); return; }
    if (!isLogged()) { showToast("请先登录再申请加入"); openAuthModal({ mode: "register", onDone: () => handleOpenTopic(topicId) }); return; }
    if (topic.members.length >= topic.limit) { showToast("该项目已经满员"); return; }
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
      '<h2 class="modal-title">申请加入项目</h2>' +
      '<p class="modal-sub">你的申请会以私信的形式发送给「' + escapeHtml(topic.members[0] ? topic.members[0].nickname : "负责人") + '」，由负责人决定是否通过。</p>' +
      '<div class="apply-card"><strong>' + escapeHtml(topic.title) + '</strong><span>' + escapeHtml(topicDirectionLabel(topic)) + '</span><span>组内氛围：' + escapeHtml(topic.vibe || "未填写") + '</span></div>' +
      (privateTopic ? '<div class="field"><label>加入密码（6 位数字）</label><input class="input input-code js-code" type="password" inputmode="numeric" maxlength="6" placeholder="000000"></div>' : '') +
      '<div class="field"><label>给负责人的留言（可选）</label><textarea class="textarea js-message" placeholder="简单介绍一下你的方向、能做什么，或者想在这个项目里学到什么"></textarea></div>' +
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

  /* ================= 删除项目 ================= */
  function openDeleteModal(topic) {
    if (!isLeader(topic)) { showToast("只有项目负责人或管理员才能删除该项目"); return; }
    showModal(
      '<h2 class="modal-title">确认删除这个项目？</h2>' +
      '<p class="modal-sub">「' + escapeHtml(topic.title) + '」删除后，话题内的聊天记录、成员和文件都会被一并移除，且无法恢复。</p>' +
      '<p class="form-note">项目编号：<span class="mono">' + escapeHtml(topic.code || "—") + '</span></p>' +
      '<label class="confirm-check"><input type="checkbox" class="js-confirm"><span>我确认要删除这个项目，并知道<strong>删除后无法恢复</strong>。</span></label>' +
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
        showToast("项目已删除");
      } catch (e) {
        confirmBtn.disabled = false; confirmBtn.textContent = "确认删除";
        showToast(e.message || "删除失败");
      }
    });
  }

  /* ================= 消息中心（私信） ================= */
  async function openInboxModal() {
    if (!isLogged()) { openAuthModal({ mode: "login" }); return; }
    showModal('<h2 class="modal-title">消息中心</h2><p class="modal-sub">同学申请加入你的项目时，会在这里以私信的形式出现。</p><div data-inbox-body><p class="modal-sub">正在加载…</p></div>', true);
    await loadPrivateData();
    renderHeader();
    renderInboxBody();
  }

  function renderInboxBody() {
    const box = modalContent.querySelector("[data-inbox-body]");
    if (!box) return;
    const list = state.inbox.slice().sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.createdAt - a.createdAt);
    if (!list.length) {
      box.innerHTML = '<div class="empty-inbox">暂时没有收到申请。<br>等你的项目有人申请时，这里会出现他们的私信。</div>';
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
          '<p class="msg-text">申请加入《' + escapeHtml(a.topicTitle || "项目") + '》</p>' +
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
      showToast(action === "approve" ? "已同意对方加入项目" : "已婉拒这次申请");
    } catch (e) { showToast(e.message || "操作失败"); }
  }

  /* ================= 管理员后台 ================= */
  function openAdminPanel() {
    if (!isAdmin()) { showToast("需要管理员权限"); return; }
    showModal('<h2 class="modal-title">管理中心</h2><p class="modal-sub">管理员可以封禁账号、删除任意项目。</p>' +
      '<div class="auth-tabs"><button class="auth-tab is-on" type="button" data-tab="users">用户管理</button><button class="auth-tab" type="button" data-tab="topics">项目管理</button><button class="auth-tab" type="button" data-tab="reports">举报处理</button></div>' +
      '<div data-admin-body><p class="modal-sub">正在加载…</p></div>', true);
    const box = modalContent;
    box.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      box.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("is-on", x === b));
      renderAdmin(b.getAttribute("data-tab"));
    }));
    renderAdmin("users");
  }

  async function renderAdmin(tab) {
    const box = modalContent.querySelector("[data-admin-body]");
    if (!box) return;
    box.innerHTML = '<p class="modal-sub">正在加载…</p>';
    try {
      if (tab === "users") {
        const r = await Store.adminUsers();
        box.innerHTML = '<ul class="admin-list">' + (r.users || []).map((u) =>
          '<li class="admin-row"><span class="m-avatar">' + escapeHtml((u.nickname || "用").slice(0, 1)) + '</span>' +
          '<span class="admin-name">' + escapeHtml(u.nickname) + '<em>' + escapeHtml(u.grade || "") + ' · ' + (u.role === "admin" ? "管理员" : "普通用户") + (u.banned ? " · 已封禁" : "") + '</em></span>' +
          '<span class="admin-meta">' + u.topicCount + ' 个项目</span>' +
          (u.role === "admin" ? '<span class="admin-meta">—</span>' : '<button class="btn ' + (u.banned ? "btn-ghost" : "btn-danger") + ' btn-small" data-ban="' + u.id + '" data-banned="' + (u.banned ? "1" : "0") + '">' + (u.banned ? "解封" : "封禁") + '</button>') +
          '</li>').join("") + '</ul>';
        box.querySelectorAll("[data-ban]").forEach((b) => b.addEventListener("click", async () => {
          const banned = b.getAttribute("data-banned") === "1";
          try {
            await Store.adminBan(b.getAttribute("data-ban"), !banned);
            renderAdmin("users");
            showToast(!banned ? "已封禁该账号" : "已解封该账号");
          } catch (e) { showToast(e.message || "操作失败"); }
        }));
      } else if (tab === "reports") {
        const r = await Store.adminReports();
        const list = r.reports || [];
        box.innerHTML = list.length ? '<ul class="admin-list">' + list.map((rep) =>
          '<li class="admin-row"><span class="admin-name">' + escapeHtml(rep.reason) + '<em>' + escapeHtml((rep.topicTitle || "（无关联项目）")) + ' · 举报人：' + escapeHtml(rep.reporterName || "") + ' · ' + formatDate(rep.createdAt) + (rep.status === "resolved" ? " · 已处理（" + escapeHtml(rep.handledBy || "") + "）" : "") + '</em></span>' +
          (rep.detail ? '<span class="admin-meta">' + escapeHtml(rep.detail.slice(0, 60)) + '</span>' : "") +
          (rep.status === "resolved" ? "" : '<button class="btn btn-primary btn-small" data-resolve="' + rep.id + '">标记已处理</button>') +
          '</li>').join("") + '</ul>' : '<div class="empty-inbox">暂无举报记录。</div>';
        box.querySelectorAll("[data-resolve]").forEach((b) => b.addEventListener("click", async () => {
          try { await Store.resolveReport(b.getAttribute("data-resolve")); renderAdmin("reports"); showToast("已标记为处理完成"); }
          catch (e) { showToast(e.message || "操作失败"); }
        }));
      } else {
        const r = await Store.topics();
        const topics = r.topics || [];
        box.innerHTML = topics.length ? '<ul class="admin-list">' + topics.map((t) =>
          '<li class="admin-row"><span class="admin-name">' + escapeHtml(t.title) + '<em>负责人：' + escapeHtml(t.members[0] ? t.members[0].nickname : "—") + ' · 编号 ' + escapeHtml(t.code || "—") + ' · ' + t.members.length + '/' + t.limit + '</em></span>' +
          '<button class="btn btn-danger btn-small" data-admin-delete="' + t.id + '">删除项目</button></li>').join("") + '</ul>'
          : '<div class="empty-inbox">现在还没有任何项目。</div>';
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
    state.replyTo = null;
    const side = $("#chat-side");
    if (side) side.classList.remove("is-open");
    const picker = $("#mention-picker");
    if (picker) picker.hidden = true;
    $("#view-plaza").hidden = false;
    $("#view-chat").hidden = true;
    renderPlaza();
  }

  async function openChat(topicId) {
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) return;
    currentTopicId = topicId;
    state.replyTo = null;
    const side = $("#chat-side");
    if (side) side.classList.remove("is-open");
    const picker = $("#mention-picker");
    if (picker) picker.hidden = true;
    $("#view-plaza").hidden = true;
    $("#view-chat").hidden = false;
    await Promise.all([loadMessages(topicId), loadFiles(topicId), loadAi(topicId)]);
    renderChat(topicId);
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
    div.className = "msg" + (mine ? " mine" : "");
    div.innerHTML =
      '<div class="msg-author">' + escapeHtml(name) +
        (member && member.tag ? " · " + escapeHtml(member.tag) : "") +
        (role ? '<span class="role">' + role + '</span>' : "") + '</div>' +
      (m.replyTo ? '<div class="msg-quote">引用 ' + escapeHtml(m.replyTo.authorName || "") + '：' + escapeHtml(m.replyTo.text || "") + '</div>' : "") +
      '<div class="bubble">' + highlightMentions(m.text, topic) + '</div>' +
      '<div class="msg-time">' + escapeHtml(timeText) + (m.edited ? " · 已编辑" : "") + '</div>' +
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

    renderAnnouncement(topic);
    renderAiPanel(topic);
    renderReplyBar();

    $("#chat-title").textContent = topic.title;
    const typeText = topic.type === "public" ? ("公开话题 · 申请需要 " + (requiredLabels(topic) || "不限")) : "私密话题 · 需要 6 位密码";
    $("#chat-meta").innerHTML = escapeHtml(typeText) + " · " + escapeHtml(topicDirectionLabel(topic)) + " · <span class='mono'>" + topic.members.length + "/" + topic.limit + "</span>";
    $("#chat-member-count").textContent = topic.members.length + "/" + topic.limit;

    const ai = state.ai[topic.id];
    const aiBtn = $("#btn-ai-panel");
    if (aiBtn) aiBtn.hidden = !(ai && (ai.enabled || canManage));

    const vibeEl = $("#chat-vibe");
    if (vibeEl) vibeEl.textContent = "组内氛围：" + (topic.vibe || "负责人还没有填写");
    const codeEl = $("#chat-code");
    if (codeEl) { if (topic.code && canManage) { codeEl.hidden = false; codeEl.textContent = "项目编号：" + topic.code; } else codeEl.hidden = true; }
    const missing = missingTags(topic);
    const rolesInfo = (topic.neededRoles || []).length
      ? ("需要角色：" + topic.neededRoles.join(" / ") + (missing.length ? "　还缺：" + missing.join(" / ") : "　角色已齐 ✓"))
      : "";
    const rolesEl = $("#chat-roles");
    if (rolesEl) { rolesEl.textContent = rolesInfo; rolesEl.hidden = !rolesInfo; }
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
    try {
      const r = await Store.sendMessage(currentTopicId, text, reply);
      const list = state.messages[currentTopicId] = state.messages[currentTopicId] || [];
      if (r.message && !list.some((m) => m.id === r.message.id)) list.push(r.message);
      renderChat(currentTopicId);
    } catch (e) {
      input.value = text;
      state.replyTo = reply;
      renderReplyBar();
      showToast(e.message || "发送失败");
    }
  }

  function handleFilePick(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file || !currentTopicId) return;
    const ext = ("." + file.name.split(".").pop()).toLowerCase();
    if ([".doc", ".docx", ".jpg", ".jpeg", ".png"].indexOf(ext) < 0) { showToast("只支持 Word 文档和 jpg / png 图片"); return; }
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
  const sig = { topics: "", apps: "", inbox: "", chat: "", files: "", ai: "", notif: "" };
  const aiOpen = {};          // 每个话题的 AI 面板是否展开
  let lastNotifId = "";

  async function refreshAll() {
    if (!state.online) return;
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
          if (!live) { showPlaza(); showToast("该项目已被负责人删除"); return; }
          if (!isMember(live) && !isAdmin()) { showPlaza(); showToast("你已被移出该项目"); return; }
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
              showToast("你的申请已通过：" + (t ? t.title : "项目"));
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
        if (e && e.status === 403) { showPlaza(); showToast("你已不在该项目中，无法查看聊天"); return; }
      }
      try {
        const r = await Store.files(currentTopicId);
        const fj = JSON.stringify(r.files || []);
        if (fj !== sig.files) { sig.files = fj; state.files[currentTopicId] = r.files || []; renderFileList(state.topics.find((t) => t.id === currentTopicId)); }
      } catch (e) {}
      try {
        const r = await Store.ai(currentTopicId);
        const aj = JSON.stringify(r.ai || {});
        if (aj !== sig.ai) {
          sig.ai = aj;
          state.ai[currentTopicId] = r.ai || null;
          const t = state.topics.find((x) => x.id === currentTopicId);
          if (t) { renderAnnouncement(t); renderAiPanel(t); }
        }
      } catch (e) {}
    }
  }

  /* ================= AI 助手 ================= */
  async function loadAi(topicId) {
    try { const r = await Store.ai(topicId); state.ai[topicId] = r.ai || null; }
    catch (e) { state.ai[topicId] = state.ai[topicId] || null; }
  }

  function renderAnnouncement(topic) {
    const el = $("#chat-announcement");
    if (!el) return;
    const ai = state.ai[topic.id];
    const ann = ai && ai.announcement;
    if (!ann) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = '<span class="ann-tag">📌 项目公告' + (ann.round ? " · 第 " + ann.round + " 轮" : "") + '</span><div class="ann-text">' + escapeHtml(ann.text) + '</div>';
  }

  function renderAiPanel(topic) {
    const panel = $("#chat-ai");
    if (!panel) return;
    const ai = state.ai[topic.id];
    const owner = isLeader(topic);
    if (!ai) { panel.hidden = true; panel.innerHTML = ""; return; }
    if (!ai.enabled && !owner) { panel.hidden = true; panel.innerHTML = ""; return; }
    panel.hidden = false;
    const open = !!aiOpen[topic.id];
    panel.classList.toggle("is-collapsed", !open);

    if (!ai.enabled) {
      panel.innerHTML = '<div class="ai-head"><span class="ai-badge">AI 助手</span><span class="ai-status">未引入</span>' +
        (owner ? '<label class="ai-switch"><input type="checkbox" class="js-ai-toggle"> 引入 AI 助手</label>' : '') + '</div>' +
        '<p class="ai-note">' + (owner ? "打开开关即可为这个项目引入 AI 助手。它不会主动发言，只有你点击「开始思考」时才会工作。" : "项目负责人还没有为这个项目引入 AI 助手。") + '</p>';
      wireAiPanel(topic);
      return;
    }

    const statusText = {
      idle: "待命中", thinking: "正在思考…", voting: "投票中",
      rethink: "本轮选择「再想想」", decided: "方案已通过", assigned: "深度分工已完成"
    }[ai.status] || "待命中";
    const src = ai.model || (ai.config && ai.config.label) || "本地演示模式";

    const phaseText = {
      ANALYZE: "分析需求", CLARIFY: "等待继续讨论", RESEARCH: "检索资料", GENERATE: "生成方案",
      EVALUATE: "方案比较", RECOMMEND: "等待负责人确认", WAIT_FOR_LEADER: "等待负责人确认",
      DECOMPOSE: "拆解任务", ASSIGN: "分配任务"
    }[ai.phase] || "";
    let summary = (phaseText ? phaseText + " · " : "") + statusText;
    if (ai.status === "voting") summary = "投票中 · " + ai.voters + "/" + ai.totalMembers + " 人已投";
    else if (ai.deepMine) summary = "已生成你的任务分工";
    else if (ai.draft) summary = "已生成方案草稿与 " + Math.max(0, (ai.options || []).length - 1) + " 个方案";

    let head = '<div class="ai-head"><span class="ai-badge">AI</span><span class="ai-status">' + escapeHtml(summary) + '</span>' +
      '<span class="ai-src">' + escapeHtml(src) + '</span>' +
      '<button class="ai-collapse" type="button" data-ai-collapse>' + (open ? "收起" : "展开") + '</button>' +
      (owner ? '<label class="ai-switch"><input type="checkbox" class="js-ai-toggle" checked> 开启</label>' : '') +
      '</div>';

    let body = "";
    if (owner) {
      body += '<div class="ai-actions">' +
        '<button class="btn btn-primary btn-small" type="button" data-ai-think' + (ai.status === "thinking" ? " disabled" : "") + '>' + (ai.status === "thinking" ? "AI 正在思考…" : "开始思考") + '</button>' +
        (ai.status === "voting" ? '<button class="btn btn-quiet btn-small" type="button" data-ai-close>结束投票</button>' : '') +
        (ai.canDeep ? '<button class="btn btn-danger btn-small" type="button" data-ai-deep>就是你啦！！</button>' : '') +
        '</div>';
    }
    body += '<p class="ai-note">AI 不会主动提出建议，只有负责人点击「开始思考」后才会工作。' + ((ai.rounds || 0) >= 1 ? '（已完成 ' + ai.rounds + ' 轮）' : '') + '</p>';

    if (ai.status === "thinking") {
      body += '<div class="ai-thinking"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span> AI 正在读聊天记录、整理可实施的项目方案…</div>';
    }

    if (ai.draft) {
      body += '<details class="ai-draft"><summary>查看项目方案草稿</summary><pre>' + escapeHtml(ai.draft) + '</pre></details>';
    }

    if (ai.status === "voting" && ai.options && ai.options.length) {
      body += '<div class="ai-vote"><p class="ai-vote-title">匿名投票：选一个你最认可、最想做的方案（' + ai.voters + "/" + ai.totalMembers + ' 人已投）</p>';
      ai.options.forEach((o) => {
        const pct = ai.voters ? Math.round((o.votes / Math.max(1, ai.voters)) * 100) : 0;
        const mine = ai.myVote === o.id;
        body += '<div class="ai-option' + (mine ? " is-mine" : "") + '">' +
          '<div class="ai-option-top"><strong>' + escapeHtml(o.title) + '</strong><span class="ai-count">' + o.votes + ' 票</span></div>' +
          (o.desc ? '<p class="ai-option-desc">' + escapeHtml(o.desc) + '</p>' : '') +
          (o.reason ? '<p class="ai-option-reason">推荐理由：' + escapeHtml(o.reason) + '</p>' : '') +
          '<div class="ai-bar"><span data-w="' + pct + '"></span></div>' +
          '<button class="btn ' + (mine ? "btn-primary" : "btn-ghost") + ' btn-small" type="button" data-ai-vote="' + o.id + '">' + (mine ? "你已投这一项" : "投这一项") + '</button>' +
          '</div>';
      });
      body += '</div>';
    }

    if (ai.deepMine) {
      body += '<div class="ai-deep"><p class="ai-deep-title">你的任务分工与建议</p>' +
        '<p><strong>任务：</strong>' + escapeHtml(ai.deepMine.task) + '</p>' +
        '<p class="ai-deep-sub">需要的理论基础书目</p><ul class="ai-books">' + (ai.deepMine.books || []).map((b) => '<li>' + escapeHtml(b) + '</li>').join("") + '</ul>' +
        '<p><strong>给你的建议：</strong>' + escapeHtml(ai.deepMine.suggestion) + '</p></div>';
    }
    if (owner && ai.deepAll && ai.deepAll.items) {
      body += '<details class="ai-deep-all"><summary>查看全部成员的任务分工（仅负责人可见）</summary>';
      ai.deepAll.items.forEach((it) => {
        body += '<div class="ai-deep-item"><p class="ai-deep-name">' + escapeHtml(it.nickname) + '</p>' +
          '<p><strong>任务：</strong>' + escapeHtml(it.task) + '</p>' +
          '<ul class="ai-books">' + (it.books || []).map((b) => '<li>' + escapeHtml(b) + '</li>').join("") + '</ul>' +
          '<p><strong>建议：</strong>' + escapeHtml(it.suggestion) + '</p></div>';
      });
      body += '</details>';
    }

    panel.innerHTML = head + '<div class="ai-body">' + body + '</div>';
    panel.querySelectorAll("[data-w]").forEach((el) => { try { el.style.width = el.getAttribute("data-w") + "%"; } catch (e) {} });
    wireAiPanel(topic);
    const collapseBtn = panel.querySelector("[data-ai-collapse]");
    if (collapseBtn) collapseBtn.addEventListener("click", () => { aiOpen[topic.id] = !open; renderAiPanel(topic); });
  }

  function wireAiPanel(topic) {
    const panel = $("#chat-ai");
    const toggle = panel.querySelector(".js-ai-toggle");
    if (toggle) toggle.addEventListener("change", () => aiAction(topic, "toggle", { enabled: toggle.checked }));
    const think = panel.querySelector("[data-ai-think]");
    if (think) think.addEventListener("click", () => aiAction(topic, "think"));
    const closeBtn = panel.querySelector("[data-ai-close]");
    if (closeBtn) closeBtn.addEventListener("click", () => aiAction(topic, "close"));
    const deep = panel.querySelector("[data-ai-deep]");
    if (deep) deep.addEventListener("click", () => aiAction(topic, "deep"));
    panel.querySelectorAll("[data-ai-vote]").forEach((b) => b.addEventListener("click", () => aiAction(topic, "vote", { optionId: b.getAttribute("data-ai-vote") })));
  }

  async function aiAction(topic, action, payload) {
    try {
      if (action === "toggle") {
        await Store.aiToggle(topic.id, payload.enabled);
        showToast(payload.enabled ? "已引入 AI 助手（它不会主动发言）" : "已关闭 AI 助手");
      } else if (action === "think") {
        showToast("AI 开始思考，正在汇总聊天记录…");
        await Store.aiThink(topic.id);
        showToast("AI 已给出发展方向，请投票");
      } else if (action === "vote") {
        await Store.aiVote(topic.id, payload.optionId);
        showToast("投票成功（匿名）");
      } else if (action === "close") {
        await Store.aiClose(topic.id);
      } else if (action === "deep") {
        showToast("AI 正在深度思考，为大家分配任务…");
        await Store.aiDeep(topic.id);
        showToast("深度分工已完成");
      }
      await loadAi(topic.id);
      renderAnnouncement(topic);
      renderAiPanel(topic);
      const now = state.ai[topic.id];
      if (action === "close" && now && now.announcement) showToast("方案已通过，已置顶为项目公告");
    } catch (e) {
      showToast(e.message || "AI 操作失败");
      await loadAi(topic.id);
      renderAiPanel(topic);
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
  }

  function openNotifications() {
    if (!isLogged()) { openAuthModal({ mode: "login" }); return; }
    const list = state.notifications || [];
    const typeLabel = { message: "新消息", mention: "@ 提醒", apply: "入组申请", application_cancelled: "取消申请", approved: "申请通过", rejected: "申请结果", removed: "移出项目", file: "新文件", announcement: "项目公告" };
    showModal('<h2 class="modal-title">消息提醒</h2><p class="modal-sub">有人发消息、@ 你，或者项目有变化时，会在这里提醒你。</p>' +
      (list.length ? '<ul class="msg-list">' + list.map((n) =>
        '<li class="msg-row bell-row" data-notif="' + n.id + '" data-topic="' + (n.topicId || "") + '">' +
        '<span class="msg-avatar">' + (n.from ? escapeHtml(n.from.slice(0, 1)) : "🔔") + '</span>' +
        '<div class="msg-body"><div class="msg-head">' + (n.read ? "" : '<span class="bell-unread"></span>') + '<strong>' + escapeHtml(n.from || "系统") + '</strong>' +
        '<span class="msg-sub">' + escapeHtml(typeLabel[n.type] || "通知") + " · " + formatDate(n.at) + '</span></div>' +
        '<p class="msg-text">' + escapeHtml(n.text || "") + '</p>' +
        (n.topicTitle ? '<p class="msg-quote">来自《' + escapeHtml(n.topicTitle) + '》</p>' : "") +
        '</div></li>').join("") + '</ul>' : '<div class="empty-inbox">还没有新消息。<br>有人给你发消息或 @ 你时，这里会出现提醒。</div>'), true);
    const box = modalContent;
    box.querySelectorAll("[data-notif]").forEach((row) => row.addEventListener("click", async () => {
      const topicId = row.getAttribute("data-topic");
      hideModal();
      if (topicId) {
        const t = state.topics.find((x) => x.id === topicId);
        if (t && (isMember(t) || isAdmin())) openChat(topicId);
        else if (t) showToast("你需要先加入这个项目才能查看");
        else showToast("该项目已不存在");
      }
      try { await Store.readNotifications({ all: true }); } catch (e) {}
      await loadNotifications();
    }));
    Store.readNotifications({ all: true }).then(() => loadNotifications()).catch(() => {});
  }

  /* ================= 事件与启动 ================= */
  function bindEvents() {
    $("#search-input").addEventListener("input", (e) => { state.search = e.target.value; renderTopicGrid(); });
    $("#btn-switch").addEventListener("click", openRoleModal);
    $("#btn-create").addEventListener("click", () => { if (!isLogged()) { openAuthModal({ mode: "register", onDone: openLeaderFlow }); return; } openLeaderFlow(); });
    $("#btn-auth").addEventListener("click", () => openAuthModal({ mode: "login" }));
    $("#btn-logout").addEventListener("click", async () => {
      try { await Store.logout(); } catch (e) {}
      clearSession();
      if (sseSource) { try { sseSource.close(); } catch (e) {} sseSource = null; }
      renderPlaza();
      showToast("已退出登录");
      openRoleModal();
    });
    $("#btn-inbox").addEventListener("click", openInboxModal);
    const bell = $("#btn-bell");
    if (bell) bell.addEventListener("click", openNotifications);
    const reportBtn = $("#btn-report");
    if (reportBtn) reportBtn.addEventListener("click", () => {
      const t = state.topics.find((x) => x.id === currentTopicId);
      if (t) openReportModal(t);
    });
    const sideBtn = $("#btn-side");
    if (sideBtn) sideBtn.addEventListener("click", () => $("#chat-side").classList.add("is-open"));
    const sideClose = $("#btn-side-close");
    if (sideClose) sideClose.addEventListener("click", () => $("#chat-side").classList.remove("is-open"));
    const aiBtn = $("#btn-ai-panel");
    if (aiBtn) aiBtn.addEventListener("click", () => {
      if (!currentTopicId) return;
      aiOpen[currentTopicId] = !aiOpen[currentTopicId];
      const t = state.topics.find((x) => x.id === currentTopicId);
      if (t) renderAiPanel(t);
    });
    const mentionBtn = $("#btn-mention");
    if (mentionBtn) mentionBtn.addEventListener("click", () => renderMentionPicker($("#mention-picker").hidden));
    const chatInput = $("#chat-input");
    if (chatInput) chatInput.addEventListener("input", (e) => { if (e.target.value.slice(-1) === "@") renderMentionPicker(true); });
    $("#btn-admin").addEventListener("click", openAdminPanel);
    $("#btn-back").addEventListener("click", showPlaza);
    $("#chat-form").addEventListener("submit", sendMessage);
    const fileInput = $("#file-input");
    if (fileInput) fileInput.addEventListener("change", handleFilePick);
    const emptyCreate = $("#empty-create-btn");
    if (emptyCreate) emptyCreate.addEventListener("click", () => { if (!isLogged()) { openAuthModal({ mode: "register", onDone: openLeaderFlow }); return; } openLeaderFlow(); });
    const sideDelete = $("#btn-delete-topic");
    if (sideDelete) sideDelete.addEventListener("click", () => {
      const topic = state.topics.find((t) => t.id === currentTopicId);
      if (topic) openDeleteModal(topic);
    });
    modalClose.addEventListener("click", () => { if (modalClosable) hideModal(); });
    modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay && modalClosable) hideModal(); });
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
      const es = new EventSource("api/events?ticket=" + encodeURIComponent(r.ticket));
      sseSource = es;
      ["topics", "message", "applications", "files", "ai", "notify"].forEach((ev) => es.addEventListener(ev, refreshAll));
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

  async function init() {
    loadSession();
    bindEvents();
    try {
      await Store.health();
      state.online = true;
      const r = await Store.topics();
      state.topics = r.topics || [];
      sig.topics = JSON.stringify(state.topics);
      if (isLogged()) {
        try { const me = await api("GET", "api/me"); state.user = me.user; saveSession(); } catch (e) { clearSession(); }
        await loadPrivateData();
      }
      renderPlaza();
      if (!isLogged()) openRoleModal();
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
