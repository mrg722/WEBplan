import { load, save, replace, reset, ensureDay, installSyncListeners } from "./store.js";
import { add, avg, cap, clamp, escape, fmtDate, fmtHours, fmtMin, fmtMonth, fmtShortDate, key, monthGrid, MOODS, parse, pct, startWeek, timeEnd, week, weekLabel, weekNumber, DAY_KEYS, DAY_NUMS, minutesFromTime } from "./utils.js";

const app = document.querySelector("#app");
const CONFIG = window.PLAN20_CONFIG || { vapidPublicKey: "" };
let data = load();
let state = {
  page: "plan",
  view: "day",
  date: key(new Date()),
  month: key(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  mobileMenu: false,
  modal: null,
  deferredInstallPrompt: null,
  open: {
    what: true, agenda: true, nonneg: false, priorities: false, todos: true,
    habits: false, training: true, study: true, sleep: false, water: false,
    min: false, balance: true, weeklyBalance: true
  }
};

const NOTIFY_KEY = "plan20-notify-log-v2";
let notifyLog = loadNotifyLog();

function loadNotifyLog() {
  try { return JSON.parse(localStorage.getItem(NOTIFY_KEY) || "{}"); } catch { return {}; }
}
function saveNotifyLog() {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(notifyLog)); } catch {}
}
function markNotified(id) {
  notifyLog[id] = Date.now();
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 14;
  Object.keys(notifyLog).forEach(k => { if (notifyLog[k] < cutoff) delete notifyLog[k]; });
  saveNotifyLog();
}

function todayKey() { return key(new Date()); }
function currentDate() { return parse(state.date); }
function currentWeekStart() { return key(startWeek(currentDate())); }
function dayRecord(date = state.date) { return ensureDay(data, date); }
function tasksFor(dateOrDateObj) {
  const d = typeof dateOrDateObj === "string" ? dateOrDateObj : key(dateOrDateObj);
  return data.tasks.filter(t => t.date === d);
}
function weekTasks(date) { return week(date).flatMap(d => tasksFor(d)); }
function prioritiesFor(date) {
  const wk = key(startWeek(typeof date === "string" ? parse(date) : date));
  return data.priorities.filter(p => (p.weekStart || wk) === wk);
}
function activeNonneg() {
  return data.nonNegotiables.filter(n => n.active !== false && isNonnegScheduled(n, state.date));
}
function isNonnegScheduled(n, dateKey) {
  if (!Array.isArray(n.days) || n.days.length === 0) return true;
  return n.days.includes(parse(dateKey).getDay());
}
function nonnegDone(n, dateKey = state.date) {
  const r = data.days[dateKey] || ensureDay(data, dateKey);
  if (!isNonnegScheduled(n, dateKey)) return false;
  if (n.mode === "water") return Number(r.waterLiters) >= Number(data.settings.waterGoal);
  if (n.mode === "study") return Number(r.studyMinutes) >= Number(data.settings.studyGoalMinutes);
  if (n.mode === "sleep") return Number(r.sleepMinutes) >= Number(data.settings.sleepGoalMinutes) - 30;
  if (n.mode === "training") return data.training.some(t => t.date === dateKey && t.completed);
  return Boolean(n.checks?.[dateKey]);
}
function habitDayDone(h, dateKey) { return Boolean(h.logs?.[dateKey]); }
function habitDayPct(h, w) {
  const scheduled = w.filter(d => isHabitScheduled(h, d));
  return pct(scheduled.filter(d => habitDayDone(h, key(d))).length, scheduled.length);
}
function isHabitScheduled(h, d) {
  const days = Array.isArray(h.daysOfWeek) && h.daysOfWeek.length ? h.daysOfWeek : DAY_NUMS;
  return days.includes(d.getDay());
}
function priorityProgress(p) {
  const ids = Array.isArray(p.taskIds) ? p.taskIds : [];
  if (!ids.length) return clamp(p.progress || 0);
  const ts = data.tasks.filter(t => ids.includes(t.id));
  return pct(ts.filter(t => t.completed).length, ts.length);
}
function goalProgress(g) {
  const pieces = [];
  const tasks = data.tasks.filter(t => (g.taskIds || []).includes(t.id));
  if (tasks.length) pieces.push(pct(tasks.filter(t => t.completed).length, tasks.length));
  const ps = data.priorities.filter(p => (g.priorityIds || []).includes(p.id));
  if (ps.length) pieces.push(avg(ps.map(priorityProgress)));
  const hs = data.habits.filter(h => (g.habitIds || []).includes(h.id));
  if (hs.length) pieces.push(avg(hs.map(h => habitDayPct(h, week(currentDate())))));
  return pieces.length ? Math.round(avg(pieces)) : clamp(g.progress || 0);
}
function dayTaskPct(dateKey) {
  const ts = tasksFor(dateKey);
  return pct(ts.filter(t => t.completed).length, ts.length);
}
function dayHabitPct(dateKey) {
  const d = parse(dateKey);
  const hs = data.habits.filter(h => isHabitScheduled(h, d));
  return pct(hs.filter(h => habitDayDone(h, dateKey)).length, hs.length);
}
function dayNonnegPct(dateKey) {
  const ns = data.nonNegotiables.filter(n => n.active !== false && isNonnegScheduled(n, dateKey));
  return pct(ns.filter(n => nonnegDone(n, dateKey)).length, ns.length);
}
function dayTrainingScore(dateKey) {
  const planned = data.training.some(t => t.date === dateKey);
  if (!planned) return null;
  return data.training.some(t => t.date === dateKey && t.completed) ? 100 : 0;
}
function dayCompletion(dateKey = state.date) {
  const parts = [];
  const t = tasksFor(dateKey);
  if (t.length) parts.push([dayTaskPct(dateKey), 35]);
  const n = data.nonNegotiables.filter(x => x.active !== false && isNonnegScheduled(x, dateKey));
  if (n.length) parts.push([dayNonnegPct(dateKey), 25]);
  const h = data.habits.filter(x => isHabitScheduled(x, parse(dateKey)));
  if (h.length) parts.push([dayHabitPct(dateKey), 20]);
  const train = dayTrainingScore(dateKey);
  if (train !== null) parts.push([train, 10]);
  const r = data.days[dateKey];
  if (r && Number(r.studyMinutes) > 0) parts.push([pct(r.studyMinutes, data.settings.studyGoalMinutes), 5]);
  if (r && Number(r.sleepMinutes) > 0) parts.push([pct(r.sleepMinutes, data.settings.sleepGoalMinutes), 5]);
  if (!parts.length) return 0;
  const weights = parts.reduce((s, p) => s + p[1], 0);
  return Math.round(parts.reduce((s, p) => s + p[0] * p[1], 0) / weights);
}
function weekCompletion(date = currentDate()) {
  const days = week(date);
  const vals = days.map(d => dayCompletion(key(d))).filter((v, i) => {
    const k = key(days[i]);
    return tasksFor(k).length > 0 || dayNonnegPct(k) > 0 || dayHabitPct(k) > 0 || Boolean(data.days[k]);
  });
  return vals.length ? Math.round(avg(vals)) : 0;
}
function habitWeekPct(w) {
  const hs = data.habits;
  if (!hs.length) return 0;
  const total = hs.reduce((s, h) => s + w.filter(d => isHabitScheduled(h, d)).length, 0);
  const done = hs.reduce((s, h) => s + w.filter(d => isHabitScheduled(h, d) && habitDayDone(h, key(d))).length, 0);
  return pct(done, total);
}

function setData(mutator) {
  const next = typeof mutator === "function" ? mutator(data) : mutator;
  data = save(next);
  render();
  scheduleLocalReminderCheck();
}
function setDay(changes) {
  setData(d => {
    const r = ensureDay(d, state.date);
    Object.assign(r, changes);
    return d;
  });
}
function setReflection(field, value) {
  setData(d => {
    const r = ensureDay(d, state.date);
    r.reflection[field] = value;
    return d;
  });
}
function uid(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}
function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function svg(name) {
  const paths = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 2v6M16 2v6M3 10h18"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m14.5 9.5 4-4M18.5 5.5h-3M18.5 5.5v3"/>',
    chart: '<path d="M4 19V9M10 19V5M16 19v-8M2 19h20"/>',
    spark: '<path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 15.2a7.5 7.5 0 0 0 .1-6.4l2-1.1-2-3.1-2.1 1a7.7 7.7 0 0 0-5.5-3.2L11.2 0H7.6L7.2 2.4a7.7 7.7 0 0 0-5.5 3.2l-2.1-1-2 3.1 2 1.1a7.5 7.5 0 0 0 .1 6.4l-2 1.1 2 3.1 2.1-1a7.7 7.7 0 0 0 5.5 3.2l.4 2.4h3.6l.4-2.4a7.7 7.7 0 0 0 5.5-3.2l2.1 1 2-3.1z"/>',
    bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.spark) + "</svg>";
}
function progress(value, tone = "blue") {
  return '<div class="bar bar-' + tone + '"><span style="width:' + clamp(value) + '%"></span></div>';
}
function section(id, title, icon, summary, body, action = "") {
  const open = state.open[id] !== false;
  return '<section class="card section-card ' + (open ? "is-open" : "is-closed") + '">' +
    '<button class="section-head" data-action="toggle" data-id="' + id + '">' +
      '<span class="section-title"><span class="section-icon">' + icon + "</span>" + title + "</span>" +
      '<span class="section-right">' + (summary ? '<span class="section-summary">' + summary + "</span>" : "") + '<span class="chevron">' + (open ? "−" : "⌄") + "</span></span>" +
    "</button>" +
    (action ? '<div class="section-action">' + action + "</div>" : "") +
    (open ? '<div class="section-body">' + body + "</div>" : "") +
  "</section>";
}
function metricCard(title, value, p, tone = "blue") {
  return '<div class="card metric-card"><span>' + escape(title) + "</span><strong>" + escape(value) + "</strong>" + progress(p, tone) + "</div>";
}
function empty(message, action = "") {
  return '<div class="empty-state"><span>' + escape(message) + "</span>" + action + "</div>";
}

