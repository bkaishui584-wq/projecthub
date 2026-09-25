(function () {
    "use strict";

    var STATES = [
        ["passive", "旁观"],
        ["thinking", "思考中"],
        ["analyzing", "分析中"],
        ["suggesting", "生成研究建议"],
        ["waiting", "等待负责人"]
    ];

    var ProjectHubAgent = {
        state: "passive",
        enabled: true,
        projectId: null,
        isLeader: false,
        isAdmin: false,
        initialized: false,
        open: false,
        panel: null,
        launcher: null,
        metrics: { discussions: 0, directions: 0, questions: 0, materials: 0 },
        lastResult: null,

        init: function (options) {
            options = options || {};
            var hasProject = Object.prototype.hasOwnProperty.call(options, "projectId");
            this.projectId = hasProject ? options.projectId : (window.currentProjectId || null);
            if (Object.prototype.hasOwnProperty.call(options, "isLeader")) this.isLeader = Boolean(options.isLeader);
            if (Object.prototype.hasOwnProperty.call(options, "isAdmin")) this.isAdmin = Boolean(options.isAdmin);
            if (!this.initialized) {
                this.initialized = true;
                this.createShell();
                this.bindEvents();
            }
            if (!this.projectId) {
                this.lastResult = null;
                this.hide();
                return;
            }
            this.showLauncher();
            this.refreshStatus();
        },

        createShell: function () {
            if (!document.getElementById("projecthub-agent-panel")) {
                var launcher = document.createElement("button");
                launcher.id = "projecthub-agent-launcher";
                launcher.className = "pa-launcher";
                launcher.type = "button";
                launcher.hidden = true;
                launcher.innerHTML = '<span class="pa-launcher-core"></span><span>PROJECT AGENT</span>';
                document.body.appendChild(launcher);
                this.launcher = launcher;

                var panel = document.createElement("aside");
                panel.id = "projecthub-agent-panel";
                panel.className = "projecthub-agent-panel";
                panel.hidden = true;
                panel.setAttribute("aria-label", "Project Agent 项目智能中枢");
                panel.innerHTML = [
                    '<div class="pa-shell">',
                    '<header class="pa-header">',
                    '<div class="pa-mark" aria-hidden="true"><span></span><i></i><b></b><em></em></div>',
                    '<div class="pa-heading"><strong>PROJECT AGENT</strong><span>RESEARCH INTELLIGENCE CORE</span></div>',
                    '<span class="pa-state" data-agent-state>旁观</span>',
                    '<button class="pa-close" type="button" data-agent-close aria-label="关闭 Agent">×</button>',
                    '</header>',
                    '<div class="pa-scroll">',
                    '<section class="pa-state-block"><div><span class="pa-kicker">STATUS</span><h3 data-agent-state-text>等待负责人授权</h3><p data-agent-state-desc>Agent 默认旁观，不会主动读取或分析项目内容。</p></div><div class="pa-core" aria-hidden="true"><span></span><span></span><span></span><span></span><i></i></div></section>',
                    '<div class="pa-progress" data-agent-progress></div>',
                    '<section class="pa-section"><div class="pa-section-title"><span>当前项目</span><small>PROJECT SIGNAL</small></div><div class="pa-metrics" data-agent-metrics></div></section>',
                    '<section class="pa-section"><div class="pa-section-title"><span>Agent 能力</span><small>CAPABILITIES</small></div><div class="pa-capabilities"><span>项目信息</span><span>已识别信息</span><span>待解决问题</span><span>研究方向</span><span>相关理论</span></div></section>',
                    '<section class="pa-actions" data-agent-actions></section>',
                    '<section class="pa-result" data-agent-result hidden></section>',
                    '<section class="pa-admin" data-agent-admin hidden></section>',
                    '</div></div>'
                ].join("");
                document.body.appendChild(panel);
                this.panel = panel;
            } else {
                this.panel = document.getElementById("projecthub-agent-panel");
                this.launcher = document.getElementById("projecthub-agent-launcher");
            }
        },

        bindEvents: function () {
            var self = this;
            if (this.launcher) this.launcher.addEventListener("click", function () { self.openPanel(); });
            if (this.panel) {
                var close = this.panel.querySelector("[data-agent-close]");
                if (close) close.addEventListener("click", function () { self.closePanel(); });
                this.panel.addEventListener("click", function (event) {
                    if (event.target === self.panel) self.closePanel();
                });
            }
            document.addEventListener("keydown", function (event) {
                if (event.key === "Escape" && self.open) self.closePanel();
            });
        },

        csrfToken: function () {
            var match = document.cookie.match(/(?:^|;\s*)ph_csrf=([^;]+)/);
            return match ? decodeURIComponent(match[1]) : "";
        },

        requestJson: function (url, options) {
            var self = this;
            options = options || {};
            var method = String(options.method || "GET").toUpperCase();
            var headers = Object.assign({}, options.headers || {});
            headers["Content-Type"] = "application/json";
            if (["POST", "PATCH", "DELETE"].indexOf(method) >= 0) {
                var csrf = this.csrfToken();
                if (csrf) headers["X-CSRF-Token"] = csrf;
            }
            return fetch(url, Object.assign({ credentials: "same-origin" }, options, { headers: headers })).then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (data) {
                    if (!response.ok) throw new Error(data.error || "请求失败");
                    return data;
                });
            });
        },

        hide: function () {
            this.open = false;
            if (this.launcher) this.launcher.hidden = true;
            if (this.panel) {
                this.panel.classList.remove("is-open");
                this.panel.hidden = true;
            }
        },

        showLauncher: function () {
            if (this.launcher) this.launcher.hidden = false;
        },

        openPanel: function () {
            if (!this.projectId || !this.panel) return;
            var self = this;
            this.open = true;
            this.panel.hidden = false;
            if (this.launcher) this.launcher.hidden = true;
            requestAnimationFrame(function () { self.panel.classList.add("is-open"); });
            this.refreshStatus();
        },

        closePanel: function () {
            var self = this;
            this.open = false;
            if (this.panel) {
                this.panel.classList.remove("is-open");
                window.setTimeout(function () { if (!self.open && self.panel) self.panel.hidden = true; }, 180);
            }
            this.showLauncher();
        },

        refreshStatus: function () {
            var self = this;
            if (!this.projectId) { this.hide(); return Promise.resolve(); }
            return this.requestJson("/api/agent/status?projectId=" + encodeURIComponent(this.projectId)).then(function (data) {
                var agent = data.agent || {};
                self.state = agent.state || "passive";
                self.enabled = agent.enabled !== false;
                self.isLeader = Boolean(agent.isLeader);
                self.isAdmin = Boolean(agent.isAdmin);
                self.metrics = agent.metrics || self.metrics;
                self.render();
            }).catch(function (error) {
                self.renderError(error.message || "Agent 状态读取失败");
            });
        },

        render: function () {
            if (!this.panel) return;
            var info = this.stateInfo(this.state);
            this.panel.dataset.state = this.state;
            var badge = this.panel.querySelector("[data-agent-state]");
            badge.textContent = info.label;
            badge.dataset.state = this.state;
            this.panel.querySelector("[data-agent-state-text]").textContent = info.title;
            this.panel.querySelector("[data-agent-state-desc]").textContent = this.enabled ? info.desc : "Agent 已被管理员关闭，当前不会执行分析。";
            this.renderProgress();
            this.renderMetrics();
            this.renderActions();
            this.renderAdmin();
            if (this.lastResult) this.renderResult(this.lastResult);
        },

        renderError: function (message) {
            if (!this.panel) return;
            this.panel.querySelector("[data-agent-state-text]").textContent = "状态读取失败";
            this.panel.querySelector("[data-agent-state-desc]").textContent = message;
        },

        stateInfo: function (state) {
            var map = {
                passive: { label: "旁观", title: "等待负责人授权", desc: "Agent 默认旁观，不会主动读取或分析项目内容。" },
                thinking: { label: "思考中", title: "已获得本轮思考授权", desc: "负责人可以开始分析，Agent 不会替项目组做最终决定。" },
                analyzing: { label: "分析中", title: "正在分析项目材料", desc: "Agent 正在整理讨论、提取问题并关联研究资料。" },
                suggesting: { label: "生成研究建议", title: "正在生成研究建议", desc: "输出会区分项目信息、外部资料与模型推测。" },
                waiting: { label: "等待负责人", title: "本轮分析已完成", desc: "结果仅供负责人判断，采用与否由项目组决定。" }
            };
            return map[state] || map.passive;
        },

        renderProgress: function () {
            var box = this.panel.querySelector("[data-agent-progress]");
            if (!box) return;
            var current = 0;
            for (var i = 0; i < STATES.length; i += 1) if (STATES[i][0] === this.state) current = i;
            box.innerHTML = STATES.map(function (item, index) {
                var cls = "pa-step" + (index < current ? " is-done" : "") + (index === current ? " is-active" : "");
                return '<span class="' + cls + '" data-step="' + item[0] + '"><i></i><small>' + item[1] + '</small></span>';
            }).join("");
        },

        renderMetrics: function () {
            var box = this.panel.querySelector("[data-agent-metrics]");
            if (!box) return;
            var rows = [["项目讨论", this.metrics.discussions || 0, "条"], ["研究方向", this.metrics.directions || 0, "个"], ["待确认问题", this.metrics.questions || 0, "个"], ["研究资料", this.metrics.materials || 0, "份"]];
            box.innerHTML = rows.map(function (row) {
                return '<div class="pa-metric"><span>' + row[0] + '</span><strong>' + (Number(row[1]) || 0) + '</strong><small>' + row[2] + '</small></div>';
            }).join("");
        },

        renderActions: function () {
            var self = this;
            var box = this.panel.querySelector("[data-agent-actions]");
            if (!box) return;
            if (!this.enabled) { box.innerHTML = '<div class="pa-notice">Agent 当前已被管理员关闭。</div>'; return; }
            if (this.isLeader && (this.state === "passive" || this.state === "waiting")) {
                box.innerHTML = '<button class="pa-primary" type="button" data-agent-authorize>授权 Agent 思考</button><p class="pa-note">授权后 Agent 才会进入 THINKING。它不会自动修改项目数据。</p>';
                box.querySelector("[data-agent-authorize]").addEventListener("click", function () { self.authorize(); });
                return;
            }
            if (this.isLeader && this.state === "thinking") {
                box.innerHTML = '<button class="pa-primary" type="button" data-agent-analyze>开始本轮分析</button><p class="pa-note">分析结果只提供研究角度、问题和建议，最终决定由负责人作出。</p>';
                box.querySelector("[data-agent-analyze]").addEventListener("click", function () { self.analyze(); });
                return;
            }
            if (this.state === "analyzing" || this.state === "suggesting") {
                box.innerHTML = '<div class="pa-running"><i></i><span>Agent 正在处理本轮任务，请稍候。</span></div>';
                return;
            }
            box.innerHTML = '<div class="pa-notice">Agent 正在等待项目负责人授权。</div>';
        },

        authorize: function () {
            var self = this;
            if (!this.projectId || !this.isLeader) return Promise.resolve();
            return this.requestJson("/api/agent/authorize", { method: "POST", body: JSON.stringify({ projectId: this.projectId }) }).then(function (data) {
                self.state = data.agent && data.agent.state ? data.agent.state : "thinking";
                self.render();
                self.message("Agent 已获得本轮思考授权");
            }).catch(function (error) {
                return self.refreshStatus().then(function () { self.message(error.message || "Agent 授权失败"); });
            });
        },

        analyze: function () {
            var self = this;
            if (!this.projectId || !this.isLeader) return Promise.resolve();
            var box = this.panel.querySelector("[data-agent-actions]");
            if (box) box.innerHTML = '<div class="pa-running"><i></i><span>Agent 正在读取项目内容并生成研究建议…</span></div>';
            return this.requestJson("/api/agent/analyze", { method: "POST", body: JSON.stringify({ projectId: this.projectId }) }).then(function (data) {
                var agent = data.agent || {};
                self.state = agent.state || "waiting";
                self.lastResult = agent.result || null;
                self.render();
                self.message("Agent 已完成本轮分析");
            }).catch(function (error) {
                return self.refreshStatus().then(function () { self.message(error.message || "Agent 分析失败"); });
            });
        },

        renderResult: function (result) {
            var box = this.panel.querySelector("[data-agent-result]");
            if (!box) return;
            var view = this.normalizeResult(result);
            var groups = [["项目摘要", view.summary ? [view.summary] : []], ["关键发现", view.findings], ["待确认问题", view.questions], ["研究角度", view.angles], ["研究建议", view.suggestions], ["信息缺口", view.gaps], ["证据来源", view.evidence]].filter(function (pair) { return pair[1].length; });
            box.hidden = false;
            box.innerHTML = '<div class="pa-section-title"><span>本轮研究结果</span><small>RESEARCH OUTPUT</small></div>' + groups.map(function (pair) {
                return '<article class="pa-result-card"><h4>' + pair[0] + '</h4><div class="pa-result-list">' + pair[1].slice(0, 8).map(function (item) { return this.renderResultItem(item); }, this).join("") + '</div></article>';
            }, this).join("");
        },

        normalizeResult: function (result) {
            var outer = result && typeof result === "object" ? result : {};
            var core = outer.data && typeof outer.data === "object" ? outer.data : outer;
            var analysis = outer.analysis || core.analysis || {};
            function toList(value) { return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
            var questionItems = toList(core.open_questions).map(function (item) { return item && item.content ? item.content : item; }).filter(Boolean);
            var analysisQuestions = toList(analysis.open_questions).map(function (item) { return item && item.content ? item.content : item; }).filter(Boolean);
            var generated = toList(outer.generated_suggestions).map(function (item) { return item && item.content ? item.content : item; });
            var evidence = [];
            toList(outer.tool_results).forEach(function (item) {
                var nested = item && item.result && item.result.data;
                toList(nested && (nested.evidence || nested.results)).forEach(function (source) { evidence.push(source); });
            });
            toList(core.evidence).forEach(function (source) { evidence.push(source); });
            return { summary: core.summary || core.message || "", findings: toList(core.important_information), questions: questionItems.concat(analysisQuestions), angles: toList(core.research_angles), suggestions: toList(core.suggestions).concat(generated), gaps: toList(core.information_gaps), evidence: evidence };
        },

        renderResultItem: function (item) {
            var text = typeof item === "string" ? item : (item && (item.content || item.text || item.title || item.summary)) || JSON.stringify(item);
            var source = item && typeof item === "object" ? String(item.source_category || item.evidence_type || "").toLowerCase() : "";
            return '<div class="pa-result-item">' + (source === "external" ? '<span class="pa-external">EXTERNAL</span>' : "") + '<p>' + this.escapeHtml(text) + '</p></div>';
        },

        renderAdmin: function () {
            var self = this;
            var box = this.panel.querySelector("[data-agent-admin]");
            if (!box) return;
            if (!this.isAdmin) { box.hidden = true; box.innerHTML = ""; return; }
            box.hidden = false;
            box.innerHTML = '<div class="pa-section-title"><span>管理员控制</span><small>ADMIN SAFETY</small></div><div class="pa-admin-grid"><button type="button" data-agent-toggle>' + (this.enabled ? "关闭 Agent" : "启用 Agent") + '</button><button type="button" class="is-danger" data-agent-stop>紧急停止</button><button type="button" data-agent-audit>审计日志</button><button type="button" data-agent-security>安全事件</button></div>';
            box.querySelector("[data-agent-toggle]").addEventListener("click", function () { self.toggleAgent(); });
            box.querySelector("[data-agent-stop]").addEventListener("click", function () { self.emergencyStop(); });
            box.querySelector("[data-agent-audit]").addEventListener("click", function () { self.loadAudit(); });
            box.querySelector("[data-agent-security]").addEventListener("click", function () { self.loadSecurity(); });
        },

        toggleAgent: function () {
            var self = this;
            if (!this.isAdmin || !this.projectId) return Promise.resolve();
            var action = this.enabled ? "disable" : "enable";
            return this.requestJson("/api/agent/admin/" + action, { method: "POST", body: JSON.stringify({ projectId: this.projectId }) }).then(function () {
                return self.refreshStatus().then(function () { self.message(self.enabled ? "Agent 已启用" : "Agent 已关闭"); });
            }).catch(function (error) { self.message(error.message || "Agent 状态修改失败"); });
        },

        emergencyStop: function () {
            var self = this;
            if (!this.isAdmin || !this.projectId) return Promise.resolve();
            if (!window.confirm("确定立即停止当前项目的 Agent 吗？")) return Promise.resolve();
            return this.requestJson("/api/agent/admin/stop", { method: "POST", body: JSON.stringify({ projectId: this.projectId }) }).then(function () {
                return self.refreshStatus().then(function () { self.message("Agent 已紧急停止"); });
            }).catch(function (error) { self.message(error.message || "紧急停止失败"); });
        },

        loadAudit: function () {
            var self = this;
            return this.requestJson("/api/agent/admin/audit?projectId=" + encodeURIComponent(this.projectId) + "&limit=100").then(function (data) {
                self.showLogModal("Agent 审计日志", data.logs || []);
            }).catch(function (error) { self.message(error.message || "无法读取审计日志"); });
        },

        loadSecurity: function () {
            var self = this;
            return this.requestJson("/api/agent/admin/security?projectId=" + encodeURIComponent(this.projectId) + "&limit=100").then(function (data) {
                self.showLogModal("Agent 安全事件", data.events || []);
            }).catch(function (error) { self.message(error.message || "无法读取安全事件"); });
        },

        showLogModal: function (title, logs) {
            var self = this;
            var content = logs.length ? logs.map(function (item) {
                return '<article class="pa-log"><div><strong>' + self.escapeHtml(item.event_type || item.action || "event") + '</strong><time>' + self.escapeHtml(item.timestamp || "") + '</time></div><pre>' + self.escapeHtml(JSON.stringify(item.details || {}, null, 2)) + '</pre></article>';
            }).join("") : '<div class="pa-notice">暂无记录</div>';
            var modal = document.createElement("div");
            modal.className = "pa-modal-backdrop";
            modal.innerHTML = '<div class="pa-modal" role="dialog" aria-modal="true"><header><h3>' + this.escapeHtml(title) + '</h3><button type="button" aria-label="关闭">×</button></header><div class="pa-modal-body">' + content + '</div></div>';
            modal.querySelector("button").addEventListener("click", function () { modal.remove(); });
            modal.addEventListener("click", function (event) { if (event.target === modal) modal.remove(); });
            document.body.appendChild(modal);
        },

        message: function (text) {
            if (typeof window.showToast === "function") window.showToast(text);
            else console.info("[ProjectHub Agent]", text);
        },

        escapeHtml: function (value) {
            return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
        }
    };

    window.ProjectHubAgent = ProjectHubAgent;
})();
