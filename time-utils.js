"use strict";

(function initTimeUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProjectHubTime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  function toDate(ts) {
    const date = ts instanceof Date ? ts : new Date(ts);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatDate(ts, timeZone) {
    const date = toDate(ts);
    if (!date) return "";
    try {
      return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: timeZone || undefined });
    } catch (e) { return ""; }
  }
  function formatTime(ts, timeZone) {
    const date = toDate(ts);
    if (!date) return "";
    try {
      return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: timeZone || undefined });
    } catch (e) { return ""; }
  }
  function toIso(ts) {
    const date = toDate(ts);
    return date ? date.toISOString() : "";
  }
  return { formatDate: formatDate, formatTime: formatTime, toIso: toIso };
});
