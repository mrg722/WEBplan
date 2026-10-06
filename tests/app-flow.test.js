import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Take one consistent source snapshot per run while another agent edits app.js.
// Only ESM declarations and three startup calls are removed. No application
// planner/store function (render, saveModal, scheduling, persistence) is stubbed.
const sources = await Promise.all(["data", "utils", "store", "app"].map(async name => ({
  name, code: await readFile(new URL(`../src/${name}.js`, import.meta.url), "utf8")
})));
const KEY = "plan20-data-v2";
const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const camel = name => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Small DOM adapter for generated controls and delegated events. This is not a
// layout/browser emulator: decorative class selectors intentionally find no
// elements. Form defaults, checked state, attributes, and handler execution are real.
function element(attrs = {}, tag = "input") {
  const classes = new Set();
  return {
    attrs, tagName: tag.toUpperCase(),
    dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith("data-")).map(([k, v]) => [camel(k.slice(5)), v])),
    value: attrs.value || "", type: attrs.type || (tag === "input" ? "text" : ""),
    checked: "checked" in attrs, disabled: "disabled" in attrs,
    children: [], controls: [], style: {}, textContent: "", removed: false,
    classList: { toggle(k, enabled) { if (enabled ?? !classes.has(k)) classes.add(k); else classes.delete(k); }, contains: k => classes.has(k) },
    matches(selector) {
      const tokens = [...selector.matchAll(/\[([^=\]]+)(?:=["']([^"']*)["'])?\]/g)];
      if (!tokens.length) return false;
      if (/^[a-z]+/i.test(selector) && selector.match(/^[a-z]+/i)[0].toUpperCase() !== this.tagName) return false;
      return tokens.every(([, k, v]) => k in this.attrs && (v === undefined || this.attrs[k] === v)) && (!selector.endsWith(":checked") || this.checked);
    },
    closest(selector) { return this.matches(selector) ? this : null; },
    hasAttribute(name) { return name in this.attrs; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    appendChild(node) { this.children.push(node); return node; },
    prepend(node) { this.children.unshift(node); },
    remove() { this.removed = true; },
    addEventListener() {}, focus() {}, setSelectionRange() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    set innerHTML(html) { this.html = html; this.controls = parseControls(html); },
    get innerHTML() { return this.html || ""; }
  };
}