function render() {
  document.body.classList.toggle("nav-open", state.mobileMenu);
  app.innerHTML = appShell();
  bindGlobal();
}
function appShell() {
  return '<div class="app-shell">' +
    '<aside class="sidebar ' + (state.mobileMenu ? "mobile-open" : "") + '">' +
      '<div class="brand"><span class="brand-leaf">◢</span><div><strong>PLAN 2.0</strong><small>Pequeños hábitos,<br>grandes resultados.</small></div></div>' +
      '<nav class="main-nav">' +
        [["plan","Plan","calendar"],["goals","Metas","target"],["progress","Progreso","chart"],["insights","Insights","spark"],["settings","Configuración","settings"]].map(([p,l,i]) =>
          '<button class="nav-item ' + (state.page === p ? "active" : "") + '" data-action="nav" data-page="' + p + '">' + svg(i) + "<span>" + l + "</span></button>"
        ).join("") +
      "</nav>" +
      '<div class="sidebar-bottom"><button class="sidebar-notify" data-action="notification-settings">' + svg("bell") + "<span>Notificaciones</span><em>" + (data.notifications.enabled ? "ON" : "OFF") + "</em></button><div class="sidebar-quote">“Disciplina hoy,<br>mejor mañana.”</div></div>" +
    "</aside>" +
    (state.mobileMenu ? '<div class="mobile-scrim" data-action="mobile-menu"></div>' : "") +
    '<main class="main-shell">' +
      '<header class="topbar">' +
        '<button class="mobile-menu" data-action="mobile-menu" aria-label="Abrir menú">☰</button>' +
        '<div class="top-date">' +
          '<button data-action="date-nav" data-delta="-1" aria-label="Anterior">' + svg("back") + "</button>" +
          '<div><strong>' + cap(fmtMonth(currentDate())) + "</strong><small>Semana " + weekNumber(currentDate()) + " · " + weekLabel(currentDate()) + "</small></div>" +
          '<button data-action="date-nav" data-delta="1" aria-label="Siguiente">' + svg("next") + "</button>" +
        "</div>" +
        (state.page === "plan" ? '<div class="segmented"><button class="' + (state.view === "day" ? "active" : "") + '" data-action="view" data-view="day">Día</button><button class="' + (state.view === "week" ? "active" : "") + '" data-action="view" data-view="week">Semana</button><button class="' + (state.view === "month" ? "active" : "") + '" data-action="view" data-view="month">Mes</button></div>' : "") +
        '<div class="top-actions"><button class="today-btn" data-action="today">Hoy</button><button class="icon-btn" data-action="notification-test" title="Probar notificación">' + svg("bell") + "</button></div>" +
      "</header>" +
      '<div class="content-wrap">' + renderPage() + "</div>" +
    "</main>" +
    (state.modal ? renderModal() : "") +
  "</div>";
}
function renderPage() {
  if (state.page === "goals") return renderGoals();
  if (state.page === "progress") return renderProgress();
  if (state.page === "insights") return renderInsights();
  if (state.page === "settings") return renderSettings();
  if (state.view === "week") return renderWeek();
  if (state.view === "month") return renderMonth();
  return renderDay();
}

function renderDay() {
  const d = currentDate();
  const r = dayRecord();
  const ts = tasksFor(state.date);
  const done = ts.filter(t => t.completed).length;
  const ns = activeNonneg();
  const nd = ns.filter(n => nonnegDone(n)).length;
  const completion = dayCompletion();
  const next = getNextAction(d);
  const w = week(d);
  return '<div class="day-layout">' +
    '<div class="day-main">' +
      '<section class="hero-card card">' +
        '<div class="hero-top"><div><div class="eyebrow">ESTADO DEL DÍA</div><h1>' + cap(fmtDate(d)) + "</h1></div><button class="ghost-btn" data-action="modal" data-type="task-new">＋ Nueva tarea</button></div>" +
        '<div class="mood-row"><div class="mood-title">¿Cómo estás hoy?</div>' +
          MOODS.map(m => '<button class="mood-option ' + (r.mood === m[0] ? "selected" : "") + '" data-action="mood" data-mood="' + m[0] + '" title="' + m[0] + '"><span>' + m[1] + "</span><small>" + m[0] + "</small></button>").join("") +
        "</div>" +
        '<div class="hero-stats">' +
          '<div><span>Cumplimiento</span><strong>' + completion + "%</strong></div>" +
          '<div><span>Tareas</span><strong>' + done + " / " + ts.length + "</strong></div>" +
          '<div><span>No negociables</span><strong>' + nd + " / " + ns.length + "</strong></div>" +
          '<div><span>Energía</span><strong>' + (r.energy == null ? "—" : r.energy + " /10") + "</strong></div>" +
        "</div>" +
        '<div class="energy-control"><label>Energía <span>opcional</span></label><input type="range" min="1" max="10" value="' + (r.energy || 7) + '" data-field="energy"><b>' + (r.energy || 7) + "/10</b></div>" +
      "</section>" +
      section("what","¿Qué hago ahora?","▶",next ? escape(next.title) : "Todo al día", renderWhatNow(next)) +
      section("agenda","Agenda del día","▣",done + " / " + ts.length + " tareas",renderAgenda(ts),'<button class="outline-btn small" data-action="modal" data-type="task-new">＋ Nueva tarea</button>') +
      section("nonneg","No negociables","✓",nd + " / " + ns.length + " cumplidos",renderNonneg(ns),'<button class="outline-btn small" data-action="modal" data-type="nonneg-new">＋ Añadir</button>') +
      section("priorities","Prioridades de la semana","◎",prioritiesFor(d).length + " / 3",renderPriorities(d),'<button class="outline-btn small" data-action="modal" data-type="priority-new">＋ Añadir</button>') +
      section("todos","Cosas por hacer","☷",data.tasks.filter(t => !t.date && !t.completed).length + " pendientes",renderTodos(),'<button class="outline-btn small" data-action="modal" data-type="task-new" data-no-date="true">＋ Añadir</button>') +
      section("habits","Hábitos adicionales","▥",habitWeekPct(w) + "% semanal",renderHabits(w),'<button class="outline-btn small" data-action="modal" data-type="habit-new">＋ Añadir</button>') +
    "</div>" +
    '<aside class="day-side"><div class="side-stack">' +
      renderRing(completion, done, ts.length, data.habits.filter(h => habitDayDone(h, state.date)).length, data.habits.length) +
      section("training","Entrenamiento","🏋️",trainingWeekCount(w) + " / 4",renderTraining(w),'<button class="outline-btn small" data-action="modal" data-type="training-new">＋ Añadir</button>') +
      section("study","Estudio","📚",fmtHours(r.studyMinutes) + " / " + fmtHours(data.settings.studyGoalMinutes),'<div>' + progress(pct(r.studyMinutes,data.settings.studyGoalMinutes),"green") + '</div><div class="metric-split"><span>Objetivo</span><b>' + fmtMin(data.settings.studyGoalMinutes) + '</b></div><div class="quick-input"><input type="number" min="0" step="5" value="' + Number(r.studyMinutes || 0) + '" data-field="studyMinutes"><span>minutos reales</span></div>') +
      section("sleep","Sueño","🌙",fmtMin(r.sleepMinutes) + " / " + fmtMin(data.settings.sleepGoalMinutes),progress(pct(r.sleepMinutes,data.settings.sleepGoalMinutes),"purple") + '<div class="quick-input"><input type="number" min="0" step="10" value="' + Number(r.sleepMinutes || 0) + '" data-field="sleepMinutes"><span>minutos dormidos</span></div>') +
      section("water","Agua","💧",Number(r.waterLiters || 0).toFixed(1) + " / " + data.settings.waterGoal + " L",progress(pct(r.waterLiters,data.settings.waterGoal)) + '<div class="quick-input"><input type="number" min="0" step="0.1" value="' + Number(r.waterLiters || 0) + '" data-field="waterLiters"><span>litros registrados</span></div>') +
      section("min","Plan mínimo · días difíciles","⚡",minimalCount(r.minimalPlan) + " / 4",renderMinimal(r.minimalPlan)) +
      section("balance","Balance del día","✎","Se guarda automáticamente",renderDailyBalance(r)) +
    "</div></aside>" +
  "</div>";
}
function renderWhatNow(next) {
  if (!next) return '<div class="empty-state">No hay una acción pendiente. Puedes planificar una tarea o cerrar el día con calma.</div>';
  return '<div class="now-grid"><div class="now-main"><div class="kicker">AHORA</div><div class="now-title">' + escape(next.title) + '</div><div class="now-meta">' + (next.time ? next.time + " – " + timeEnd(next.time,next.estimatedMinutes || 60) : "Sin horario") + '</div><span class="priority-pill ' + (next.priority || "baja") + '">Prioridad ' + (next.priority || "baja") + '</span><button class="primary-btn" data-action="task-toggle" data-id="' + next.id + '">Marcar completada</button></div>' +
    '<div class="now-next"><div class="kicker">SIGUIENTE</div><strong>' + escape(getFollowingAction(next)?.title || "Nada pendiente") + '</strong><span>Continúa con la siguiente acción disponible.</span></div></div>';
}
function getNextAction(d) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const candidates = tasksFor(key(d)).filter(t => !t.completed);
  if (!candidates.length) {
    return data.tasks.find(t => !t.date && !t.completed) || null;
  }
  return candidates.map(t => {
    const tm = minutesFromTime(t.time);
    const priorityScore = t.priority === "alta" ? 5 : t.priority === "media" ? 3 : 1;
    const overdue = tm !== null && key(d) === todayKey() && tm < nowMinutes ? 6 : 0;
    const imminent = tm !== null ? Math.max(0, 180 - Math.abs(tm - nowMinutes)) / 60 : 0;
    const durationBoost = Math.max(0, 60 - Math.min(60, Number(t.estimatedMinutes) || 60)) / 100;
    return { t, score: priorityScore + overdue + imminent + durationBoost };
  }).sort((a,b) => b.score - a.score || (minutesFromTime(a.t.time) ?? 9999) - (minutesFromTime(b.t.time) ?? 9999))[0].t;
}
function getFollowingAction(current) {
  return tasksFor(state.date).filter(t => !t.completed && t.id !== current.id).sort((a,b) => (minutesFromTime(a.time) ?? 9999) - (minutesFromTime(b.time) ?? 9999))[0] || data.tasks.find(t => !t.date && !t.completed);
}

