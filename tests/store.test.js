import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DATA } from "../src/data.js";
import { load, save, replace, reset, ensureDay, ensureWeek } from "../src/store.js";

const KEY = "plan20-data-v2";
let storage;
let reloads;
beforeEach(() => {
  storage = new Map();
  reloads = 0;
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  globalThis.location = { reload() { reloads++; } };
});

test("notes and energy zero survive save, fresh module reload, and independent days/weeks", async () => {
  const data = load();
  const first = ensureDay(data, "2026-10-05");
  first.energy = 0;
  first.reflection.notes = "Primera semana\nIdeas y observaciones";
  first.minimalPlan.water = true;
  const sunday = ensureDay(data, "2026-10-11");
  sunday.reflection.notes = "Domingo";
  const next = ensureDay(data, "2026-10-12");
  next.energy = 8;
  next.reflection.notes = "Segunda semana";
  const week1 = ensureWeek(data, "2026-10-05");
  week1.plannedDays["2026-10-05"] = true;
  week1.reflection.good = "Semana uno";
  const week2 = ensureWeek(data, "2026-10-12");
  week2.reflection.good = "Semana dos";
  data.tasks.push({ id: "one", date: "2026-10-05", title: "Tarea", completed: true });
  data.priorities.push({ id: "p", weekStart: "2026-10-05", title: "Prioridad" });
  data.habits.push({ id: "h", checks: { "2026-10-05": true } });
  save(data);
  const reloadedStore = await import(`../src/store.js?reload=${Date.now()}`);
  const restored = reloadedStore.load();
  assert.equal(restored.days["2026-10-05"].energy, 0);
  assert.equal(restored.days["2026-10-05"].reflection.notes, first.reflection.notes);
  assert.equal(restored.days["2026-10-11"].reflection.notes, "Domingo");
  assert.equal(restored.days["2026-10-12"].reflection.notes, "Segunda semana");
  assert.equal(restored.days["2026-10-12"].minimalPlan.water, false);
  assert.deepEqual(restored.weekly["2026-10-12"].plannedDays, {});
  assert.equal(restored.weekly["2026-10-05"].reflection.good, "Semana uno");
  assert.equal(restored.weekly["2026-10-12"].reflection.good, "Semana dos");
  assert.deepEqual(restored.tasks, data.tasks);
  assert.deepEqual(restored.priorities, data.priorities);
  assert.deepEqual(restored.habits, data.habits);
  ensureDay(restored, "2026-10-18").reflection.notes = "Último día";
  save(restored);
  assert.equal(load().days["2026-10-05"].reflection.notes, first.reflection.notes);
});

test("partial settings receive defaults, preserving zeros and unknown fields", () => {
  storage.set(KEY, JSON.stringify({ settings: { waterGoal: 0 }, notifications: { enabled: true }, sync: { endpoint: "/sync" }, days: { "2026-10-05": { energy: 0, reflection: { notes: "Keep" }, custom: 42 } }, customRoot: { value: 7 } }));
  const data = load();
  assert.equal(data.settings.waterGoal, 0);
  assert.equal(data.settings.sleepGoalMinutes, 480);
  assert.equal(data.notifications.leadMinutes, 15);
  assert.equal(data.sync.enabled, false);
  assert.equal(ensureDay(data, "2026-10-05").energy, 0);
  save(data);
  assert.equal(load().days["2026-10-05"].custom, 42);
  assert.deepEqual(load().customRoot, { value: 7 });
});

test("fresh loads and save snapshots do not share EMPTY_DATA or caller references", () => {
  const baseline = JSON.stringify(EMPTY_DATA);
  const first = load();
  ensureDay(first, "2026-10-05").reflection.notes = "Only first";
  first.tasks.push({ id: "first" });
  assert.deepEqual(load().days, {});
  assert.deepEqual(load().tasks, []);
  assert.equal(JSON.stringify(EMPTY_DATA), baseline);
  const saved = save(first);
  saved.days["2026-10-05"].reflection.notes = "Changed snapshot";
  assert.equal(first.days["2026-10-05"].reflection.notes, "Only first");
  assert.equal(load().days["2026-10-05"].reflection.notes, "Only first");
});

test("legacy migration preserves original keys and survives quota failure", () => {
  const raw = JSON.stringify({ tasks: [{ id: "legacy" }], days: { "2026-10-05": { energy: 0, reflection: { notes: "Legacy note" } } } });
  storage.set("plan20-data-v1", raw);
  storage.set("unrelated", "keep");
  localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.equal(load().days["2026-10-05"].reflection.notes, "Legacy note");
  assert.equal(storage.get("plan20-data-v1"), raw);
  assert.equal(storage.get("unrelated"), "keep");
  assert.equal(storage.has(KEY), false);
});

test("migration skips corrupt legacy data, copies a valid backup and preserves all originals", () => {
  storage.set("plan20-data-v1", "{broken");
  const raw = JSON.stringify({ tasks: [{ id: "older" }] });
  storage.set("plan20-data", raw);
  assert.equal(load().tasks[0].id, "older");
  assert.equal(JSON.parse(storage.get(KEY)).tasks[0].id, "older");
  assert.equal(storage.get("plan20-data-v1"), "{broken");
  assert.equal(storage.get("plan20-data"), raw);
});

test("an unreadable primary record cannot be silently overwritten by a fresh save", () => {
  for (const raw of ["{broken", "null", "[]", ""]) {
    storage.set(KEY, raw);
    const data = load();
    assert.throws(() => save(data), /datos guardados/);
    assert.equal(storage.get(KEY), raw);
  }
});

test("valid primary data takes precedence; replace preserves imported content", () => {
  storage.set("plan20-data-v1", JSON.stringify({ tasks: [{ id: "old" }] }));
  const incoming = { tasks: [{ id: "new" }], days: { "2026-10-05": { energy: 0, reflection: { notes: "Imported" } } } };
  replace(incoming);
  assert.equal(load().tasks[0].id, "new");
  assert.equal(load().days["2026-10-05"].energy, 0);
  assert.equal(load().days["2026-10-05"].reflection.notes, "Imported");
  assert.throws(() => replace(null), TypeError);
  assert.equal(load().tasks[0].id, "new");
});

test("reset persists an empty primary state without deleting legacy or unrelated keys", () => {
  storage.set("plan20-data-v1", JSON.stringify({ tasks: [{ id: "old" }] }));
  storage.set("unrelated", "keep");
  reset();
  assert.deepEqual(load().tasks, []);
  assert.equal(reloads, 1);
  assert.equal(storage.has("plan20-data-v1"), true);
  assert.equal(storage.get("unrelated"), "keep");
});
