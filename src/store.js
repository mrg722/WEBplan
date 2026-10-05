import { EMPTY_DATA, deepClone } from "./data.js";

const KEY = "plan20-data-v2";
const CHANNEL = "plan20-sync-v2";

let channel = null;
try {
  if ("BroadcastChannel" in window) channel = new BroadcastChannel(CHANNEL);
} catch {
  channel = null;
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
  merged.schemaVersion = 2;
  return merged;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : EMPTY_DATA);
  } catch {
    return normalize(EMPTY_DATA);
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