function renderAgenda(tasks) {
  if (!tasks.length) return empty("Este día todavía no tiene tareas.", '<button class="add-inline" data-action="modal" data-type="task-new">＋ Agregar tarea</button>');
  return '<div class="task-list">' + tasks.sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99")).map(taskRow).join("") + '</div><button class="add-inline" data-action="modal" data-type="task-new">＋ Agregar tarea</button>';
}
function ageLabel(t) {
  if (!t.createdAt || t.date) return "";
  const diff = Math.max(0, Math.floor((parse(state.date) - parse(t.createdAt)) / 86400000));
  return diff === 0 ? "Pendiente hoy" : "Pendiente desde hace " + diff + " día" + (diff === 1 ? "" : "s");
}
function taskRow(t) {
  return '<div class="task-row ' + (t.completed ? "done" : "") + '">' +
    '<button class="task-check ' + (t.completed ? "checked" : "") + '" data-action="task-toggle" data-id="' + t.id + '">' + (t.completed ? "✓" : "") + "</button>" +
    '<div class="task-time">' + escape(t.time || "—") + "</div>" +
    '<div class="task-title-wrap"><strong>' + escape(t.title) + "</strong>" + (t.note ? "<small>" + escape(t.note) + "</small>" : "") + (ageLabel(t) ? "<small>" + escape(ageLabel(t)) + "</small>" : "") + "</div>" +
    (t.priority ? '<span class="priority-pill subtle ' + t.priority + '">' + t.priority + "</span>" : '<span></span>') +
    '<button class="row-action" data-action="modal" data-type="task-edit" data-id="' + t.id + '">✎</button>' +
    '<button class="row-action" data-action="task-tomorrow" data-id="' + t.id + '">→</button>' +
    '<button class="row-action danger" data-action="task-delete" data-id="' + t.id + '">×</button>' +
  "</div>";
}

function renderNonneg(ns) {
  if (!ns.length) return empty("Aún no defines tus no negociables.", '<button class="add-inline" data-action="modal" data-type="nonneg-new">＋ Crear no negociable</button>');
  const rows = ns.map(n => {
    const done = nonnegDone(n);
    const r = dayRecord();
    let value = done ? "✓" : "Pendiente";
    if (n.mode === "water") value = Number(r.waterLiters || 0).toFixed(1) + " / " + data.settings.waterGoal + " L";
    if (n.mode === "study") value = fmtHours(r.studyMinutes) + " / " + fmtHours(data.settings.studyGoalMinutes);
    if (n.mode === "sleep") value = fmtMin(r.sleepMinutes) + " / " + fmtMin(data.settings.sleepGoalMinutes);
    return '<div class="metric-row"><span class="metric-icon">' + escape(n.icon || "✓") + '</span><div class="metric-copy"><strong>' + escape(n.name) + '</strong><small>' + escape(n.target || "Acuerdo personal") + "</small></div><div class="metric-value">" + value + '</div><button class="tiny-check ' + (done ? "checked" : "") + '" data-action="nonneg-toggle" data-id="' + n.id + '">' + (done ? "✓" : "") + '</button><button class="row-action" data-action="modal" data-type="nonneg-edit" data-id="' + n.id + '">✎</button></div>';
  }).join("");
  return '<div class="nonneg-list">' + rows + "</div>";
}
function renderPriorities(d) {
  const list = prioritiesFor(d);
  if (!list.length) return empty("Define hasta 3 prioridades que representen lo importante de la semana.", '<button class="add-inline" data-action="modal" data-type="priority-new">＋ Crear prioridad</button>');
  return '<div class="priority-list">' + list.slice(0,3).map((p,i) => {
    const pr = priorityProgress(p);
    return '<div class="priority-row"><div class="priority-number n' + (i+1) + '">' + (i+1) + '</div><div class="priority-copy"><strong>' + escape(p.title) + '</strong>' + progress(pr,i===1 ? "green":"blue") + '<small class="related-count">' + (p.taskIds?.length || 0) + ' tareas relacionadas</small></div><span>' + pr + '%</span><button class="text-action" data-action="modal" data-type="priority-edit" data-id="' + p.id + '">Editar</button></div>';
  }).join("") + "</div>";
}
function renderTodos() {
  const list = data.tasks.filter(t => !t.date && !t.completed);
  if (!list.length) return empty("Tu bandeja de pendientes está limpia.", '<button class="add-inline" data-action="modal" data-type="task-new" data-no-date="true">＋ Agregar pendiente</button>');
  return '<div class="task-list compact">' + list.map(taskRow).join("") + "</div>";
}
function renderHabits(w) {
  if (!data.habits.length) return empty("Aún no tienes hábitos adicionales.", '<button class="add-inline" data-action="modal" data-type="habit-new">＋ Crear hábito</button>');
  return '<div class="habit-table-wrap"><table class="habit-table"><thead><tr><th>Hábito</th>' + DAY_KEYS.map(x => "<th>" + x + "</th>").join("") + "<th>%</th><th></th></tr></thead><tbody>" +
    data.habits.map(h => '<tr><td><strong>' + escape(h.name) + '</strong><small>' + escape(h.target || "") + "</small></td>" + w.map(d => {
      const k = key(d), on = habitDayDone(h,k), scheduled = isHabitScheduled(h,d);
      return '<td>' + (scheduled ? '<button class="habit-check ' + (on ? "checked" : "") + '" data-action="habit-toggle" data-id="' + h.id + '" data-date="' + k + '">' + (on ? "✓" : "") + "</button>" : '<span class="habit-na">—</span>') + "</td>";
    }).join("") + '<td>' + habitDayPct(h,w) + '%</td><td><button class="row-action" data-action="modal" data-type="habit-edit" data-id="' + h.id + '">✎</button><button class="row-action danger" data-action="habit-delete" data-id="' + h.id + '">×</button></td></tr>').join("") +
  "</tbody></table></div>";
}
function trainingWeekCount(w) {
  return data.training.filter(t => t.completed && w.some(d => key(d) === t.date)).length;
}
function renderTraining(w) {
  const list = data.training.filter(t => w.some(d => key(d) === t.date));
  if (!list.length) return empty("No hay entrenamientos registrados para esta semana.", '<button class="add-inline" data-action="modal" data-type="training-new">＋ Añadir entrenamiento</button>');
  return '<div class="training-list">' + list.sort((a,b)=>a.date.localeCompare(b.date)).map(t => '<div class="training-row"><button class="tiny-check ' + (t.completed ? "checked":"") + '" data-action="training-toggle" data-id="' + t.id + '">' + (t.completed ? "✓":"") + '</button><div><strong>' + escape(t.title) + '</strong><small>' + escape(cap(fmtShortDate(parse(t.date)))) + ' · ' + escape(t.time || "—") + " · " + Number(t.durationMinutes || 0) + ' min</small></div><button class="text-action" data-action="modal" data-type="training-edit" data-id="' + t.id + '">Editar</button></div>').join("") + "</div>";
}
function renderRing(c,done,total,hd,ht) {
  return '<div class="card mini-card summary-ring"><div class="mini-head"><strong>Cumplimiento del día</strong><span>' + c + '%</span></div><div class="ring" style="--value:' + c * 3.6 + 'deg"><span>' + c + '%</span></div><div class="ring-note">Tareas ' + done + "/" + total + ' · Hábitos ' + hd + "/" + ht + "</div></div>";
}
function minimalCount(m) { return Object.values(m || {}).filter(Boolean).length; }
function renderMinimal(m) {
  return '<div class="minimal-list">' + [["study","30 min de estudio"],["water","Agua"],["training","Entrenamiento"],["sleep","Dormir antes de 00:00"]].map(([k,l]) => '<button class="minimal-row" data-action="minimal-toggle" data-key="' + k + '"><span class="task-check ' + (m?.[k] ? "checked":"") + '">' + (m?.[k] ? "✓":"") + "</span>" + l + "</button>").join("") + '</div><div class="support-note">♡ Hoy no necesitas hacerlo todo.<br>Cumple lo esencial.</div>';
}
function renderDailyBalance(r) {
  return '<label class="field-label">Lo que logré<textarea data-reflection="achieved" placeholder="¿Qué salió bien hoy?">' + escape(r.reflection?.achieved || "") + '</textarea></label>' +
    '<label class="field-label">Qué voy a mejorar<textarea data-reflection="improve" placeholder="Una mejora concreta para mañana...">' + escape(r.reflection?.improve || "") + '</textarea></label>' +
    '<label class="field-label">Notas<textarea data-reflection="notes" placeholder="Ideas, observaciones o recordatorios">' + escape(r.reflection?.notes || "") + '</textarea></label>';
}

