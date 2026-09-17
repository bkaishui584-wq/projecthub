"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { formatTime, formatDate, toIso } = require("../time-utils");

test("time utilities format the same instant in different time zones", () => {
  const instant = Date.UTC(2026, 8, 17, 8, 0, 0);
  assert.match(formatTime(instant, "UTC"), /08:00/);
  assert.match(formatTime(instant, "Asia/Shanghai"), /16:00/);
  assert.match(formatDate(instant, "Asia/Shanghai"), /09\/17|09-17|09\.17/);
  assert.equal(toIso(instant), "2026-09-17T08:00:00.000Z");
});
