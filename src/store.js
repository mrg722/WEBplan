import { EMPTY_DATA, deepClone } from "./data.js";

const KEY = "plan20-data-v2";
const LEGACY_KEYS = ["plan20-data-v1", "plan20-data"];
const CHANNEL = "plan20-sync-v2";

let channel = null;
try {
  if ("BroadcastChannel" in window) channel = new BroadcastChannel(CHANNEL);
} catch {
  channel = null;
}

function dayKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function mondayKey(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dayKey(x);
}

function defaultNonNegotiables() {
  const days = [1, 2, 3, 4, 5, 6, 0];
  return [
    { id: "default-water", name: "AGUA – 2 L", icon: "water", target: "2 L al día", mode: "water", active: true, days, checks: {} },
    { id: "default-training-1", name: "ENTRENAMIENTO 1", icon: "↔", target: "Sesión 1", mode: "training", slot: 1, active: true, days, checks: {} },
    { id: "default-training-2", name: "ENTRENAMIENTO 2", icon: "↔", target: "Sesión 2", mode: "training", slot: 2, active: true, days, checks: {} },
    { id: "default-training-3", name: "ENTRENAMIENTO 3", icon: "↔", target: "Sesión 3", mode: "training", slot: 3, active: true, days, checks: {} },
    { id: "default-training-4", name: "ENTRENAMIENTO 4", icon: "↔", target: "Sesión 4", mode: "training", slot: 4, active: true, days, checks: {} },
    { id: "default-study", name: "ESTUDIAR — __ h", icon: "▤", target: "Objetivo configurable", mode: "study", active: true, days, checks: {} },
    { id: "default-sleep", name: "DORMIR — __ h", icon: "◔", target: "Objetivo configurable", mode: "sleep", active: true, days, checks: {} },
    { id: "default-food", name: "ALIMENTACIÓN CONSCIENTE", icon: "◯", target: "Acuerdo personal", mode: "manual", active: true, days, checks: {} },
    { id: "default-self", name: "CUIDADO PERSONAL", icon: "♥", target: "Acuerdo personal", mode: "manual", active: true, days, checks: {} }
  ];
}

function emptyWeek() {
  return {
    plannedDays: {},
    balance: { achieved: "", improve: "" },
    reflection: { good: "", improve: "", ideas: "", observations: "" }
  };
}

export function ensureWeek(data, weekStart) {
  const key = weekStart || mondayKey(new Date());
  if (!data.weekly[key]) data.weekly[key] = emptyWeek();
  const w = data.weekly[key];
  w.plannedDays = w.plannedDays && typeof w.plannedDays === "object" ? w.plannedDays : {};
  w.balance = Object.assign({ achieved: "", improve: "" }, w.balance || {});
  w.reflection = Object.assign({ good: "", improve: "", ideas: "", observations: "" }, w.reflection || {});
  return w;
}

function normalize(data) {
  const base = deepClone(EMPTY_DATA);
  const merged = Object.assign(base, data || {});
  merged.settings = Object.assign(base.settings, data?.settings || {});
  merged.notifications = Object.assign(base.notifications, data?.notifications || {});
  merged.sync = Object.assign(base.sync, data?.sync || {});
  merged.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  merged.nonNegotiables = Array.isArray(data?.nonNegotiables) ? data.nonNegotiables : [];
  merged.priorities = Array.isArray(data?.priorities) ? data.priorities : [];
  merged.habits = Array.isArray(data?.habits) ? data.habits : [];
  merged.training = Array.isArray(data?.training) ? data.training : [];
  merged.goals = Array.isArray(data?.goals) ? data.goals : [];
  merged.days = data?.days && typeof data.days === "object" ? data.days : {};
  merged.weekly = data?.weekly && typeof data.weekly === "object" ? data.weekly : {};
  merged.meta = Object.assign(base.meta, data?.meta || {});
  merged.schemaVersion = 3;
  for (const [wk] of Object.entries(merged.weekly)) ensureWeek(merged, wk);
  return merged;
}

function firstRunData() {
  const data = normalize(EMPTY_DATA);
  data.nonNegotiables = defaultNonNegotiables();
  data.meta.initializedAt = new Date().toISOString();
  return data;
}

export function load() {
  try {
    let raw = localStorage.getItem(KEY);
    let usingLegacy = false;
    if (!raw) {
      for (const legacyKey of LEGACY_KEYS) {
        raw = localStorage.getItem(legacyKey);
        if (raw) {
          usingLegacy = true;
          break;
        }
      }
    }
    const data = raw ? normalize(JSON.parse(raw)) : firstRunData();
    if (usingLegacy) {
      data.meta.migratedFromLegacy = true;
      data.meta.migratedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(data));
    }
    return data;
  } catch {
    return firstRunData();
  }
}

export function save(data, broadcast = true) {
  const normalized = normalize(data);
  normalized.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(normalized));
  if (broadcast && channel) {
    try { channel.postMessage({ type: "data-updated", data: normalized }); } catch {}
  }
  return normalized;
}

export function replace(data, broadcast = true) {
  return save(normalize(data), broadcast);
}

export function reset() {
  localStorage.removeItem(KEY);
  if (channel) {
    try { channel.postMessage({ type: "data-reset" }); } catch {}
  }
  location.reload();
}

export function ensureDay(data, dateKey) {
  if (!data.days[dateKey]) {
    data.days[dateKey] = {
      mood: "",
      energy: null,
      studyMinutes: 0,
      sleepMinutes: 0,
      waterLiters: 0,
      weight: "",
      steps: "",
      reflection: { achieved: "", improve: "", notes: "" },
      minimalPlan: { study: false, water: false, training: false, sleep: false }
    };
  } else {
    data.days[dateKey].reflection = Object.assign(
      { achieved: "", improve: "", notes: "" },
      data.days[dateKey].reflection || {}
    );
    data.days[dateKey].minimalPlan = Object.assign(
      { study: false, water: false, training: false, sleep: false },
      data.days[dateKey].minimalPlan || {}
    );
  }
  return data.days[dateKey];
}

export function installSyncListeners(onUpdate) {
  const handler = event => {
    if (event?.key === KEY && event.newValue) {
      try { onUpdate(normalize(JSON.parse(event.newValue))); } catch {}
    }
  };
  window.addEventListener("storage", handler);
  if (channel) {
    channel.addEventListener("message", event => {
      if (event.data?.type === "data-updated") onUpdate(normalize(event.data.data));
      if (event.data?.type === "data-reset") location.reload();
    });
  }
}