function renderWeek() {
  const w = week(currentDate());
  const completedTasks = weekTasks(currentDate()).filter(t => t.completed).length;
  const totalTasks = weekTasks(currentDate()).length;
  const train = trainingWeekCount(w);
  const study = w.reduce((s,d) => s + Number(data.days[key(d)]?.studyMinutes || 0), 0);
  const sleepValues = w.map(d => Number(data.days[key(d)]?.sleepMinutes || 0)).filter(v => v > 0);
  const avgSleep = sleepValues.length ? Math.round(avg(sleepValues)) : 0;
  return '<div class="view-stack">' +
    '<div class="page-heading"><div><span class="eyebrow">SEMANA ' + weekNumber(currentDate()) + '</span><h1>' + escape(weekLabel(currentDate())) + '</h1><p>Entra a cualquier día para ejecutar; usa esta vista para revisar la semana.</p></div><button class="primary-btn" data-action="modal" data-type="priority-new">＋ Prioridad</button></div>' +
    '<div class="week-summary-grid">' +
      metricCard("Cumplimiento general",weekCompletion(currentDate())+"%",weekCompletion(currentDate())) +
      metricCard("Tareas",completedTasks+" / "+totalTasks,pct(completedTasks,totalTasks),"blue") +
      metricCard("Entrenamientos",train+" / 4",pct(train,4),"green") +
      metricCard("Estudio",fmtHours(study),pct(study,data.settings.studyGoalMinutes*7),"purple") +
    "</div>" +
    '<div class="week-day-grid">' + w.map(daySummary).join("") + "</div>" +
    '<div class="two-col">' + renderWeekDetails(w) + renderWeeklyBalance(w[0]) + "</div>" +
  "</div>";
}
function daySummary(d) {
  const k = key(d), r = data.days[k], ts = tasksFor(k), done = ts.filter(t => t.completed).length;
  const train = data.training.some(t => t.date === k && t.completed);
  const mood = MOODS.find(m => m[0] === r?.mood);
  return '<button class="day-summary-card ' + (k === state.date ? "today" : "") + '" data-action="go-date" data-date="' + k + '">' +
    '<div class="day-name">' + cap(new Intl.DateTimeFormat("es-CL",{weekday:"short"}).format(d).replace(".","")) + "</div>" +
    '<div class="day-num">' + d.getDate() + '</div><div class="day-task-count">' + done + "/" + ts.length + " tareas</div>" +
    '<div class="day-score">' + dayCompletion(k) + '%</div><div class="day-dots"><span class="dot task ' + (done ? "active":"") + '"></span><span class="dot habit ' + (dayHabitPct(k) > 0 ? "active":"") + '"></span><span class="dot train ' + (train ? "active":"") + '"></span></div>' +
    (mood ? '<span class="day-mood">' + mood[1] + "</span>" : '<span class="day-mood muted">—</span>') +
  "</button>";
}
function renderWeekDetails(w) {
  const taskTotal = weekTasks(currentDate()).length, taskDone = weekTasks(currentDate()).filter(t=>t.completed).length;
  const habit = habitWeekPct(w);
  const study = w.reduce((s,d)=>s+Number(data.days[key(d)]?.studyMinutes||0),0);
  const sleep = w.map(d=>Number(data.days[key(d)]?.sleepMinutes||0)).filter(v=>v>0);
  const nsTotal = w.reduce((s,d)=>s+data.nonNegotiables.filter(n=>n.active!==false&&isNonnegScheduled(n,key(d))).length,0);
  const nsDone = w.reduce((s,d)=>s+data.nonNegotiables.filter(n=>n.active!==false&&isNonnegScheduled(n,key(d))).filter(n=>nonnegDone(n,key(d))).length,0);
  return '<section class="card detail-panel"><div class="panel-heading"><div><h3>Resumen de la semana</h3><small>Datos registrados, sin métricas inventadas.</small></div></div>' +
    '<div class="stats-table">' +
      '<div><span>Encuentros con tareas</span><b>' + taskDone + " / " + taskTotal + "</b></div>" +
      '<div><span>No negociables</span><b>' + nsDone + " / " + nsTotal + "</b></div>" +
      '<div><span>Hábitos</span><b>' + habit + "%</b></div>" +
      '<div><span>Entrenamientos</span><b>' + trainingWeekCount(w) + " / 4</b></div>" +
      '<div><span>Estudio</span><b>' + fmtHours(study) + "</b></div>" +
      '<div><span>Sueño promedio</span><b>' + (sleep.length ? fmtMin(Math.round(avg(sleep))) : "—") + "</b></div>" +
    "</div></section>";
}
function renderWeeklyBalance(firstDay) {
  const wk = key(startWeek(firstDay));
  const b = data.weekly[wk] || { achieved:"", improve:"", win:"" };
  return '<section class="card detail-panel"><div class="panel-heading"><div><h3>Balance de la semana</h3><small>Al cerrar la semana, responde qué aprendiste.</small></div></div>' +
    '<label class="field-label">Lo que logré<textarea data-weekly="achieved" placeholder="Qué salió bien...">' + escape(b.achieved || "") + '</textarea></label>' +
    '<label class="field-label">Qué voy a mejorar<textarea data-weekly="improve" placeholder="Qué cambiaré la próxima semana...">' + escape(b.improve || "") + '</textarea></label>' +
    '<label class="field-label">¿Cuál fue tu mayor logro esta semana?<textarea data-weekly="win" placeholder="Tu logro más importante...">' + escape(b.win || "") + '</textarea></label>' +
  "</section>";
}

function renderMonth() {
  const a = parse(state.month), cells = monthGrid(a);
  const days = cells.filter(d => d.getMonth() === a.getMonth());
  const monthCompletion = days.length ? Math.round(avg(days.map(d=>dayCompletion(key(d))))) : 0;
  const monthTasks = days.flatMap(tasksFor);
  const taskPct = pct(monthTasks.filter(t=>t.completed).length, monthTasks.length);
  const train = data.training.filter(t=>t.completed && t.date.startsWith(state.month.slice(0,7))).length;
  return '<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">MES</span><h1>' + cap(fmtMonth(a)) + '</h1><p>Selecciona un día para entrar directamente a su planificación.</p></div><div class="month-nav"><button class="outline-btn" data-action="month-nav" data-delta="-1">←</button><button class="outline-btn" data-action="month-nav" data-delta="1">→</button></div></div>' +
    '<div class="month-month-summary">' +
      '<div><span>Cumplimiento medio</span><b>' + monthCompletion + "%</b></div><div><span>Tareas</span><b>' + taskPct + "%</b></div><div><span>Entrenamientos</span><b>' + train + "</b></div><div><span>Hábitos</span><b>" + monthlyHabitPct(a) + "%</b></div>" +
    "</div>" +
    '<section class="card month-card"><div class="calendar-week-head">' + DAY_KEYS.map(x=>"<span>"+x+"</span>").join("") + '</div><div class="calendar-grid">' +
      cells.map(d => {
        const k = key(d), inside = d.getMonth() === a.getMonth(), c = dayCompletion(k), t = tasksFor(d), h = data.habits.some(x=>habitDayDone(x,k)), tr = data.training.some(x=>x.date===k&&x.completed);
        return '<button class="calendar-day ' + (inside ? "" : "muted") + ' ' + (k === state.date ? "selected" : "") + '" data-action="go-date" data-date="' + k + '">' +
          '<span class="calendar-num">' + d.getDate() + '</span><span class="calendar-score">' + c + '%</span><div class="calendar-meta"><i class="task ' + (t.some(x=>x.completed) ? "on":"") + '"></i><i class="habit ' + (h ? "on":"") + '"></i><i class="train ' + (tr ? "on":"") + '"></i></div><small>' + t.filter(x=>x.completed).length + "/" + t.length + '</small>' +
        "</button>";
      }).join("") +
    "</div></section></div>";
}
function monthlyHabitPct(a) {
  const days = gridMonthDates(a);
  const total = data.habits.reduce((s,h)=>s+days.filter(d=>isHabitScheduled(h,d)).length,0);
  const done = data.habits.reduce((s,h)=>s+days.filter(d=>isHabitScheduled(h,d)&&habitDayDone(h,key(d))).length,0);
  return pct(done,total);
}
function gridMonthDates(a) {
  return monthGrid(a).filter(d=>d.getMonth()===a.getMonth());
}

