export const DAY_KEYS = ["L", "M", "X", "J", "V", "S", "D"];
export const DAY_NUMS = [1, 2, 3, 4, 5, 6, 0];
export const MOODS = [
  ["Excelente", ""],
  ["Bien", ""],
  ["Normal", ""],
  ["Enojado", ""],
  ["Agotado", ""],
  ["Motivado", ""],
  ["Calmado", ""]
];
export const LEGACY_MOODS = [["Bajo", ""]];
export const MOOD_SCORES = {
  Excelente: 5,
  Bien: 4,
  Normal: 3,
  Enojado: 2,
  Agotado: 1,
  Motivado: 5,
  Calmado: 4,
  Bajo: 2
};

export function key(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export function parse(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function today() {
  return new Date();
}

export function add(date, days) {
  const x = new Date(date);
  x.setDate(x.getDate() + Number(days || 0));
  x.setHours(12, 0, 0, 0);
  return x;
}

export function startWeek(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function week(d) {
  const s = startWeek(d);
  return Array.from({ length: 7 }, (_, i) => add(s, i));
}

export function weekKey(d) {
  return key(startWeek(typeof d === "string" ? parse(d) : d));
}

export function monthGrid(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
  const s = startWeek(first);
  return Array.from({ length: 42 }, (_, i) => add(s, i));
}

export function fmtDate(d) {
  return new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

export function fmtMonth(d) {
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(d);
}

export function fmtShortDate(d) {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(d).replace(".", "");
}

export function weekday(d) {
  return new Intl.DateTimeFormat("es-CL", { weekday: "long" }).format(d);
}

export function cap(s = "") {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function fmtMin(m) {
  m = Number(m) || 0;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? h + " h" + (mm ? " " + mm + " min" : "") : mm + " min";
}

export function fmtHours(m) {
  return ((Number(m) || 0) / 60).toFixed(1) + " h";
}

export function pct(a, b) {
  return b ? Math.round((Number(a) / Number(b)) * 100) : 0;
}

export function clamp(v) {
  return Math.max(0, Math.min(100, Number(v) || 0));
}

export function avg(values) {
  const v = values.map(Number).filter(Number.isFinite);
  return v.length ? v.reduce((s, n) => s + n, 0) / v.length : 0;
}

export function escape(s = "") {
  return String(s).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

export function weekNumber(d) {
  const target = new Date(d);
  target.setHours(12, 0, 0, 0);
  const thursday = new Date(target);
  thursday.setDate(target.getDate() + 4 - (target.getDay() || 7));
  const yearStart = new Date(thursday.getFullYear(), 0, 1, 12);
  return Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
}

export function weekLabel(d) {
  const w = week(d);
  return fmtShortDate(w[0]) + " – " + fmtShortDate(w[6]);
}

export function timeEnd(time, minutes) {
  if (!time) return "—";
  const [h, m] = String(time).split(":").map(Number);
  const end = ((h * 60) + m + (Number(minutes) || 60)) % 1440;
  return String(Math.floor(end / 60)).padStart(2, "0") + ":" + String(end % 60).padStart(2, "0");
}

export function minutesFromTime(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60) + m;
}

export function localMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function moodScore(mood) {
  return MOOD_SCORES[mood] || 0;
}