function attributes(text) {
  return Object.fromEntries([...text.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(([, k, a, b, c]) => [k, decode(a ?? b ?? c ?? "")]));
}

function parseControls(html) {
  return [...html.matchAll(/<(input|textarea|select|button|output)\b([^>]*)>/g)].map(match => {
    const [, tag, raw] = match;
    const node = element(attributes(raw), tag);
    const start = match.index + match[0].length;
    const end = html.indexOf(`</${tag}>`, start);
    const inner = end < 0 ? "" : html.slice(start, end);
    if (tag === "textarea") node.value = decode(inner);
    if (tag === "select") {
      const options = [...inner.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([, attrs, text]) => ({ attrs: attributes(attrs), text: decode(text) }));
      const option = options.find(o => "selected" in o.attrs) || options[0];
      node.value = option ? option.attrs.value ?? option.text : "";
    }
    return node;
  });
}

function harness({ saved, seed = "", search = "" } = {}) {
  const storage = new Map(saved || []);
  const listeners = new Map();
  const errors = [];
  const app = element({}, "div"), body = element({}, "body"), content = element({}, "div");
  const walk = node => node.removed ? [] : [node, ...node.controls, ...node.children.flatMap(walk)];
  const nodes = () => [app, body, content].flatMap(walk);
  const all = selector => selector.startsWith("[") || selector.startsWith("input[")
    ? nodes().filter(n => n.matches(selector))
    : selector === ".plan-subnav" ? nodes().filter(n => n.className === "plan-subnav") : [];
  const document = {
    body,
    querySelector(selector) {
      if (selector === "#app") return app;
      if (selector === ".content-wrap") return content;
      if (selector === ".bottom-nav") return nodes().find(n => n.className === "bottom-nav") || null;
      return all(selector)[0] || null;
    },
    querySelectorAll: all,
    createElement: tag => element({}, tag),
    getElementById: id => nodes().find(n => n.attrs.id === id) || null,
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [2026, 9, 18, 12, 0, 0])); }
    static now() { return new Date(2026, 9, 18, 12).getTime(); }
  }
  const context = vm.createContext({
    document, Date: FixedDate, URL, URLSearchParams, Intl,
    window: { addEventListener() {} }, navigator: {},
    location: { protocol: "http:", hostname: "localhost", search, reload() {} },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    console: { error: (...args) => errors.push(args.map(String).join(" ")), warn() {}, log() {} },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    confirm: () => true,
    registerServiceWorker: async () => null
  });
  for (const { name, code } of sources) {
    let executable = code.replace(/^import\s+[^;]+;\s*$/gm, "").replace(/^export\s+/gm, "");
    if (name === "app") executable = executable.replace(/^(?:registerServiceWorker\(\)\.then\(\(\)=>\{\}\);|render\(\);|scheduleLocalReminderCheck\(\);)\r?$/gm, "");
    vm.runInContext(executable, context, { filename: `src/${name}.js`, timeout: 3000 });
  }
  const run = code => {
    const result = vm.runInContext(code, context, { timeout: 3000 });
    assert.deepEqual(errors.splice(0), [], "app caught a runtime error (must not silently pass)");
    return result;
  };
  if (!search) run('state.date="2026-10-05"; state.month="2026-10-01";');
  if (seed) run(seed);
  const dispatch = (type, target) => {
    assert.ok(target, `Missing rendered target for ${type}`);
    assert.ok((listeners.get(type) || []).length, `Missing actual ${type} listener`);
    for (const listener of listeners.get(type)) listener({ target, preventDefault() {} });
    assert.deepEqual(errors.splice(0), [], "app caught a runtime error during handler");
  };
  return {
    run, storage, document, app,
    read: expression => JSON.parse(run(`JSON.stringify(${expression})`)),
    render: () => run("render()"),
    controls: all,
    click(selector) { const node = all(selector)[0]; assert.ok(node, `Missing rendered control: ${selector}`); dispatch("click", node); },
    change(selector, value) { const node = all(selector)[0]; assert.ok(node, selector); if (node.type === "checkbox") node.checked = value; else node.value = String(value); dispatch("change", node); },
    dispatch,
    form(values) { for (const [field, value] of Object.entries(values)) { const node = all(`[data-form="${field}"]`)[0]; assert.ok(node, `Missing real form field ${field}`); if (node.type === "checkbox") node.checked = value; else node.value = String(value); } }
  };
}

function newTask(h, title = "Estudiar", date = "2026-10-07") {
  h.run(`state.date=${JSON.stringify(date)}; state.view="day";`);
  h.render();
  h.click('[data-action="modal"][data-type="task-new"]');
  h.form({ title });
  h.click('[data-action="modal-save"]');
  return h.read("data.tasks.at(-1)");
}

function progressMoodDates(h) {
  const section = h.app.innerHTML.split('<section class="card mood-history">')[1]?.split('<section class="card history-card">')[0];
  assert.ok(section, "Progress must render its actual mood history");
  return [...section.matchAll(/data-date="([^"]+)"/g)].map(([, date]) => date).sort();
}