function renderGoals() {
  return '<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">METAS</span><h1>Metas a largo plazo</h1><p>Meta → prioridad → tarea → completado. Las relaciones actualizan el progreso.</p></div><button class="primary-btn" data-action="modal" data-type="goal-new">＋ Añadir meta</button></div>' +
    (data.goals.length ? '<div class="goal-grid">' + data.goals.map(g => '<div class="card goal-card"><div class="goal-icon">' + escape(g.icon || "🎯") + '</div><div class="goal-copy"><small>' + escape(g.category || "Personal") + '</small><h3>' + escape(g.title) + '</h3>' + progress(goalProgress(g),goalProgress(g)>=80?"green":"blue") + '</div><strong>' + goalProgress(g) + '%</strong><div class="goal-links"><span>' + (g.priorityIds?.length||0) + ' prioridades</span><span>' + (g.taskIds?.length||0) + ' tareas</span><span>' + (g.habitIds?.length||0) + ' hábitos</span><button class="text-action" data-action="modal" data-type="goal-edit" data-id="' + g.id + '">Editar</button><button class="row-action danger" data-action="goal-delete" data-id="' + g.id + '">×</button></div></div>').join("") + '</div>' : empty("Todavía no tienes metas. Define una para darle dirección a la semana.",'<button class="add-inline" data-action="modal" data-type="goal-new">＋ Crear meta</button>')) +
    '<div class="card chain-card"><h3>La cadena que importa</h3><div class="chain"><span>META</span><b>↓</b><span>PRIORIDAD</span><b>↓</b><span>TAREA</span><b>↓</b><span>COMPLETADO</span></div></div></div>';
}

function renderProgress() {
  const base = startWeek(currentDate());
  const weeks = [3,2,1,0].map(i=>week(add(base,-i*7)));
  const labels = ["Cumplimiento","Hábitos","Entrenamiento","Estudio","Sueño","Pasos","Peso"];
  return '<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">PROGRESO</span><h1>Tu evolución</h1><p>Comparaciones descriptivas de tus registros, usando la semana seleccionada como referencia.</p></div></div><div class="trend-grid">' +
    labels.map((label,i)=>trendCard(label,weeks,i)).join("") +
  '</div><div class="card history-card"><div class="panel-heading"><div><h3>Historial reciente</h3><small>4 semanas centradas en ' + escape(weekLabel(currentDate())) + '</small></div></div><div class="history-list">' + weeks.map(w => '<div><strong>Semana ' + weekNumber(w[3]) + '</strong><span>' + weekLabel(w[3]) + '</span><b>' + weekCompletion(w[3]) + '%</b></div>').join("") + '</div></div></div>';
}
function weekMetric(w,label) {
  if (label==="Cumplimiento") return weekCompletion(w[3]);
  if (label==="Hábitos") return habitWeekPct(w);
  if (label==="Entrenamiento") return pct(data.training.filter(t=>t.completed&&w.some(d=>key(d)===t.date)).length,4);
  const rs = w.map(d=>data.days[key(d)]).filter(Boolean);
  if (label==="Estudio") return pct(rs.reduce((s,r)=>s+Number(r.studyMinutes||0),0),data.settings.studyGoalMinutes*7);
  if (label==="Sueño") { const v=rs.map(r=>Number(r.sleepMinutes||0)).filter(x=>x>0); return pct(v.length ? avg(v) : 0,data.settings.sleepGoalMinutes); }
  if (label==="Pasos") { const v=rs.map(r=>Number(r.steps||0)).filter(x=>x>0); return pct(v.length ? avg(v) : 0,data.settings.stepsGoal||10000); }
  return rs.map(r=>Number(r.weight||0)).filter(x=>x>0).length ? avg(rs.map(r=>Number(r.weight||0)).filter(x=>x>0)) : 0;
}
function trendCard(label,weeks,i) {
  const vals=weeks.map(w=>weekMetric(w,label)); const latest=vals[vals.length-1] || 0;
  return '<div class="card trend-card"><div class="trend-top"><div><small>' + label + '</small><strong>' + (label==="Peso" ? (latest ? latest.toFixed(1)+" kg" : "—") : Math.round(latest)+"%") + '</strong></div><span>4 semanas</span></div><div class="sparkline"><svg viewBox="0 0 220 70"><polyline points="' + spark(vals) + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="trend-note">Basado únicamente en registros guardados.</div></div>';
}
function spark(vals) {
  if (vals.length<2) return "0,54 220,54";
  const min=Math.min(...vals), max=Math.max(...vals), span=max-min || 1;
  return vals.map((v,i)=>(i/(vals.length-1))*220 + "," + (58 - ((v-min)/span)*46)).join(" ");
}

function renderInsights() {
  const allDays = Object.keys(data.days).sort();
  const actual = allDays.filter(k => tasksFor(k).length || data.habits.some(h=>habitDayDone(h,k)) || data.days[k]?.studyMinutes || data.days[k]?.sleepMinutes || data.nonNegotiables.some(n=>nonnegDone(n,k)));
  if (actual.length < 3) return '<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">MIS PATRONES</span><h1>Insights</h1><p>Necesitamos algunos registros antes de comparar patrones.</p></div></div><div class="card note-card"><strong>Comienza registrando varios días.</strong><p>Cuando existan al menos 3 días con datos, aquí aparecerán observaciones descriptivas sobre tus propios registros.</p></div></div>';
  const byWeekday = DAY_NUMS.map(dayNum => {
    const vals=actual.filter(k=>parse(k).getDay()===dayNum).map(k=>dayCompletion(k));
    return {dayNum,score:avg(vals),n:vals.length};
  }).filter(x=>x.n).sort((a,b)=>b.score-a.score);
  const best = byWeekday[0];
  const sleep7 = actual.filter(k=>Number(data.days[k]?.sleepMinutes||0)>=420);
  const sleepLess = actual.filter(k=>Number(data.days[k]?.sleepMinutes||0)>0 && Number(data.days[k]?.sleepMinutes||0)<420);
  const avg7 = sleep7.length ? avg(sleep7.map(k=>dayCompletion(k))) : null;
  const avgLess = sleepLess.length ? avg(sleepLess.map(k=>dayCompletion(k))) : null;
  const tasksPending = data.tasks.filter(t=>!t.completed&&!t.date).length;
  const train = data.training.filter(t=>t.completed).length;
  return '<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">MIS PATRONES</span><h1>Insights</h1><p>Observaciones descriptivas; no implican causalidad.</p></div></div><div class="insight-grid">' +
    '<div class="card insight-card"><div class="insight-icon">↗</div><div><h3>Día con mayor cumplimiento</h3><p>' + cap(new Intl.DateTimeFormat("es-CL",{weekday:"long"}).format(new Date(2026,0,4+(best.dayNum||0)))) + ' presenta el promedio más alto en tus registros (' + Math.round(best.score) + '% en ' + best.n + ' día(s)).</p></div></div>' +
    '<div class="card insight-card"><div class="insight-icon">◔</div><div><h3>Registros de sueño</h3><p>' + (avg7!==null ? 'En los días con 7 h o más registraste un cumplimiento medio de ' + Math.round(avg7) + '%. ' + (avgLess!==null ? 'En los días con menos de 7 h fue ' + Math.round(avgLess) + '%.' : '') : 'Todavía no hay suficientes registros comparables de sueño.') + '</p></div></div>' +
    '<div class="card insight-card"><div class="insight-icon">🏋️</div><div><h3>Entrenamiento</h3><p>Has registrado ' + train + ' entrenamiento(s) completado(s) en total. Observa cómo coincide con las semanas que marcaste como prioritarias.</p></div></div>' +
    '<div class="card insight-card"><div class="insight-icon">📋</div><div><h3>Bandeja pendiente</h3><p>Tienes ' + tasksPending + ' tarea(s) sin fecha y sin completar. Puedes asignarles un día o eliminarlas.</p></div></div>' +
  '</div><div class="card note-card"><strong>Cómo leer estos insights</strong><p>PLAN 2.0 describe coincidencias en tus registros. No afirma que una variable cause otra.</p></div></div>';
}

