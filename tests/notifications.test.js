import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkForegroundReminders, getRegistration, registerServiceWorker } from "../src/notifications.js";

const NativeDate = Date;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
let sent;
let shown;
beforeEach(() => {
  globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [2026, 9, 5, 12, 0, 0])); } };
  sent = new Map();
  shown = [];
  globalThis.localStorage = { getItem: k => sent.get(k) ?? null, setItem: (k, v) => sent.set(k, v) };
  globalThis.Notification = class { static permission = "granted"; constructor(title) { shown.push(title); } };
  globalThis.window = { Notification };
});
afterEach(() => {
  globalThis.Date = NativeDate;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
});
const reminders = (leadMinutes = 0) => ({ notifications: { enabled: true, leadMinutes }, tasks: [{ id: "now", title: "Now", date: "2026-10-05", time: "12:00" }, { id: "later", title: "Later", date: "2026-10-05", time: "12:05" }] });

test("zero lead means at task time, deduplicated for the local date", () => {
  checkForegroundReminders(reminders(), "2026-10-12");
  assert.deepEqual(shown, []);
  checkForegroundReminders(reminders(), "2026-10-05");
  checkForegroundReminders(reminders(), "2026-10-05");
  assert.deepEqual(shown, ["PLAN 2.0 · Now"]);
});

test("failed notification delivery does not mark it sent and allows retry", () => {
  const WorkingNotification = Notification;
  globalThis.Notification = class { static permission = "granted"; constructor() { throw new Error("Unavailable"); } };
  checkForegroundReminders(reminders(), "2026-10-05");
  assert.equal(sent.size, 0);
  globalThis.Notification = WorkingNotification;
  checkForegroundReminders(reminders(), "2026-10-05");
  assert.equal(shown.length, 1);
});

test("invalid notification log and denied storage writes do not crash reminders", () => {
  sent.set("plan20-notified-v2", "null");
  localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.doesNotThrow(() => checkForegroundReminders(reminders(), "2026-10-05"));
  assert.equal(shown.length, 1);
});

test("registration bypasses HTTP cache; missing registration does not wait forever on ready", async () => {
  const calls = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: {
    async register(...args) { calls.push(args); return { active: true }; },
    async getRegistration() { return undefined; },
    get ready() { assert.fail("No worker: ready would never resolve"); }
  } } });
  assert.ok(await registerServiceWorker());
  assert.deepEqual(calls, [["./sw.js", { scope: "./", updateViaCache: "none" }]]);
  assert.equal(await getRegistration(), null);
});