test("new task modal defaults to selected date and saves exactly one task through click handlers", () => {
  const h = harness();
  const task = newTask(h);
  assert.equal(task.date, "2026-10-07");
  assert.equal(task.completed, false);
  assert.deepEqual(h.read("data.tasks.map(t=>t.date)"), ["2026-10-07"]);
  assert.equal(h.read('data.weekly["2026-10-05"].plannedDays["2026-10-07"]'), true);
  assert.equal(JSON.parse(h.storage.get(KEY)).tasks[0].title, "Estudiar");
  h.click('[data-action="modal"][data-type="task-new"]');
  assert.equal(h.controls('[data-form="date"]')[0].value, "2026-10-07");
  assert.equal(h.controls('[data-form="noDate"]')[0].checked, false);
  h.form({ title: "Sin fecha", noDate: true });
  h.click('[data-action="modal-save"]');
  assert.deepEqual(h.read("data.tasks.map(t=>t.date)"), ["2026-10-07", ""]);
});

test("repeat selected remaining dates makes independent copies, rejects next week, and deduplicates", () => {
  const h = harness();
  const original = newTask(h);
  h.click(`[data-action="task-repeat"][data-id="${original.id}"]`);
  const offered = h.controls("[data-repeat-date]").map(n => n.dataset.repeatDate);
  assert.ok(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].every(d => offered.includes(d)));
  assert.ok(offered.every(d => d >= "2026-10-05" && d <= "2026-10-11" && d !== original.date));
  for (const date of ["2026-10-08", "2026-10-11"]) h.controls(`[data-repeat-date="${date}"]`)[0].checked = true;
  // Adversarial input exercises saveRepeatTasks' date validation, not just its UI.
  h.app.controls.push(element({ "data-repeat-date": "2026-10-12", type: "checkbox", checked: "" }));
  h.app.controls.push(element({ "data-repeat-date": "2026-10-04", type: "checkbox", checked: "" }));
  h.click('[data-action="repeat-save"]');
  const tasks = h.read("data.tasks");
  assert.deepEqual(tasks.map(t => t.date), ["2026-10-07", "2026-10-08", "2026-10-11"]);
  assert.equal(new Set(tasks.map(t => t.id)).size, 3);
  assert.ok(tasks.slice(1).every(t => t.sourceId === original.id && !t.completed));
  h.run('state.date="2026-10-08"'); h.render();
  const copy = tasks[1];
  h.change(`[data-task-check="${copy.id}"]`, true);
  assert.deepEqual(h.read("data.tasks.map(t=>t.completed)"), [false, true, false]);
  h.click(`[data-action="modal"][data-id="${copy.id}"]`);
  h.form({ title: "Solo la copia" }); h.click('[data-action="modal-save"]');
  assert.deepEqual(h.read("data.tasks.map(t=>t.title)"), ["Estudiar", "Solo la copia", "Estudiar"]);
  h.run('state.date="2026-10-07"'); h.render();
  h.click(`[data-action="task-repeat"][data-id="${original.id}"]`);
  h.controls('[data-repeat-date="2026-10-08"]')[0].checked = true;
  h.click('[data-action="repeat-save"]');
  assert.equal(h.read("data.tasks.length"), 3);
  assert.equal(h.read('data.tasks.some(t=>t.date>="2026-10-12")'), false);
});

test("repeat-rest selects only through Sunday and selects nothing on Sunday", () => {
  const h = harness();
  const original = newTask(h, "Viernes", "2026-10-09");
  h.click(`[data-action="task-repeat"][data-id="${original.id}"]`);
  h.click('[data-action="repeat-rest"]');
  assert.deepEqual(h.controls("[data-repeat-date]:checked").map(n => n.dataset.repeatDate), ["2026-10-10", "2026-10-11"]);
  h.click('[data-action="repeat-save"]');
  assert.deepEqual(h.read("data.tasks.map(t=>t.date)"), ["2026-10-09", "2026-10-10", "2026-10-11"]);
  const sunday = h.read("data.tasks.at(-1)");
  h.run('state.date="2026-10-11"'); h.render();
  h.click(`[data-action="task-repeat"][data-id="${sunday.id}"]`);
  h.click('[data-action="repeat-rest"]');
  assert.equal(h.controls("[data-repeat-date]:checked").length, 0);
  h.click('[data-action="repeat-save"]');
  assert.equal(h.read("data.tasks.length"), 3);
});