function renderSettings() {
  const notifSupported = "Notification" in window;
  const swSupported = "serviceWorker" in navigator;
  const secure = location.protocol === "https:" || location.hostname==="localhost" || location.hostname==="127.0.0.1";
  return '<div class="view-stack">' +
    '<div class="page-heading"><div><span class="eyebrow">CONFIGURACIÓN</span><h1>Configura lo necesario</h1><p>Datos locales, PWA, notificaciones y sincronización opcional.</p></div></div>' +
    '<div class="settings-grid">' +
      '<div class="card"><h3>Objetivos</h3><label class="field-label">Agua (L)<input type="number" min="0" step="0.1" value="' + data.settings.waterGoal + '" data-setting="waterGoal"></label><label class="field-label">Estudio (min)<input type="number" min="0" step="5" value="' + data.settings.studyGoalMinutes + '" data-setting="studyGoalMinutes"></label><label class="field-label">Sueño objetivo (min)<input type="number" min="0" step="10" value="' + data.settings.sleepGoalMinutes + '" data-setting="sleepGoalMinutes"></label><label class="field-label">Pasos objetivo<input type="number" min="0" step="500" value="' + data.settings.stepsGoal + '" data-setting="stepsGoal"></label></div>' +
      '<div class="card"><h3>Notificaciones</h3><p class="settings-copy">' + (notifSupported ? "Estado del navegador: " + Notification.permission : "Este navegador no expone Notifications.") + '<br>Service Worker: ' + (swSupported ? "disponible":"no disponible") + '<br>HTTPS/localhost: ' + (secure ? "sí":"no") + '</p><div class="settings-actions"><button class="primary-btn" data-action="notification-enable">' + (data.notifications.enabled ? "Notificaciones activas":"Activar notificaciones") + '</button><button class="outline-btn" data-action="notification-test">Probar</button></div><label class="field-label">Avisar antes (min)<input type="number" min="0" max="120" step="5" value="' + data.notifications.leadMinutes + '" data-setting-notification="leadMinutes"></label><label class="minimal-row"><input type="checkbox" data-setting-notification="overdue" ' + (data.notifications.overdue ? "checked":"") + '> Avisar por tareas vencidas</label><div class="support-note">Los recordatorios locales funcionan mientras la app puede ejecutarlos. Push real con la app cerrada requiere un servidor Web Push.</div></div>' +
      '<div class="card"><h3>PWA</h3><p class="settings-copy">La app incluye manifest, service worker, caché offline e instalación. ' + (state.deferredInstallPrompt ? "Tu navegador permite mostrar la instalación ahora.":"La instalación se muestra cuando el navegador determine que la app es instalable.") + '</p><button class="outline-btn" data-action="install-pwa">' + (state.deferredInstallPrompt ? "Instalar PLAN 2.0":"Cómo instalar") + '</button><div class="support-note">En Android usa “Añadir a pantalla de inicio” si el navegador no muestra el botón automático.</div></div>' +
      '<div class="card"><h3>Sincronización</h3><p class="settings-copy">Multitab: ' + ("BroadcastChannel" in window ? "activa":"no disponible") + '. Sincronización remota opcional mediante un endpoint REST que tú controles.</p><label class="minimal-row"><input type="checkbox" data-sync-setting="enabled" ' + (data.sync.enabled ? "checked":"") + '> Activar sincronización remota</label><label class="field-label">Endpoint REST<input type="url" placeholder="https://tu-servidor.example/sync" value="' + escape(data.sync.endpoint || "") + '" data-sync-setting="endpoint"></label><label class="field-label">Token (opcional)<input type="password" value="' + escape(data.sync.token || "") + '" data-sync-setting="token"></label><div class="settings-actions"><button class="outline-btn" data-action="sync-now">Sincronizar ahora</button><button class="outline-btn" data-action="export">Exportar respaldo</button><label class="outline-btn file-button">Importar respaldo<input type="file" accept="application/json" data-action="import"></label></div><small class="settings-copy">Última sincronización: ' + escape(data.sync.lastSync || "nunca") + '</small></div>' +
      '<div class="card"><h3>Datos</h3><p class="settings-copy">Esta versión empieza vacía. Los datos quedan en este navegador y no se mezclan con la antigua demo.</p><button class="outline-btn" data-action="reset">Restaurar PLAN 2.0 vacío</button></div>' +
    '</div></div>';
}

function renderModal() {
  const m=state.modal, t=m.type, item=m.id ? findItem(t,m.id) : null;
  const isTask=t.startsWith("task"), isHabit=t.startsWith("habit"), isPriority=t.startsWith("priority"), isTraining=t.startsWith("training"), isGoal=t.startsWith("goal"), isNon=t.startsWith("nonneg");
  let title = isTask ? (m.id ? "Editar tarea":"Nueva tarea") : isHabit ? (m.id ? "Editar hábito":"Nuevo hábito") : isPriority ? (m.id ? "Editar prioridad":"Nueva prioridad") : isTraining ? (m.id ? "Editar entrenamiento":"Nuevo entrenamiento") : isGoal ? (m.id ? "Editar meta":"Nueva meta") : (m.id ? "Editar no negociable":"Nuevo no negociable");
  let body="";
  if (isTask) {
    body='<label class="field-label">Título<input data-form="title" value="' + escape(item?.title || "") + '" autofocus></label>' +
      '<div class="form-grid"><label class="field-label">Fecha<input type="date" data-form="date" value="' + escape(item?.date || state.date) + '"></label><label class="field-label">Hora<input type="time" data-form="time" value="' + escape(item?.time || "") + '"></label></div>' +
      '<label class="minimal-row"><input type="checkbox" data-form="noDate" ' + ((!item && m.noDate) || (!item?.date) ? "checked":"") + '> Guardar sin fecha (pendiente)</label>' +
      '<div class="form-grid"><label class="field-label">Prioridad<select data-form="priority"><option value="alta" ' + (item?.priority==="alta"?"selected":"") + '>Alta</option><option value="media" ' + ((!item?.priority || item?.priority==="media")?"selected":"") + '>Media</option><option value="baja" ' + (item?.priority==="baja"?"selected":"") + '>Baja</option></select></label><label class="field-label">Duración (min)<input type="number" min="0" step="5" data-form="estimatedMinutes" value="' + (item?.estimatedMinutes || 60) + '"></label></div>' +
      '<label class="field-label">Prioridad de la semana<select data-form="priorityId"><option value="">— Ninguna —</option>' + prioritiesFor(currentDate()).map(p=>'<option value="'+p.id+'" '+(item?.priorityId===p.id?"selected":"")+'>'+escape(p.title)+'</option>').join("") + '</select></label>' +
      '<label class="field-label">Meta relacionada<select data-form="goalId"><option value="">— Ninguna —</option>' + data.goals.map(g=>'<option value="'+g.id+'" '+(item?.goalId===g.id?"selected":"")+'>'+escape(g.title)+'</option>').join("") + '</select></label>' +
      '<label class="field-label">Nota<textarea data-form="note">' + escape(item?.note || "") + '</textarea></label>';
  } else if (isHabit) {
    const days=item?.daysOfWeek || DAY_NUMS;
    body='<label class="field-label">Nombre<input data-form="name" value="' + escape(item?.name || "") + '" autofocus></label><label class="field-label">Objetivo<input data-form="target" value="' + escape(item?.target || "") + '" placeholder="Ej. 20 min"></label><label class="field-label">Frecuencia<select data-form="frequency"><option value="daily" '+(item?.frequency!=="weekly"?"selected":"")+' >Diaria</option><option value="weekly" '+(item?.frequency==="weekly"?"selected":"")+'>Semanal</option></select></label><div class="field-label">Días activos<div class="weekday-picks">'+DAY_NUMS.map((n,i)=>'<label><input type="checkbox" data-habit-day="'+n+'" '+(days.includes(n)?"checked":"")+'> '+DAY_KEYS[i]+'</label>').join("")+'</div></div>';
  } else if (isPriority) {
    const p=item, linked=p?.taskIds || [];
    body='<label class="field-label">Prioridad<input data-form="title" value="' + escape(p?.title || "") + '" autofocus></label><label class="field-label">Progreso base <span id="range-output">' + (p?.progress||0) + '%</span><input type="range" min="0" max="100" value="' + (p?.progress||0) + '" data-form="progress" data-range-output="range-output"></label><div class="field-label">Tareas relacionadas<div class="checklist-picks">'+tasksFor(currentDate()).map(x=>'<label><input type="checkbox" data-priority-task="'+x.id+'" '+(linked.includes(x.id)?"checked":"")+'> '+escape(x.title)+'</label>').join("")+'</div></div>';
  } else if (isTraining) {
    body='<label class="field-label">Nombre<input data-form="title" value="' + escape(item?.title || "") + '" autofocus></label><div class="form-grid"><label class="field-label">Fecha<input type="date" data-form="date" value="' + escape(item?.date || state.date) + '"></label><label class="field-label">Hora<input type="time" data-form="time" value="' + escape(item?.time || "19:00") + '"></label></div><div class="form-grid"><label class="field-label">Duración (min)<input type="number" min="0" data-form="durationMinutes" value="' + (item?.durationMinutes || 60) + '"></label><label class="field-label">Tipo<input data-form="type" value="' + escape(item?.type || "Fuerza") + '"></label></div><label class="field-label">Percepción general<input data-form="perception" value="' + escape(item?.perception || "") + '" placeholder="Ej. Bien, cansado, fácil..."></label><label class="minimal-row"><input type="checkbox" data-form="completed" ' + (item?.completed ? "checked":"") + '> Marcar como completado</label><label class="field-label">Notas<textarea data-form="note">' + escape(item?.note || "") + '</textarea></label>';
  } else if (isGoal) {
    const g=item, pid=g?.priorityIds||[], tid=g?.taskIds||[], hid=g?.habitIds||[];
    body='<div class="form-grid"><label class="field-label">Icono<input data-form="icon" value="' + escape(g?.icon || "🎯") + '"></label><label class="field-label">Categoría<input data-form="category" value="' + escape(g?.category || "Personal") + '"></label></div><label class="field-label">Meta<input data-form="title" value="' + escape(g?.title || "") + '" autofocus></label><label class="field-label">Progreso base <span id="range-output">' + (g?.progress||0) + '%</span><input type="range" min="0" max="100" value="' + (g?.progress||0) + '" data-form="progress" data-range-output="range-output"></label><label class="field-label">Fecha objetivo<input type="date" data-form="targetDate" value="' + escape(g?.targetDate || "") + '"></label>' +
      '<div class="field-label">Prioridades relacionadas<div class="checklist-picks">' + prioritiesFor(currentDate()).map(p=>'<label><input type="checkbox" data-goal-priority="'+p.id+'" '+(pid.includes(p.id)?"checked":"")+'> '+escape(p.title)+'</label>').join("") + '</div></div>' +
      '<div class="field-label">Tareas relacionadas<div class="checklist-picks">' + data.tasks.filter(t=>t.date).map(x=>'<label><input type="checkbox" data-goal-task="'+x.id+'" '+(tid.includes(x.id)?"checked":"")+'> '+escape(x.title)+'</label>').join("") + '</div></div>' +
      '<div class="field-label">Hábitos relacionados<div class="checklist-picks">' + data.habits.map(h=>'<label><input type="checkbox" data-goal-habit="'+h.id+'" '+(hid.includes(h.id)?"checked":"")+'> '+escape(h.name)+'</label>').join("") + '</div></div>';
  } else if (isNon) {
    const n=item, days=n?.days || DAY_NUMS;
    body='<div class="form-grid"><label class="field-label">Icono<input data-form="icon" value="' + escape(n?.icon || "✓") + '"></label><label class="field-label">Objetivo<input data-form="target" value="' + escape(n?.target || "Diario") + '"></label></div><label class="field-label">Nombre<input data-form="name" value="' + escape(n?.name || "Nuevo acuerdo") + '" autofocus></label><div class="form-grid"><label class="field-label">Qué mide<select data-form="mode"><option value="manual" '+(!n?.mode||n?.mode==="manual"?"selected":"")+'>Marcación manual</option><option value="water" '+(n?.mode==="water"?"selected":"")+'>Agua</option><option value="study" '+(n?.mode==="study"?"selected":"")+'>Estudio</option><option value="sleep" '+(n?.mode==="sleep"?"selected":"")+'>Sueño</option><option value="training" '+(n?.mode==="training"?"selected":"")+'>Entrenamiento</option></select></label><label class="minimal-row"><input type="checkbox" data-form="active" '+(n?.active!==false?"checked":"")+'> Activo</label></div><div class="field-label">Días activos<div class="weekday-picks">'+DAY_NUMS.map((n2,i)=>'<label><input type="checkbox" data-nonneg-day="'+n2+'" '+(days.includes(n2)?"checked":"")+'> '+DAY_KEYS[i]+'</label>').join("")+'</div></div>';
  }
  return '<div class="modal-backdrop" data-action="close-modal"><div class="modal card" data-modal-inner><div class="modal-head"><h2>' + title + '</h2><button class="icon-btn" data-action="close-modal">×</button></div>' + body + '<div class="modal-actions"><button class="outline-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" data-action="modal-save">Guardar</button></div></div></div>';
}
function findItem(type,id) {
  const map={task:data.tasks,habit:data.habits,priority:data.priorities,training:data.training,goal:data.goals,nonneg:data.nonNegotiables};
  return Object.entries(map).find(([k])=>type.startsWith(k))?.[1].find(x=>x.id===id);
}
function modalForm() {
  const q={};
  document.querySelectorAll("[data-form]").forEach(el=>{q[el.dataset.form]=el.type==="checkbox" ? el.checked : el.value;});
  return q;
}
function saveModal() {
  const m=state.modal,t=m.type,f=modalForm(),id=m.id;
  if (t==="task-new"||t==="task-edit") {
    const noDate=!!f.noDate;
    const obj={title:(f.title||"").trim()||"Nueva tarea",date:noDate ? "" : (f.date||state.date),time:f.time||"",priority:f.priority||"media",note:f.note||"",estimatedMinutes:Number(f.estimatedMinutes)||60,priorityId:f.priorityId||"",goalId:f.goalId||""};
    data=save(id ? {...data,tasks:data.tasks.map(x=>x.id===id?{...x,...obj}:x)} : {...data,tasks:[...data.tasks,{id:uid("task"),completed:false,createdAt:todayKey(),...obj}]});
  } else if (t==="habit-new"||t==="habit-edit") {
    const days=[...document.querySelectorAll("[data-habit-day]:checked")].map(x=>Number(x.dataset.habitDay));
    const obj={name:(f.name||"").trim()||"Hábito",target:f.target||"",frequency:f.frequency||"daily",daysOfWeek:days.length?days:DAY_NUMS,logs:id?(findItem(t,id)?.logs||{}):{}};
    data=save(id?{...data,habits:data.habits.map(x=>x.id===id?{...x,...obj}:x)}:{...data,habits:[...data.habits,{id:uid("habit"),...obj}]});
  } else if (t==="priority-new"||t==="priority-edit") {
    const taskIds=[...document.querySelectorAll("[data-priority-task]:checked")].map(x=>x.dataset.priorityTask);
    const wk=currentWeekStart(); const existing=prioritiesFor(currentDate());
    if (!id && existing.length>=3) {state.modal=null;toast("Esta semana ya tiene 3 prioridades.");render();return;}
    const old=findItem(t,id); const obj={title:(f.title||"").trim()||"Prioridad",progress:Number(f.progress)||0,taskIds,weekStart:old?.weekStart||wk};
    data=save(id?{...data,priorities:data.priorities.map(x=>x.id===id?{...x,...obj}:x)}:{...data,priorities:[...data.priorities,{id:uid("priority"),...obj}]});
  } else if (t==="training-new"||t==="training-edit") {
    const obj={title:(f.title||"").trim()||"Entrenamiento",date:f.date||state.date,time:f.time||"19:00",durationMinutes:Number(f.durationMinutes)||60,type:f.type||"General",perception:f.perception||"",completed:!!f.completed,note:f.note||""};
    data=save(id?{...data,training:data.training.map(x=>x.id===id?{...x,...obj}:x)}:{...data,training:[...data.training,{id:uid("training"),...obj}]});
  } else if (t==="goal-new"||t==="goal-edit") {
    const old=findItem(t,id); const priorityIds=[...document.querySelectorAll("[data-goal-priority]:checked")].map(x=>x.dataset.goalPriority); const taskIds=[...document.querySelectorAll("[data-goal-task]:checked")].map(x=>x.dataset.goalTask); const habitIds=[...document.querySelectorAll("[data-goal-habit]:checked")].map(x=>x.dataset.goalHabit);
    const obj={title:(f.title||"").trim()||"Nueva meta",icon:f.icon||"🎯",category:f.category||"Personal",progress:Number(f.progress)||0,targetDate:f.targetDate||"",priorityIds,taskIds,habitIds};
    data=save(id?{...data,goals:data.goals.map(x=>x.id===id?{...x,...obj}:x)}:{...data,goals:[...data.goals,{id:uid("goal"),...obj}]});
  } else if (t==="nonneg-new"||t==="nonneg-edit") {
    const days=[...document.querySelectorAll("[data-nonneg-day]:checked")].map(x=>Number(x.dataset.nonnegDay)); const old=findItem(t,id);
    const obj={name:(f.name||"").trim()||"Nuevo acuerdo",icon:f.icon||"✓",target:f.target||"Diario",mode:f.mode||"manual",active:!!f.active,frequency:"custom",days:days.length?days:DAY_NUMS,checks:old?.checks||{}};
    data=save(id?{...data,nonNegotiables:data.nonNegotiables.map(x=>x.id===id?{...x,...obj}:x)}:{...data,nonNegotiables:[...data.nonNegotiables,{id:uid("nonneg"),...obj}]});
  }
  state.modal=null; render(); toast("Guardado");
}

function bindGlobal() {
  document.querySelectorAll("[data-range-output]").forEach(i=>i.addEventListener("input",()=>{const out=document.getElementById(i.dataset.rangeOutput);if(out)out.textContent=i.value+"%";}));
}

document.addEventListener("click", e => {
  const el=e.target.closest("[data-action]"); if(!el)return;
  const a=el.dataset.action;
  if(a==="toggle"){state.open[el.dataset.id]=!state.open[el.dataset.id];render();return;}
  if(a==="nav"){state.page=el.dataset.page;state.mobileMenu=false;render();return;}
  if(a==="mobile-menu"){state.mobileMenu=!state.mobileMenu;render();return;}
  if(a==="view"){state.view=el.dataset.view;render();return;}
  if(a==="today"){state.date=todayKey();state.month=key(new Date(new Date().getFullYear(),new Date().getMonth(),1));state.page="plan";state.view="day";render();return;}
  if(a==="date-nav"){const delta=Number(el.dataset.delta);if(state.view==="day")state.date=key(add(currentDate(),delta));else if(state.view==="week")state.date=key(add(currentDate(),delta*7));else {const d=new Date(parse(state.month));d.setMonth(d.getMonth()+delta);state.month=key(new Date(d.getFullYear(),d.getMonth(),1));}render();return;}
  if(a==="month-nav"){const d=parse(state.month);d.setMonth(d.getMonth()+Number(el.dataset.delta));state.month=key(new Date(d.getFullYear(),d.getMonth(),1));render();return;}
  if(a==="go-date"){state.date=el.dataset.date;state.month=key(new Date(parse(state.date).getFullYear(),parse(state.date).getMonth(),1));state.page="plan";state.view="day";render();return;}
  if(a==="mood"){setDay({mood:el.dataset.mood});return;}
  if(a==="task-toggle"){setData(d=>({...d,tasks:d.tasks.map(t=>t.id===el.dataset.id?{...t,completed:!t.completed}:t)}));return;}
  if(a==="task-delete"){setData(d=>({...d,tasks:d.tasks.filter(t=>t.id!==el.dataset.id)}));return;}
  if(a==="task-tomorrow"){const t=data.tasks.find(x=>x.id===el.dataset.id);if(t){const base=t.date?parse(t.date):currentDate();setData(d=>({...d,tasks:d.tasks.map(x=>x.id===t.id?{...x,date:key(add(base,1))}:x)}));toast("Tarea movida a mañana.");}return;}
  if(a==="habit-toggle"){setData(d=>({...d,habits:d.habits.map(h=>h.id===el.dataset.id?{...h,logs:{...(h.logs||{}),[el.dataset.date]:!h.logs?.[el.dataset.date]}}:h)}));return;}
  if(a==="habit-delete"){setData(d=>({...d,habits:d.habits.filter(h=>h.id!==el.dataset.id)}));return;}
  if(a==="training-toggle"){setData(d=>({...d,training:d.training.map(t=>t.id===el.dataset.id?{...t,completed:!t.completed}:t)}));return;}
  if(a==="minimal-toggle"){const r=dayRecord();setDay({minimalPlan:{...r.minimalPlan,[el.dataset.key]:!r.minimalPlan?.[el.dataset.key]}});return;}
  if(a==="nonneg-toggle"){const n=data.nonNegotiables.find(x=>x.id===el.dataset.id);if(!n)return; if(n.mode==="water")setDay({waterLiters:Number(data.settings.waterGoal)}); else if(n.mode==="study")setDay({studyMinutes:Number(data.settings.studyGoalMinutes)}); else if(n.mode==="sleep")setDay({sleepMinutes:Number(data.settings.sleepGoalMinutes)}); else if(n.mode==="training"){const ex=data.training.find(t=>t.date===state.date);if(ex)setData(d=>({...d,training:d.training.map(t=>t.id===ex.id?{...t,completed:!t.completed}:t)}));else setData(d=>({...d,training:[...d.training,{id:uid("training"),title:"Entrenamiento",date:state.date,time:"19:00",durationMinutes:60,completed:true,type:"General",perception:"",note:""}]}));} else setData(d=>({...d,nonNegotiables:d.nonNegotiables.map(x=>x.id===n.id?{...x,checks:{...(x.checks||{}),[state.date]:!nonnegDone(n,state.date)}}:x)}));return;}
  if(a==="goal-delete"){setData(d=>({...d,goals:d.goals.filter(g=>g.id!==el.dataset.id)}));return;}
  if(a==="modal"){state.modal={type:el.dataset.type,id:el.dataset.id||undefined,noDate:el.dataset.noDate==="true"};render();return;}
  if(a==="close-modal"){if(el.hasAttribute("data-modal-inner"))return;state.modal=null;render();return;}
  if(a==="modal-save"){saveModal();return;}
  if(a==="reset"){reset();return;}
  if(a==="notification-enable"||a==="notification-settings"){openNotificationSettings();return;}
  if(a==="notification-test"){testNotification();return;}
  if(a==="install-pwa"){installPwa();return;}
  if(a==="export"){exportBackup();return;}
  if(a==="sync-now"){syncRemote();return;}
});