test("notes and energy zero stay date-separated through actual change/save-day handlers and reload", () => {
  const h = harness();
  h.run('state.view="day"'); h.render();
  h.change('[data-reflection="title"]', "Primera semana");
  h.change('[data-reflection="notes"]', "Nota del lunes 5");
  h.change('[data-field="energy"]', 0);
  h.click('[data-action="save-day"]');
  h.change("[data-date-select]", "2026-10-12");
  assert.equal(h.controls('[data-reflection="notes"]')[0].value, "");
  h.change('[data-reflection="notes"]', "Nota del lunes 12");
  h.click('[data-action="save-day"]');
  const restored = harness({ saved: h.storage });
  assert.equal(restored.read('data.days["2026-10-05"].reflection.notes'), "Nota del lunes 5");
  assert.equal(restored.read('data.days["2026-10-05"].energy'), 0);
  assert.equal(restored.read('data.days["2026-10-12"].reflection.notes'), "Nota del lunes 12");
  assert.equal(restored.read('data.weekly["2026-10-05"]?.reflection?.good || ""'), "");
  restored.run('state.view="day"'); restored.render();
  restored.click('[data-action="notes-history"]');
  assert.equal(restored.read("state.page"), "notes");
  restored.click('[data-action="note-toggle"][data-date="2026-10-05"]');
  assert.match(restored.app.innerHTML, /Nota del lunes 5/);
  restored.click('[data-action="go-date"][data-date="2026-10-05"]');
  assert.equal(restored.controls('[data-reflection="notes"]')[0].value, "Nota del lunes 5");
});

test("monthly Progress includes Oct 1–31 including last day, excludes adjacent months, and routes dates", () => {
  const h = harness({ seed: `
    state.date="2026-10-12";
    for(const d of ["2026-09-30","2026-10-01","2026-10-05","2026-10-11","2026-10-12","2026-10-18","2026-10-31","2026-11-01"]){
      data.tasks.push({id:d,title:d,date:d,completed:true});
      Object.assign(ensureDay(data,d),{mood:"Bien",studyMinutes:60,savedAt:"saved"});
    }
  ` });
  h.render(); h.click('[data-action="nav"][data-page="progress"]');
  h.click('[data-action="progress-period"][data-period="month"]');
  const dates = [...new Set(h.controls('[data-action="go-date"]').map(n => n.dataset.date))].sort();
  assert.deepEqual(dates, ["2026-10-01", "2026-10-05", "2026-10-11", "2026-10-12", "2026-10-18", "2026-10-31"]);
  assert.deepEqual(progressMoodDates(h), dates, "October 31 mood must appear as well as its task");
  assert.match(h.app.innerHTML, /6 \/ 6 tareas/);
  assert.match(h.app.innerHTML, /6\.0 h/);
  h.click('[data-action="go-date"][data-date="2026-10-31"]');
  assert.equal(h.read("state.date"), "2026-10-31");
  assert.equal(h.read("state.view"), "day");
});

test("yearly Progress includes Dec 31 tasks and moods and excludes adjacent years", () => {
  const h = harness({ seed: `
    state.date="2026-10-12";
    for(const d of ["2025-12-31","2026-01-01","2026-12-31","2027-01-01"]){
      data.tasks.push({id:d,title:d,date:d,completed:true});
      Object.assign(ensureDay(data,d),{mood:"Calmado",studyMinutes:60,savedAt:"saved"});
    }
  ` });
  h.render(); h.click('[data-action="nav"][data-page="progress"]');
  h.click('[data-action="progress-period"][data-period="year"]');
  const expected = ["2026-01-01", "2026-12-31"];
  const dates = [...new Set(h.controls('[data-action="go-date"]').map(n => n.dataset.date))].sort();
  assert.deepEqual(dates, expected);
  assert.deepEqual(progressMoodDates(h), expected);
  assert.match(h.app.innerHTML, /2 \/ 2 tareas/);
  assert.match(h.app.innerHTML, /2\.0 h/);
  h.click('[data-action="go-date"][data-date="2026-12-31"]');
  assert.equal(h.read("state.date"), "2026-12-31");
  assert.equal(h.read("state.view"), "day");
});