document.addEventListener("change", e => {
  const el=e.target;
  if(el.matches("[data-field]")){setDay({[el.dataset.field]:el.type==="number" ? Number(el.value) : Number(el.value)});return;}
  if(el.matches("[data-reflection]")){setReflection(el.dataset.reflection,el.value);return;}
  if(el.matches("[data-weekly]")){const wk=currentWeekStart();setData(d=>({...d,weekly:{...d.weekly,[wk]:{...(d.weekly?.[wk]||{}),[el.dataset.weekly]:el.value}}}));return;}
  if(el.matches("[data-setting]")){setData(d=>({...d,settings:{...d.settings,[el.dataset.setting]:Math.max(0,Number(el.value))}}));return;}
  if(el.matches("[data-setting-notification]")){setData(d=>({...d,notifications:{...d.notifications,[el.dataset.settingNotification]:el.type==="checkbox"?el.checked:Number(el.value)}}));return;}
  if(el.matches("[data-sync-setting]")){setData(d=>({...d,sync:{...d.sync,[el.dataset.syncSetting]:el.type==="checkbox"?el.checked:el.value}}));return;}
  if(el.matches('input[type="file"][data-action="import"]')){importBackup(el.files?.[0]);return;}
});

async function openNotificationSettings() {
  if(!("Notification" in window)){toast("Este navegador no admite notificaciones.");return;}
  if(location.protocol!=="https:" && location.hostname!=="localhost" && location.hostname!=="127.0.0.1"){toast("Las notificaciones requieren HTTPS o localhost.");return;}
  const permission=Notification.permission==="granted" ? "granted" : await Notification.requestPermission();
  if(permission!=="granted"){toast("Permiso de notificaciones: "+permission);return;}
  setData(d=>({...d,notifications:{...d.notifications,enabled:true}}));
  toast("Notificaciones activadas.");
  await maybeSubscribePush();
}
async function maybeSubscribePush() {
  if(!CONFIG.vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg=await navigator.serviceWorker.ready;
    const existing=await reg.pushManager.getSubscription();
    if(existing) return;
    const subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(CONFIG.vapidPublicKey)});
    localStorage.setItem("plan20-push-subscription", JSON.stringify(subscription.toJSON()));
  } catch(err) { console.warn("PLAN 2.0 push subscription:",err); }
}
function base64ToBytes(base64) {
  const pad="=".repeat((4-base64.length%4)%4), b64=(base64+pad).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(b64); const arr=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
  return arr;
}
async function testNotification() {
  if(!("Notification" in window)){toast("Notificaciones no disponibles.");return;}
  if(Notification.permission!=="granted"){await openNotificationSettings();return;}
  try {
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification("PLAN 2.0", {body:"La notificación de prueba funciona en este dispositivo.",icon:"./public/icons/icon-192.png",badge:"./public/icons/icon-192.png",tag:"plan20-test",data:{url:"./"}});
  } catch { try { new Notification("PLAN 2.0",{body:"La notificación de prueba funciona en este dispositivo."}); } catch { toast("No se pudo mostrar la notificación."); } }
}
let reminderTimer=null;
function scheduleLocalReminderCheck() {
  if(reminderTimer) return;
  reminderTimer=setInterval(checkLocalReminders,30000);
  setTimeout(checkLocalReminders,1200);
}
async function checkLocalReminders() {
  if(!data.notifications.enabled || !("Notification" in window) || Notification.permission!=="granted") return;
  const now=new Date(), k=todayKey(), tasks=tasksFor(k), nowMin=now.getHours()*60+now.getMinutes(), lead=Number(data.notifications.leadMinutes)||0;
  for(const t of tasks.filter(x=>!x.completed&&x.time)) {
    const tm=minutesFromTime(t.time); if(tm===null) continue;
    if(tm>=nowMin && tm-nowMin<=lead) await maybeNotify("due-"+k+"-"+t.id,"⏰ "+t.title,"Empieza ahora · " + t.time,t.id);
    if(data.notifications.overdue&&tm<nowMin) await maybeNotify("overdue-"+k+"-"+t.id,"⚠️ Pendiente: "+t.title,"Estaba planificada para las "+t.time,t.id);
  }
}
async function maybeNotify(logKey,title,body,taskId) {
  if(notifyLog[logKey]) return;
  if(document.visibilityState==="hidden" || logKey.startsWith("overdue-") || logKey.startsWith("due-")) {
    try { const reg=await navigator.serviceWorker.ready; await reg.showNotification(title,{body,icon:"./public/icons/icon-192.png",badge:"./public/icons/icon-192.png",tag:logKey,renotify:false,data:{url:"./?date="+state.date+(taskId?"&task="+encodeURIComponent(taskId):"")}}); markNotified(logKey); }
    catch {}
  }
}

async function installPwa() {
  if(state.deferredInstallPrompt){state.deferredInstallPrompt.prompt();try{await state.deferredInstallPrompt.userChoice;}catch{}state.deferredInstallPrompt=null;render();return;}
  toast("Abre el menú del navegador y elige “Instalar app” o “Añadir a pantalla de inicio”.");
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.deferredInstallPrompt=e;render();});
window.addEventListener("appinstalled",()=>{state.deferredInstallPrompt=null;render();toast("PLAN 2.0 quedó instalado.");});
window.addEventListener("online",()=>{toast("Conexión recuperada."); if(data.sync.enabled)syncRemote();});
installSyncListeners(incoming=>{
  if(incoming.meta?.updatedAt===data.meta?.updatedAt)return;
  data=incoming;render();toast("Datos actualizados en otra pestaña.");
});

async function syncRemote() {
  if(!data.sync.enabled || !data.sync.endpoint){toast("Configura un endpoint de sincronización.");return;}
  try {
    const headers={"Content-Type":"application/json"}; if(data.sync.token)headers.Authorization="Bearer "+data.sync.token;
    const remoteRes=await fetch(data.sync.endpoint,{headers,cache:"no-store"});
    let remote=null;
    if(remoteRes.ok){const payload=await remoteRes.json();remote=payload.data||payload;}
    const localAt=Date.parse(data.meta?.updatedAt||0)||0, remoteAt=Date.parse(remote?.meta?.updatedAt||remote?.updatedAt||0)||0;
    if(remote && remoteAt>localAt) {
      data=replace(remote); toast("Descargamos una versión más nueva.");
    } else {
      const body=JSON.stringify({data,updatedAt:data.meta.updatedAt});
      const put=await fetch(data.sync.endpoint,{method:"PUT",headers,body});
      if(!put.ok)throw new Error("HTTP "+put.status);
      data=save({...data,sync:{...data.sync,lastSync:new Date().toISOString()}},false);
      render(); toast("Sincronización completada.");
    }
  } catch(err){console.warn("PLAN 2.0 sync:",err);toast("No se pudo sincronizar: revisa el endpoint.");}
}
function exportBackup() {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="plan20-respaldo-"+todayKey()+".json"; a.click(); URL.revokeObjectURL(url); toast("Respaldo exportado.");
}
async function importBackup(file) {
  if(!file)return;
  try {
    const raw=await file.text(), imported=JSON.parse(raw);
    if(!imported || typeof imported!=="object" || !Array.isArray(imported.tasks))throw new Error("Formato no válido");
    data=replace(imported); render(); toast("Respaldo importado.");
  } catch {toast("No se pudo importar ese respaldo.");}
}

scheduleLocalReminderCheck();
render();