test("planning displays moods but offers no interactive mood-date and ignores its old action", () => {
  const h = harness({ seed: 'ensureDay(data,"2026-10-05").mood="Bien";' });
  h.render();
  assert.match(h.app.innerHTML, /planner-mood-summary/);
  assert.match(h.app.innerHTML, /Bien/);
  assert.equal(h.controls('[data-action="mood-date"]').length, 0);
  assert.equal(h.controls('[data-action="mood"]').length, 0);
  h.dispatch("click", element({ "data-action": "mood-date", "data-date": "2026-10-05", "data-mood": "Agotado" }, "button"));
  assert.equal(h.read('data.days["2026-10-05"].mood'), "Bien");
  h.click('[data-action="planner-day-open"][data-date="2026-10-05"]');
  h.click('[data-action="mood"][data-mood="Calmado"]');
  assert.equal(h.read('data.days["2026-10-05"].mood'), "Calmado");
});

test("weekly Progress switches from Oct 5–11 to Oct 12–18 without leaking dates", () => {
  const h = harness({ seed: `
    for(let n=5;n<=18;n++){
      const date="2026-10-"+String(n).padStart(2,"0");
      data.tasks.push({id:date,title:date,date,completed:n<12});
    }
  ` });
  h.render(); h.click('[data-action="nav"][data-page="progress"]');
  const historyDates = () => [...new Set(h.controls('[data-action="go-date"]').map(n => n.dataset.date))].sort();
  assert.deepEqual(historyDates(), Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 5).padStart(2,"0")}`));
  assert.match(h.app.innerHTML, /7 \/ 7 tareas/);
  h.click('[data-action="date-nav"][data-delta="1"]');
  assert.equal(h.read("state.date"), "2026-10-12");
  assert.deepEqual(historyDates(), Array.from({ length: 7 }, (_, i) => `2026-10-${i + 12}`));
  assert.match(h.app.innerHTML, /0 \/ 7 tareas/);
});

test("weekly nonneg plans, hours, creatina and outcomes remain date isolated", () => {
 const h=harness({seed:`data.nonNegotiables.push({id:"creatina",name:"Creatina",mode:"manual",days:[1,2],checks:{}});data.weekly["2026-10-05"]={nonnegPlans:{creatina:{days:[1],notify:true,reminderTime:"20:00"}},plannedDays:{}};`});
 assert.ok(h.read('activeNonneg("2026-10-05").some(n=>n.id==="creatina")'));
 assert.equal(h.read('activeNonneg("2026-10-06").some(n=>n.id==="creatina")'),false);
 h.run('state.modal={type:"nonneg-outcome",id:"creatina",date:"2026-10-05"};saveNonnegOutcome("missed")');
 assert.equal(h.read('nonnegOutcome(data.nonNegotiables.find(n=>n.id==="creatina"),"2026-10-05")'),'missed');
 assert.equal(h.read('nonnegOutcome(data.nonNegotiables.find(n=>n.id==="creatina"),"2026-10-06")'),'pending');
 h.run('state.modal={type:"nonneg-outcome",id:"creatina",date:"2026-10-05"};saveNonnegOutcome("done")');
 assert.equal(h.read('nonnegDone(data.nonNegotiables.find(n=>n.id==="creatina"),"2026-10-05")'),true);
 h.run('data.weekly["2026-10-05"].nonnegPlans["default-study"]={targetHours:3,days:[1]};');
 assert.equal(h.read('nonnegTarget(data.nonNegotiables.find(n=>n.id==="default-study"),"2026-10-05")'),180);
 assert.equal(h.read('nonnegTarget(data.nonNegotiables.find(n=>n.id==="default-study"),"2026-10-12")'),120);
});

test("reminders honor task opt-out and only pending scheduled nonnegotiables",()=>{
 const h=harness({seed:`data.nonNegotiables=[{id:"creatina",name:"Creatina",mode:"manual",days:[1],checks:{},notify:true,reminderTime:"20:00"}];data.tasks=[{id:"yes",title:"Yes",date:"2026-10-05",notify:true,reminderTime:"19:00"},{id:"no",title:"No",date:"2026-10-05",notify:false,reminderTime:"19:00"}];`});
 assert.equal(h.read('dueReminders(new Date(2026,9,5,18)).length'),0);
 assert.equal(h.read('dueReminders(new Date(2026,9,5,21)).length'),2);
 assert.equal(h.read('dueReminders(new Date(2026,9,6,21)).length'),0);
 h.run('data.nonNegotiables[0].outcomes={"2026-10-05":"missed"};data.tasks[0].completed=true;');
 assert.equal(h.read('dueReminders(new Date(2026,9,5,21)).length'),0);
});

test("nonneg modal saves hour goals, selected days and reminder only to chosen week",()=>{
 const h=harness();h.run('state.modal={type:"nonneg-edit",id:"default-study"};');h.render();
 h.form({targetHours:3.5,notify:true,reminderTime:"18:30"});
 for(const control of h.controls('[data-nonneg-day]'))control.checked=control.dataset.nonnegDay==='1';
 h.click('[data-action="modal-save"]');
 assert.equal(h.read('nonnegTarget(data.nonNegotiables.find(n=>n.id==="default-study"),"2026-10-05")'),210);
 assert.equal(h.read('activeNonneg("2026-10-06").some(n=>n.id==="default-study")'),false);
 assert.equal(h.read('reminderFor(data.nonNegotiables.find(n=>n.id==="default-study"),"2026-10-05").time'),'18:30');
 assert.equal(h.read('nonnegTarget(data.nonNegotiables.find(n=>n.id==="default-study"),"2026-10-12")'),120);
});

test("task notification preference propagates only to same-week copies",()=>{
 const h=harness({seed:`data.tasks=[{id:"root",title:"Task",date:"2026-10-05",notify:false},{id:"copy",sourceId:"root",title:"Task",date:"2026-10-07",notify:false},{id:"later",sourceId:"root",title:"Task",date:"2026-10-12",notify:false}];state.modal={type:"task-edit",id:"root"};`});h.render();
 h.form({notify:true,notifyAll:true,reminderTime:"09:30"});h.click('[data-action="modal-save"]');
 assert.equal(h.read('data.tasks.find(t=>t.id==="copy").notify'),true);
 assert.equal(h.read('data.tasks.find(t=>t.id==="later").notify'),false);
});

test("notification date query initializes the actual day route", () => {
  const h = harness({ search: "?date=2026-10-12&task=example" });
  assert.equal(h.read("state.date"), "2026-10-12");
  assert.equal(h.read("state.view"), "day");
  h.render();
  assert.equal(h.controls("[data-date-select]")[0].value, "2026-10-12");
});

test("real render routes exercise scheduling references with nonempty habits and nonnegotiables", () => {
  const h = harness({ seed: `
    data.habits.push({id:"habit",name:"Lectura",daysOfWeek:[1,3,5],logs:{"2026-10-05":true}});
    data.tasks.push({id:"task",title:"Plan",date:"2026-10-05",completed:false});
  ` });
  h.render();
  for (const view of ["day", "week", "month", "planning"]) {
    h.click(`[data-action="view"][data-view="${view}"]`);
    assert.equal(h.read("state.view"), view);
    assert.ok(h.app.innerHTML.length > 1000);
  }
  for (const page of ["goals", "progress", "insights", "settings", "plan"]) {
    h.click(`[data-action="nav"][data-page="${page}"]`);
    assert.equal(h.read("state.page"), page);
  }
});
