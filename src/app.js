
import {load, save, replace, reset, ensureDay, ensureWeek, installSyncListeners} from "./store.js";
import {add, avg, cap, clamp, escape, fmtDate, fmtHours, fmtMin, fmtMonth, fmtShortDate, key, monthGrid, MOODS, LEGACY_MOODS, moodScore, parse, pct, startWeek, timeEnd, week, weekKey, weekLabel, weekNumber, DAY_KEYS, DAY_NUMS, minutesFromTime} from "./utils.js";
import {registerServiceWorker} from "./notifications.js";

const app=document.querySelector("#app");
const CONFIG=window.PLAN20_CONFIG||{vapidPublicKey:""};
let data=load();
let state={
  page:"plan",view:"planning",
  date:key(new Date()),month:key(new Date(new Date().getFullYear(),new Date().getMonth(),1)),
  mobileMenu:false,modal:null,deferredInstallPrompt:null,
  open:{what:true,agenda:true,nonneg:true,priorities:false,todos:true,habits:false,training:true,study:true,sleep:false,water:false,min:false,balance:true}
};
const NOTIFY_LOG_KEY="plan20-notify-log-v2";
let notifyLog={};
try{notifyLog=JSON.parse(localStorage.getItem(NOTIFY_LOG_KEY)||"{}")}catch{}
let reminderTimer=null;

const id=prefix=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const todayKey=()=>key(new Date());
const currentDate=()=>parse(state.date);
const currentWeekStart=()=>key(startWeek(currentDate()));
const dayRecord=(d=state.date)=>ensureDay(data,d);
const tasksFor=d=>data.tasks.filter(t=>t.date===(typeof d==="string"?d:key(d)));
const weekTasks=d=>week(d).flatMap(tasksFor);
const prioritiesFor=d=>{ const wk=weekKey(typeof d==="string"?parse(d):d); return data.priorities.filter(p=>p.weekStart===wk); };
const weekRecord = (d=currentDate()) => ensureWeek(data, weekKey(d));
const plannedDaysFor = d => weekRecord(d).plannedDays || {};
const dayHasPlan = d => { const k=typeof d==="string"?d:key(d); return !!plannedDaysFor(k)[k] || tasksFor(k).length>0 || data.training.some(t=>t.date===k); };
function setPlannedDay(date,value){ const k=key(parse(date)); setData(d=>{ const w=ensureWeek(d,weekKey(k)); w.plannedDays[k]=!!value; return d; }); }
function setWeeklyField(path,value){ setData(d=>{ const w=ensureWeek(d,currentWeekStart()); const p=String(path).split("."); if(p[0]==="balance")w.balance[p[1]]=value; else if(p[0]==="reflection")w.reflection[p[1]]=value; return d; }); }
function weekGeneralMood(w){const vals=w.map(d=>data.days[key(d)]?.mood).filter(Boolean);if(!vals.length)return {label:"—",count:0};const counts=new Map();for(const v of vals)counts.set(v,(counts.get(v)||0)+1);const max=Math.max(...counts.values());return {label:[...counts].filter(([,n])=>n===max).map(([v])=>v).join(" / "),count:vals.length};}
function repairPriorityRelations(){
 const byId=new Map(data.priorities.map(p=>[p.id,p]));
 for(const t of data.tasks){const p=byId.get(t.priorityId);if(t.priorityId&&(!p||!t.date||weekKey(t.date)!==p.weekStart))t.priorityId="";}
 data.priorities=data.priorities.map(p=>({...p,taskIds:data.tasks.filter(t=>t.priorityId===p.id).map(t=>t.id)}));
}
// Preserve legacy task links while enforcing the priority's own week.
for(const p of data.priorities)for(const taskId of p.taskIds||[]){const t=data.tasks.find(x=>x.id===taskId);if(t&&!t.priorityId&&t.date&&weekKey(t.date)===p.weekStart)t.priorityId=p.id;}
repairPriorityRelations();
const isScheduled=(obj,d,field)=>!Array.isArray(obj[field])||obj[field].includes(parse(d).getDay());
const habitScheduled=(h,d)=>!Array.isArray(h.daysOfWeek)||!h.daysOfWeek.length||h.daysOfWeek.includes(d.getDay());
const plannedNonneg=(d=state.date)=>data.nonNegotiables.map(n=>({...n,...data.weekly[weekKey(d)]?.nonnegPlans?.[n.id]})).filter(n=>n.active!==false&&isScheduled(n,d,"days"));
const activeNonneg=(d=state.date)=>{const all=plannedNonneg(d),training=all.filter(n=>n.mode==="training"),selected=data.days[d]?.trainingNonnegId;return all.filter(n=>n.mode!=="training").concat(training.find(n=>n.id===selected)||training.slice(0,1));};
function nonnegOutcome(n,d=state.date){if(n.mode==="sleep"&&data.days[d]?.sleepRecorded)return nonnegDone(n,d)?"done":"missed";return data.nonNegotiables.find(x=>x.id===n.id)?.outcomes?.[d]|| (nonnegDone(n,d)?"done":"pending");}
function nonnegTarget(n,d=state.date){const effective={...n,...data.weekly[weekKey(d)]?.nonnegPlans?.[n.id]};return Number(effective.targetHours??(n.mode==="sleep"?data.settings.sleepGoalMinutes:data.settings.studyGoalMinutes)/60)*60;}

function reminderFor(n,date=state.date){const base=data.nonNegotiables.find(x=>x.id===n.id)||n,plan=data.weekly[weekKey(date)]?.nonnegPlans?.[n.id]||{},specific=base.reminders?.[date];return {enabled:specific?.enabled??plan.notify??n.notify??true,time:specific?.time||plan.reminderTime||n.reminderTime||"20:00"};}
function nonnegDone(n,d=state.date){
  n={...n,...data.weekly[weekKey(d)]?.nonnegPlans?.[n.id]};
  if(!isScheduled(n,d,"days"))return false;
  const outcome=data.nonNegotiables.find(x=>x.id===n.id)?.outcomes?.[d];
  if(outcome)return outcome==="done";
  const r=data.days[d]||ensureDay(data,d);
  if(n.mode==="water")return Number(r.waterLiters)>=Number(data.settings.waterGoal);
  if(n.mode==="study")return Number(r.studyMinutes)>=nonnegTarget(n,d);
  if(n.mode==="sleep")return Number(r.sleepMinutes)>=nonnegTarget(n,d);
  if(n.mode==="training"){const slot=Number(n.slot)||0;return data.training.some(t=>t.date===d&&t.completed&&(slot?Number(t.slot)===slot:true));}
  return !!n.checks?.[d];
}
const habitDone=(h,d)=>!!h.logs?.[d];
const dayTaskPct=d=>pct(tasksFor(d).filter(t=>t.completed).length,tasksFor(d).length);
const dayHabitPct=d=>{
  const date=parse(d),hs=data.habits.filter(h=>habitScheduled(h,date));
  return pct(hs.filter(h=>habitDone(h,d)).length,hs.length);
};
const dayNonnegPct=d=>{
  const ns=activeNonneg(d);
  return pct(ns.filter(n=>nonnegDone(n,d)).length,ns.length);
};
function dayCompletion(d=state.date){
  const k=typeof d==="string"?d:key(d),tasks=tasksFor(k),ns=activeNonneg(k),hs=data.habits.filter(h=>habitScheduled(h,parse(k))),r=data.days[k],parts=[];
  if(tasks.length)parts.push([dayTaskPct(k),45]); if(ns.length)parts.push([dayNonnegPct(k),20]); if(hs.length)parts.push([dayHabitPct(k),15]);
  const plannedTraining=data.training.filter(t=>t.date===k); if(plannedTraining.length)parts.push([pct(plannedTraining.filter(t=>t.completed).length,plannedTraining.length),10]);
  if(r&&Number(r.studyMinutes)>0)parts.push([pct(r.studyMinutes,data.settings.studyGoalMinutes),5]); if(r&&Number(r.sleepMinutes)>0)parts.push([pct(r.sleepMinutes,data.settings.sleepGoalMinutes),5]);
  if(!parts.length)return 0; const weight=parts.reduce((s,x)=>s+x[1],0); return Math.round(parts.reduce((s,x)=>s+x[0]*x[1],0)/weight);
}
function weekCompletion(d=currentDate()){const planned=week(d).filter(x=>dayHasPlan(key(x)));return planned.length?Math.round(avg(planned.map(x=>dayCompletion(key(x))))):0;}
function weekPlannedCount(d=currentDate()){return week(d).filter(x=>dayHasPlan(key(x))).length;}
function weekPlannedTaskCount(d=currentDate()){return weekTasks(d).length;}
function habitWeekPct(w){
  let total=0,done=0;
  for(const h of data.habits)for(const d of w)if(habitScheduled(h,d)){total++;if(habitDone(h,key(d)))done++;}
  return pct(done,total);
}
function priorityProgress(p){
  const tids=p.taskIds||[];
  const ts=data.tasks.filter(t=>tids.includes(t.id));
  return ts.length?pct(ts.filter(t=>t.completed).length,ts.length):clamp(p.progress||0);
}
function goalProgress(g){
  const parts=[];
  const ts=data.tasks.filter(t=>(g.taskIds||[]).includes(t.id)||t.goalId===g.id);
  const ps=data.priorities.filter(p=>(g.priorityIds||[]).includes(p.id));
  const hs=data.habits.filter(h=>(g.habitIds||[]).includes(h.id));
  if(ts.length)parts.push(pct(ts.filter(t=>t.completed).length,ts.length));
  if(ps.length)parts.push(avg(ps.map(priorityProgress)));
  if(hs.length)parts.push(avg(hs.map(h=>habitWeekPctFor(h,week(currentDate())))));
  if(g.milestones?.length)parts.push(pct(g.milestones.filter(m=>m.completed).length,g.milestones.length));
  return parts.length?Math.round(avg(parts)):clamp(g.progress||0);
}
const habitWeekPctFor=(h,w)=>{
  const s=w.filter(d=>habitScheduled(h,d));
  return pct(s.filter(d=>habitDone(h,key(d))).length,s.length);
};
function trainingWeekCount(w){return data.training.filter(t=>t.completed&&w.some(d=>key(d)===t.date)).length}
function setData(mutator){try{data=typeof mutator==="function"?mutator(data):mutator;repairPriorityRelations();data=save(data);render();scheduleLocalReminderCheck()}catch(error){console.error(error);toast("No se pudo guardar. Exporta un respaldo y revisa el espacio disponible.");}}
function setDay(changes){setData(d=>{Object.assign(ensureDay(d,state.date),changes);return d})}
function setReflection(field,value){setData(d=>{ensureDay(d,state.date).reflection[field]=value;return d})}
function toast(msg){document.querySelector(".toast")?.remove();const e=document.createElement("div");e.className="toast";e.textContent=msg;document.body.appendChild(e);setTimeout(()=>e.remove(),2400)}
function icon(name){ return illustratedIcon(name,24); }
function bar(v,tone="blue"){return `<div class="bar bar-${tone}"><span style="width:${clamp(v)}%"></span></div>`}
function section(id,title,ic,summary,body,action=""){
  if(id==="what")title="POR HACER";
  const open=state.open[id]!==false;
  const icons={what:"success",agenda:"task",nonneg:"shield",priorities:"target",todos:"task",habits:"habit",training:"habit",study:"notes",sleep:"weekly",water:"habit",min:"success",balance:"notes",notes:"notes"};
  return `<section class="card section-card ${open?"is-open":"is-closed"}"><button class="section-head" data-action="toggle" data-id="${id}"><span class="section-title"><span class="section-icon">${atlasIcon(icons[id]||"weekly",24)}</span>${escape(title)}</span><span class="section-right">${summary?`<span class="section-summary">${summary}</span>`:""}<span class="chevron">${open?"−":"⌄"}</span></span></button>${action?`<div class="section-action">${action}</div>`:""}${open?`<div class="section-body">${body}</div>`:""}</section>`;
}
const empty=(msg,action="")=>`<div class="empty-state"><span>${escape(msg)}</span>${action}</div>`;
function illustratedIcon(name,size=28){
  const z=Number(size)||28;
  const svg=(inner,view="0 0 64 64")=>'<svg class="ui-svg" viewBox="'+view+'" width="'+z+'" height="'+z+'" aria-hidden="true">'+inner+'</svg>';
  const map={
    calendar:svg('<rect x="10" y="13" width="44" height="42" rx="10" fill="#e9fbfa" stroke="#41cec5" stroke-width="4"/><path d="M10 25h44" stroke="#41cec5" stroke-width="7"/><path d="M21 9v11M43 9v11" stroke="#173862" stroke-width="5" stroke-linecap="round"/><circle cx="22" cy="35" r="3" fill="#ff8c78"/><circle cx="32" cy="35" r="3" fill="#ffd05a"/><circle cx="42" cy="35" r="3" fill="#55d6ca"/><circle cx="22" cy="45" r="3" fill="#70aaf8"/><path d="M31 45l3 3 9-10" fill="none" stroke="#173862" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    target:svg('<circle cx="30" cy="33" r="20" fill="#ff9a83"/><circle cx="30" cy="33" r="12" fill="#fff8e9"/><circle cx="30" cy="33" r="5" fill="#55d6ca"/><path d="M43 11L35 29M43 11h9M43 11v9" fill="none" stroke="#173862" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    chart:svg('<rect x="9" y="39" width="9" height="14" rx="4" fill="#ff927e"/><rect x="22" y="31" width="9" height="22" rx="4" fill="#ffd15a"/><rect x="35" y="22" width="9" height="31" rx="4" fill="#56d8ca"/><path d="M10 54h44M14 36l10-10 8 7 14-17" fill="none" stroke="#173862" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 16h9v9" fill="none" stroke="#173862" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'),
    spark:svg('<path d="M30 8l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill="#ffd15d"/><circle cx="30" cy="30" r="10" fill="#63d9cf"/><path d="M25 34l5-9 5 9" fill="none" stroke="#173862" stroke-width="3.5" stroke-linecap="round"/><path d="M20 48h22" stroke="#ff8c7a" stroke-width="5" stroke-linecap="round"/>'),
    settings:svg('<circle cx="25" cy="35" r="14" fill="#58d8cc"/><circle cx="41" cy="21" r="10" fill="#ff987e"/><circle cx="25" cy="35" r="6" fill="#eaffff"/><circle cx="41" cy="21" r="4" fill="#fff"/><path d="M25 17v-5M25 58v-5M7 35h5M38 35h5M34 21h-5M53 21h-5" stroke="#173862" stroke-width="4" stroke-linecap="round"/>'),
    notification:svg('<path d="M17 43h30l-4-7V26a11 11 0 0 0-22 0v10z" fill="#43d4cc"/><path d="M27 48c1 5 7 5 9 0" fill="none" stroke="#173862" stroke-width="4" stroke-linecap="round"/><circle cx="46" cy="18" r="7" fill="#ff836f" stroke="#fff" stroke-width="3"/>'),
    weekly:svg('<rect x="10" y="14" width="44" height="39" rx="10" fill="#eaffff" stroke="#44d3cc" stroke-width="4"/><path d="M10 26h44" stroke="#44d3cc" stroke-width="8"/><path d="M21 10v11M43 10v11" stroke="#173862" stroke-width="5" stroke-linecap="round"/><circle cx="22" cy="35" r="3" fill="#ff917e"/><circle cx="32" cy="35" r="3" fill="#ffd15a"/><circle cx="42" cy="35" r="3" fill="#57d8cb"/><circle cx="22" cy="45" r="3" fill="#70aaf8"/><path d="M32 45l3 3 8-10" fill="none" stroke="#173862" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'),
    month:svg('<rect x="10" y="12" width="44" height="42" rx="10" fill="#59d8ce"/><path d="M17 25h30" stroke="#efffff" stroke-width="5"/><path d="M21 10v8M43 10v8" stroke="#173862" stroke-width="5" stroke-linecap="round"/><g fill="#173862"><circle cx="21" cy="34" r="2.5"/><circle cx="32" cy="34" r="2.5"/><circle cx="43" cy="34" r="2.5"/><circle cx="21" cy="43" r="2.5"/><circle cx="32" cy="43" r="2.5"/><circle cx="43" cy="43" r="2.5"/></g>'),
    shield:svg('<path d="M32 8l19 7v15c0 13-8 22-19 27C21 52 13 43 13 30V15z" fill="#54d7cc"/><path d="M22 31l7 7 14-16" fill="none" stroke="#173862" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    task:svg('<rect x="12" y="10" width="40" height="45" rx="9" fill="#efffff" stroke="#42d1ca" stroke-width="4"/><path d="M21 24l4 4 7-8M21 37l4 4 7-8M21 50l4 4 7-8" fill="none" stroke="#173862" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M37 24h8M37 37h8M37 50h8" stroke="#ff8d7b" stroke-width="4" stroke-linecap="round"/>'),
    habit:svg('<rect x="12" y="12" width="40" height="40" rx="10" fill="#b9f1e4"/><path d="M20 22h24M20 32h13M20 42h18" stroke="#173862" stroke-width="4" stroke-linecap="round"/><circle cx="44" cy="32" r="7" fill="#ffd15a"/><path d="M40 32l3 3 6-7" fill="none" stroke="#173862" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
    success:svg('<circle cx="32" cy="32" r="24" fill="#59d9ce"/><path d="M18 33l9 9 19-22" fill="none" stroke="#173862" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    check:svg('<circle cx="32" cy="32" r="23" fill="#59d9ce"/><path d="M18 33l9 9 19-22" fill="none" stroke="#173862" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    "check-empty":svg('<rect x="12" y="12" width="40" height="40" rx="10" fill="#fff" stroke="#9fb3c8" stroke-width="4"/>'),
    notes:svg('<rect x="10" y="9" width="36" height="46" rx="6" fill="#fff7e7" stroke="#ff8f7f" stroke-width="4"/><path d="M19 20h18M19 29h18M19 38h14" stroke="#5bcfc8" stroke-width="3.5" stroke-linecap="round"/><path d="M41 44l9-9 5 5-9 9z" fill="#7aa8f0"/><path d="M41 44l-2 6 6-2" fill="#ff9b7f"/>'),
    mountain:svg('<path d="M8 53l21-31 7 11 7-10 13 30z" fill="#59d7cb"/><path d="M29 22l5 8 5-5" fill="#eefeff"/><path d="M48 20v12M48 20l8 4-8 4" fill="#ff927d"/><path d="M12 53h43" stroke="#173862" stroke-width="4" stroke-linecap="round"/>'),
    water:svg('<path d="M32 8C25 18 14 29 14 39a18 18 0 0 0 36 0C50 29 39 18 32 8Z" fill="#61c8f6"/><path d="M22 41c3 5 7 7 12 7" fill="none" stroke="#eaffff" stroke-width="3.5" stroke-linecap="round"/>'),
    training:svg('<path d="M15 23v18M22 18v28M42 18v28M49 23v18" stroke="#ff8f78" stroke-width="7" stroke-linecap="round"/><path d="M22 32h20" stroke="#173862" stroke-width="7" stroke-linecap="round"/><path d="M25 32h14" stroke="#61d7ca" stroke-width="4" stroke-linecap="round"/>'),
    sleep:svg('<path d="M43 10c-10 2-17 11-17 22 0 11 8 19 19 21-4 2-8 3-13 3C18 56 8 46 8 33S18 9 31 9c4 0 8 1 12 3Z" fill="#8d8be8"/><path d="M43 12l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffd15a"/>'),
    apple:svg('<path d="M32 18c-3-6 2-11 8-12" fill="none" stroke="#173862" stroke-width="4" stroke-linecap="round"/><path d="M32 17c7-4 13-2 17 3 4 5 4 15 0 23-4 8-9 12-17 12s-13-4-17-12c-4-8-4-18 0-23 4-5 10-7 17-3Z" fill="#ff7f73"/><path d="M35 12c4-5 9-5 13-2-2 5-7 7-13 6" fill="#65d8bf"/>'),
    heart:svg('<path d="M32 52S11 39 11 24c0-7 5-12 11-12 4 0 8 2 10 6 2-4 6-6 10-6 6 0 11 5 11 12 0 15-21 28-21 28Z" fill="#ff7f8e"/><path d="M20 22c2-3 5-4 8-4" fill="none" stroke="#fff4f6" stroke-width="3.5" stroke-linecap="round"/>'),
    plus:svg('<circle cx="32" cy="32" r="24" fill="#5ad6ca"/><path d="M32 19v26M19 32h26" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'),
    edit:svg('<path d="M12 48l3-12 25-25 9 9-25 25z" fill="#7ba9ef"/><path d="M34 14l9 9" stroke="#173862" stroke-width="4" stroke-linecap="round"/><path d="M12 48l12-3" stroke="#173862" stroke-width="4" stroke-linecap="round"/>'),
    trash:svg('<path d="M14 18h36M25 12h14M19 18l2 34h22l2-34" fill="#ff6d7b" stroke="#173862" stroke-width="3.5" stroke-linejoin="round"/><path d="M27 25v19M37 25v19" stroke="#fff0f3" stroke-width="3.5" stroke-linecap="round"/>'),
    forward:svg('<circle cx="32" cy="32" r="23" fill="#ffd05a"/><path d="M14 32h29M34 20l12 12-12 12" fill="none" stroke="#173862" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    back:svg('<circle cx="32" cy="32" r="23" fill="#70aaf8"/><path d="M50 32H21M30 20L18 32l12 12" fill="none" stroke="#173862" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    next:svg('<circle cx="32" cy="32" r="23" fill="#70aaf8"/><path d="M14 32h29M34 20l12 12-12 12" fill="none" stroke="#173862" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    menu:svg('<rect x="10" y="13" width="44" height="38" rx="10" fill="#e9fbfa"/><path d="M19 22h26M19 32h26M19 42h26" stroke="#173862" stroke-width="5" stroke-linecap="round"/>'),
    close:svg('<circle cx="32" cy="32" r="23" fill="#ff8f7e"/><path d="M22 22l20 20M42 22L22 42" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'),
    minus:svg('<circle cx="32" cy="32" r="23" fill="#c7d5e6"/><path d="M20 32h24" stroke="#173862" stroke-width="5" stroke-linecap="round"/>'),
    "chevron-down":svg('<path d="M18 24l14 14 14-14" fill="none" stroke="#173862" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
    save:svg('<path d="M12 12h30l10 10v30H12z" fill="#59d8cd" stroke="#173862" stroke-width="3.5" stroke-linejoin="round"/><path d="M21 12v13h20V12M21 45h20v7H21z" fill="#eaffff"/><path d="M25 31h12" stroke="#173862" stroke-width="3.5" stroke-linecap="round"/>'),
    clock:svg('<circle cx="32" cy="32" r="23" fill="#ffd15a"/><path d="M32 19v14l9 6" fill="none" stroke="#173862" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
  };
  return map[name]||map.task;
}
function moodIllustration(label,size=40){
 const colors={Excelente:["#25d5d5","#a1f5e7"],Bien:["#ffc743","#ffeeb1"],Normal:["#ffd15d","#fff0ad"],Bajo:["#b78bf2","#e4d6ff"],Agotado:["#b696ec","#e5d5fb"],Enojado:["#f76a82","#ffbac8"],Motivado:["#ffa937","#ffe5a9"],Calmado:["#4ad6ce","#bdf5ec"]};
 const [a,b]=colors[label]||colors.Normal,safe="mood"+(++moodIllustration.instance),ink="#18374f";
 const eyes=["Agotado","Calmado","Bajo"].includes(label)?'<path d="M11 17q3 4 6 0M23 17q3 4 6 0" fill="none" stroke="'+ink+'" stroke-width="2.2" stroke-linecap="round"/>':label==="Excelente"?'<path d="M11 17q3-5 6 0M23 17q3-5 6 0" fill="none" stroke="'+ink+'" stroke-width="2.2" stroke-linecap="round"/>':'<ellipse cx="14" cy="17" rx="1.8" ry="2.5" fill="'+ink+'"/><ellipse cx="26" cy="17" rx="1.8" ry="2.5" fill="'+ink+'"/>';
 const mouths={Excelente:'<path d="M11 24h18q-1 11-9 11T11 24" fill="'+ink+'"/><path d="M15 30q5-3 10 0-5 6-10 0" fill="#fa7696"/>',Normal:'<path d="M14 27h12" fill="none" stroke="'+ink+'" stroke-width="2.3" stroke-linecap="round"/>',Enojado:'<path d="M13 29q7-8 14 0" fill="none" stroke="'+ink+'" stroke-width="2.3" stroke-linecap="round"/>',Bajo:'<path d="M14 29q6-6 12 0" fill="none" stroke="'+ink+'" stroke-width="2.3" stroke-linecap="round"/>',Agotado:'<ellipse cx="20" cy="27" rx="3.8" ry="4" fill="'+ink+'"/>'};
 const mouth=mouths[label]||'<path d="M13 25q7 9 14 0" fill="none" stroke="'+ink+'" stroke-width="2.3" stroke-linecap="round"/>';
 const brows=label==="Enojado"?'<path d="M10 11l7 3M30 11l-7 3" fill="none" stroke="'+ink+'" stroke-width="2" stroke-linecap="round"/>':"";
 return `<svg class="mood-face" viewBox="0 0 40 40" width="${size}" height="${size}" role="img" aria-label="${escape(label)}"><defs><radialGradient id="${safe}" cx="30%" cy="25%" r="80%"><stop stop-color="${b}"/><stop offset="1" stop-color="${a}"/></radialGradient></defs><circle cx="20" cy="20" r="18" fill="url(#${safe})"/>${eyes}${brows}${mouth}</svg>`;
}
moodIllustration.instance=0;
function semanticIcon(name,size=28){ return illustratedIcon(name,size); }
function atlasIcon(name,size=28){ return semanticIcon(name,size); }
function iconToken(value,fallback="task"){
  const raw=String(value||"").trim();
  const legacy={"🎯":"target","💧":"water","♥":"heart","❤":"heart","✓":"check","↔":"training","▤":"notes","◔":"sleep","◯":"apple","⚡":"spark","✎":"edit","×":"close","→":"forward","←":"back","‹":"back","›":"next","◢":"weekly"};
  const token=legacy[raw]||raw.toLowerCase();
  const allowed=["calendar","target","chart","spark","settings","notification","weekly","month","shield","task","habit","success","check","check-empty","notes","mountain","water","training","sleep","apple","heart","plus","edit","trash","forward","back","next","menu","close","minus","chevron-down","save","clock"];
  return allowed.includes(token)?token:fallback;
}
function iconOptions(selected,fallback="task"){
  const value=iconToken(selected,fallback);
  const items=[["task","Tarea"],["check","Completado"],["water","Agua"],["training","Entrenamiento"],["notes","Estudio"],["sleep","Sueño"],["apple","Alimentación"],["heart","Cuidado personal"],["target","Meta"],["habit","Hábito"],["shield","No negociable"],["calendar","Calendario"]];
  return items.map(([v,l])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+l+'</option>').join("");
}
function dataIcon(value,size=22){
  const raw=String(value||"").toLowerCase();
  let name="";
  if(raw.includes("agua")||raw.includes("water")||raw==="💧")name="water";
  else if(raw.includes("entren")||raw.includes("gym")||raw.includes("🏋"))name="training";
  else if(raw.includes("estud")||raw.includes("libro")||raw.includes("▤"))name="notes";
  else if(raw.includes("dorm")||raw.includes("sue")||raw.includes("◔"))name="sleep";
  else if(raw.includes("comida")||raw.includes("aliment")||raw.includes("◯"))name="apple";
  else if(raw.includes("cuidado")||raw.includes("corazon")||raw.includes("♥")||raw.includes("❤"))name="heart";
  else if(raw.includes("meta")||raw.includes("target")||raw.includes("🎯"))name="target";
  else if(raw.includes("no negociable")||raw.includes("shield"))name="shield";
  else if(raw.includes("habit"))name="habit";
  else if(raw.includes("check")||raw==="✓")name="check";
  else name=iconToken(value,"task");
  return illustratedIcon(name,size);
}
function decorateIcons(){
  document.querySelectorAll(".brand-leaf").forEach(e=>e.innerHTML=illustratedIcon("weekly",28));
  document.querySelectorAll(".support-note").forEach(e=>{if(e.textContent.includes("♡")){const copy=e.innerHTML.replace("♡ ","");e.innerHTML=illustratedIcon("heart",15)+'<span>'+copy+"</span>";}});

  document.querySelectorAll(".task-check,.tiny-check,.habit-check").forEach(b=>{
    const checked=b.classList.contains("checked");
    b.innerHTML=illustratedIcon(checked?"check":"check-empty",13);
    b.setAttribute("aria-pressed",String(checked));
  });
  document.querySelectorAll(".row-action").forEach(b=>{
    const a=b.dataset.action||"";
    const name=a==="modal"?"edit":a.includes("delete")?"trash":a==="task-tomorrow"?"forward":"close";
    b.innerHTML=illustratedIcon(name,15);
  });
  document.querySelectorAll(".section-head .chevron").forEach(e=>{
    e.innerHTML=illustratedIcon(e.closest(".section-card")?.classList.contains("is-open")?"minus":"chevron-down",13);
  });
  document.querySelectorAll(".day-plan-toggle").forEach(b=>{
    const planned=b.classList.contains("active");
    b.innerHTML=illustratedIcon(planned?"check":"check-empty",17)+'<span>'+(planned?"Planificado":"Planificar")+'</span>';
  });
  document.querySelectorAll(".planner-belief span").forEach(e=>e.innerHTML=illustratedIcon("heart",16));
  document.querySelectorAll(".modal-actions .primary-btn").forEach(b=>{
    if(!b.querySelector("svg")) b.innerHTML=illustratedIcon("save",16)+'<span>Guardar</span>';
  });
  document.querySelectorAll(".modal-actions .outline-btn").forEach(b=>{
    if(!b.querySelector("svg")&&b.textContent.trim()==="Cancelar") b.innerHTML=illustratedIcon("close",15)+'<span>Cancelar</span>';
  });
  document.querySelectorAll("button").forEach(b=>{
    if(b.querySelector("svg")) return;
    const t=b.textContent.trim();
    if(/^＋\s*/.test(t)){const label=t.replace(/^＋\s*/,"");b.innerHTML=illustratedIcon("plus",14)+'<span>'+label+'</span>';return;}
    const singles={"☰":"menu","←":"back","→":"forward","‹":"back","›":"next","×":"close","✎":"edit","✓":"check","♡":"heart"};
    if(singles[t])b.innerHTML=illustratedIcon(singles[t],16);
  });
}
function mountBottomNav(){
  document.querySelector(".bottom-nav")?.remove();
  const items=[["plan","Plan","calendar"],["goals","Metas","target"],["progress","Progreso","chart"],["insights","Insights","spark"],["settings","Configura","settings"]];
  const nav=document.createElement("nav");nav.className="bottom-nav";nav.setAttribute("aria-label","Navegación principal");
  nav.innerHTML=items.map(([p,label,ico])=>`<button class="bottom-nav-item ${(state.page===p||(state.page==="notes"&&p==="plan"))?"active":""}" data-action="nav" data-page="${p}"><span class="bottom-nav-icon">${atlasIcon(ico,27)}</span><span>${label}</span></button>`).join("");
  document.body.appendChild(nav);
}
function mountPlanSubnav(){
  document.querySelectorAll(".plan-subnav").forEach(x=>x.remove());
  if(state.page!=="plan")return;
  const wrap=document.querySelector(".content-wrap");if(!wrap)return;
  const sub=document.createElement("div");sub.className="plan-subnav";
  sub.innerHTML=[["planning","Planificar semana","weekly"],["day","Día","calendar"],["week","Semana","weekly"],["month","Mes","month"]].map(([v,label,ico])=>`<button class="${state.view===v?"active":""}" data-action="view" data-view="${v}">${atlasIcon(ico,18)}<span>${label}</span></button>`).join("");
  wrap.prepend(sub);
}
function decoratePlannerBlocks(){
  const ids=["nonneg","habits","balance","priorities","todos","reflection","goals","tracking"];
  document.querySelectorAll(".planning-page .planner-block").forEach((block,index)=>{
    const id=ids[index]||("extra-"+index);block.dataset.planBlock=id;
    const head=block.querySelector(".planner-block-head");if(!head)return;
    const iconMap={"week-grid":"weekly",nonneg:"shield",habits:"habit",priorities:"target",todos:"task",balance:"success",reflection:"notes",goals:"mountain",tracking:"chart"};
    const titleWrap=head.querySelector(".planner-block-title")||head.firstElementChild;
    if(titleWrap&&!titleWrap.querySelector(".planner-block-icon")){
      const holder=document.createElement("span");holder.className="planner-block-icon";holder.innerHTML=atlasIcon(iconMap[id]||"weekly",28);
      titleWrap.prepend(holder);
    }
    let actions=head.querySelector(".planner-block-actions");
    if(!actions){actions=document.createElement("div");actions.className="planner-block-actions";head.appendChild(actions);}
    const compact=document.createElement("button");compact.className="compact-toggle";compact.type="button";compact.textContent=state.open["plan:"+id]===false?"Expandir":"Compactar";
    compact.addEventListener("click",()=>{state.open["plan:"+id]=state.open["plan:"+id]===false;render();});
    actions.appendChild(compact);
    const isOpen=state.open["plan:"+id]!==false;compact.setAttribute("aria-expanded",String(isOpen));block.classList.toggle("is-closed",!isOpen);
  });
}
function render(){
  document.body.classList.toggle("nav-open",state.mobileMenu);
  app.innerHTML=appShell();
  mountBottomNav();
  mountPlanSubnav();
  decoratePlannerBlocks();
  decorateIcons();
  bindGlobal();
}
function renderPage(){
  if(state.page==="notes")return renderNotesPage();
  if(state.view==="picker"&&state.page==="plan")return renderTaskPicker(state.date);
  if(state.page==="goals")return renderGoals();
  if(state.page==="progress")return renderProgress();
  if(state.page==="insights")return renderInsights();
  if(state.page==="settings")return renderSettings();
  if(state.view==="planning")return renderPlanning();if(state.view==="week")return renderWeek();
  if(state.view==="month")return renderMonth();
  return renderDay();
}
function renderPlanning(){const d=currentDate(),w=week(d),wr=ensureWeek(data,currentWeekStart());return "<div class='view-stack planning-page'><div class='page-heading'><div><h1>Planificación semanal</h1><p>Organiza tus tareas, un día a la vez.</p></div><button class='primary-btn' data-action='modal' data-type='priority-new'>＋ Prioridad</button></div><div class='planning-week-meta'><span>Semana "+escape(weekLabel(d))+"</span><b>"+weekPlannedCount(d)+" / 7 días planificados</b></div><div class='planner-scroll'><div class='planner-week-grid'>"+w.map(renderPlannerDay).join("")+"</div></div><div class='planning-columns'><div class='planning-col'><section class='card planner-block'><div class='planner-block-head'><div><h2>NO NEGOCIABLES</h2><p>Lo que se mantiene durante la semana.</p></div><button class='outline-btn small' data-action='modal' data-type='nonneg-new'>＋ Añadir</button></div>"+renderWeeklyNonneg(w)+"</section><section class='card planner-block'><div class='planner-block-head'><div><h2>HÁBITOS ADICIONALES</h2><p>Pequeñas acciones, grandes cambios.</p></div><button class='outline-btn small' data-action='modal' data-type='habit-new'>＋ Añadir</button></div>"+renderHabits(w)+"</section><section class='card planner-block'><div class='planner-block-head'><div><h2>BALANCE DE LA SEMANA</h2><p>Lo que logré y qué voy a mejorar.</p></div></div>"+renderWeeklyBalance(wr)+"</section></div><div class='planning-col'><section class='card planner-block'><div class='planner-block-head'><div><h2>PRIORIDADES DE LA SEMANA</h2><p>Máximo 3 y siempre dentro de esta semana.</p></div><span class='planner-count'>"+prioritiesFor(d).length+" / 3</span></div>"+renderPlanningPriorities(d)+"</section><section class='card planner-block'><div class='planner-block-head'><div><h2>POR HACER</h2><p>Pendientes que después puedes asignar a un día.</p></div><button class='outline-btn small' data-action='modal' data-type='task-new' data-no-date='true'>＋ Añadir</button></div>"+renderTodos()+"</section><section class='card planner-block'><div class='planner-block-head'><div><h2>NOTAS / REFLEXIÓN</h2><p>Qué salió bien, qué puedo mejorar, ideas y observaciones.</p></div></div>"+renderWeeklyReflection(wr)+"</section></div><div class='planning-col'><section class='card planner-block'><div class='planner-block-head'><div><h2>METAS A LARGO PLAZO</h2><p>RECUERDA POR QUÉ LO HACES</p></div><button class='outline-btn small' data-action='nav-goals'>Ver metas</button></div>"+renderPlanningGoals()+"</section><section class='card planner-block'><div class='planner-block-head'><div><h2>SEGUIMIENTO SEMANAL</h2><p>Evalúa tu progreso real.</p></div></div>"+renderWeeklyTracking(w)+"</section><div class='planner-belief'>Cree en ti <span>♡</span></div></div></div></div>";}
function renderPlannerTask(t){return `<div class="planner-task-row ${t.completed?"done":"pending"}"><input type="checkbox" data-task-check="${t.id}" ${t.completed?"checked":""} aria-label="Completar ${escape(t.title)}"><div class="planner-task-copy"><strong>${escape(t.title)}</strong>${t.time?`<small>${escape(t.time)}</small>`:""}</div></div>`}
function renderWeeklyNonneg(w){
 const ns=data.nonNegotiables.filter(n=>n.active!==false).map(n=>({...n,...data.weekly[currentWeekStart()]?.nonnegPlans?.[n.id]}));
 return ns.length?`<div class="weekly-records">${ns.map(n=>{const scheduled=w.filter(d=>isScheduled(n,key(d),"days")),done=scheduled.filter(d=>nonnegDone(n,key(d))).length;return `<article class="weekly-record"><div class="weekly-record-heading">${dataIcon(n.icon||n.name,30)}<strong>${escape(n.name)}${["study","sleep"].includes(n.mode)?" · "+nonnegTarget(n)/60+" h":""}</strong><b>${pct(done,scheduled.length)}%</b><button class="text-action" data-action="modal" data-type="nonneg-edit" data-id="${n.id}">Editar</button></div><div class="weekly-checks">${w.map((d,i)=>{const k=key(d);return `<label><span>${DAY_KEYS[i]}</span><button class="weekly-outcome ${nonnegOutcome(n,k)}" data-action="nonneg-outcome" data-id="${n.id}" data-date="${k}" ${isScheduled(n,k,"days")?"":"disabled"} aria-label="${escape(n.name)} · ${escape(fmtDate(d))}">${n.mode==="sleep"&&data.days[k]?.sleepRecorded?Number(data.days[k].sleepMinutes)/60+"h":nonnegOutcome(n,k)==="done"?"✓":nonnegOutcome(n,k)==="missed"?"×":"□"}</button></label>`}).join("")}</div></article>`}).join("")}</div>`:empty("No hay no negociables configurados.");
}
function renderPlanningPriorities(d){const list=prioritiesFor(d);if(!list.length)return empty("Define hasta 3 prioridades que representen lo importante de la semana.","<button class='add-inline' data-action='modal' data-type='priority-new'>＋ Crear prioridad</button>");return "<div class='planning-priority-list'>"+list.slice(0,3).map((p,i)=>{const pr=priorityProgress(p);return "<div class='planning-priority-row'><div class='priority-number n"+(i+1)+"'>"+(i+1)+"</div><div><strong>"+escape(p.title)+"</strong>"+bar(pr,i===1?"green":"blue")+"<small>"+(p.taskIds?.length||0)+" tareas relacionadas · "+pr+"%</small></div><button class='text-action' data-action='modal' data-type='priority-edit' data-id='"+p.id+"'>Editar</button><button class='row-action danger' data-action='priority-delete' data-id='"+p.id+"' aria-label='Eliminar prioridad'>×</button></div>";}).join("")+"</div>";}
function renderWeeklyBalance(wr){return "<div class='weekly-form'><label class='field-label'>LO QUE LOGRÉ<textarea data-weekly='balance.achieved' placeholder='¿Qué logré esta semana?'>"+escape(wr.balance?.achieved||"")+"</textarea></label><label class='field-label'>QUÉ VOY A MEJORAR<textarea data-weekly='balance.improve' placeholder='Una mejora concreta para la próxima semana...'>"+escape(wr.balance?.improve||"")+"</textarea></label></div>";}
function renderWeeklyReflection(wr){return "<div class='weekly-form'><label class='field-label'>Qué salió bien<textarea data-weekly='reflection.good'>"+escape(wr.reflection?.good||"")+"</textarea></label><label class='field-label'>Qué puedo mejorar<textarea data-weekly='reflection.improve'>"+escape(wr.reflection?.improve||"")+"</textarea></label><label class='field-label'>Ideas<textarea data-weekly='reflection.ideas'>"+escape(wr.reflection?.ideas||"")+"</textarea></label><label class='field-label'>Observaciones<textarea data-weekly='reflection.observations'>"+escape(wr.reflection?.observations||"")+"</textarea></label></div>";}
function renderPlanningGoals(){if(!data.goals.length)return "<div class='empty-state'><span>Registra una meta para mantener visible tu dirección.</span><button class='add-inline' data-action='modal' data-type='goal-new'>＋ Crear meta</button></div>";return "<div class='planning-goals-list'>"+data.goals.slice(0,4).map(g=>{const p=goalProgress(g);return "<div class='planning-goal-row'><span class='goal-icon'>"+dataIcon(g.icon||g.title,24)+"</span><div><strong>"+escape(g.title)+"</strong>"+bar(p,p>=80?"green":"blue")+"</div><b>"+p+"%</b></div>";}).join("")+"<div class='reason-why'><strong>RECUERDA POR QUÉ LO HACES</strong><p>"+escape(data.settings.reasonWhy||"Define en Configuración el motivo que quieres tener presente.")+"</p></div></div>";}
function renderWeeklyTracking(w){const records=w.map(d=>data.days[key(d)]||{}),weights=records.map(r=>Number(r.weight||0)).filter(x=>x>0),steps=records.map(r=>Number(r.steps||0)).filter(x=>x>0),study=records.reduce((s,r)=>s+Number(r.studyMinutes||0),0),sleeps=records.map(r=>Number(r.sleepMinutes||0)).filter(x=>x>0),mood=weekGeneralMood(w),weight=weights.length?avg(weights).toFixed(1)+" kg":"—",avgSteps=steps.length?Math.round(avg(steps)).toLocaleString("es-CL"):"—",sleep=sleeps.length?fmtHours(avg(sleeps)):"—";return "<div class='weekly-tracking'><div><span>PESO</span><b>"+weight+"</b></div><div><span>PASOS PROMEDIO</span><b>"+avgSteps+"</b></div><div><span>HORAS DE ESTUDIO</span><b>"+fmtHours(study)+"</b></div><div><span>HORAS DE SUEÑO</span><b>"+sleep+"</b></div><div><span>SENSACIÓN GENERAL</span><b>"+mood.label+"</b><small>"+(mood.count?mood.count+" día(s) con estado registrado":"sin registros")+"</small></div><div><span>LOGRO DE LA SEMANA</span><b>"+weekCompletion(currentDate())+"%</b></div></div>";}
function renderDay(){
  const d=currentDate(),r=dayRecord(),tasks=tasksFor(state.date),done=tasks.filter(t=>t.completed).length,ns=activeNonneg(state.date),nd=ns.filter(n=>nonnegDone(n,state.date)).length;
  const future=state.date>todayKey(),hs=data.habits.filter(h=>habitScheduled(h,d));
  const fields=[["waterLiters","Agua · litros",0.1],["studyMinutes","Estudio · horas",0.25],["sleepMinutes","Sueño · horas",0.25],["steps","Pasos",1],["weight","Peso · kg",0.1]];
  return `<div class="day-view-shell">
    <div class="day-date-nav"><button class="outline-btn" data-action="date-nav" data-delta="-1" aria-label="Día anterior">${icon("back")}</button><div><strong>${cap(fmtDate(d))}</strong><input class="day-date-picker" type="date" value="${state.date}" data-date-select aria-label="Seleccionar fecha"></div><button class="outline-btn" data-action="date-nav" data-delta="1" aria-label="Día siguiente">${icon("next")}</button><button class="today-btn" data-action="today">Hoy</button></div>
    <div class="day-layout"><div class="day-main">
    <section class="card hero-card day-emotions"><h2>¿Cómo ${state.date===todayKey()?"estás hoy":"te sentiste"}?</h2><p class="note-helper">${future?"El ánimo se registra cuando llega el día, no al planificar.":"Tu registro personal de esta fecha. Elige cómo te sientes."}</p><div class="day-mood-options">${MOODS.concat(LEGACY_MOODS).map(m=>`<button class="mood-option ${r.mood===m[0]?"selected":""}" data-action="mood" data-mood="${m[0]}" aria-pressed="${r.mood===m[0]}" ${future?"disabled":""}>${moodIllustration(m[0],44)}<small>${m[0]}</small></button>`).join("")}</div>
    <div class="day-energy"><label for="daily-energy">Energía <small>0–10 · opcional</small></label><input id="daily-energy" type="range" min="0" max="10" value="${r.energy??0}" data-field="energy" ${future?"disabled":""}><output id="energy-output">${r.energy==null?"Sin registro":r.energy+" / 10"}</output></div></section>
    ${section("agenda","Tareas del día","task",done+" / "+tasks.length,renderAgenda(tasks),`<button class="outline-btn small" data-action="picker-open" data-date="${state.date}">${illustratedIcon("plus",18)} Añadir tarea</button>`)}
    ${section("nonneg","No negociables","shield",nd+" / "+ns.length,renderNonneg(ns))}
    ${section("habits","Hábitos del día","habit","Solo esta fecha",hs.length?`<div class="nonneg-list">${hs.map(h=>`<label class="metric-row"><span class="metric-icon">${dataIcon(h.name,28)}</span><span class="metric-copy"><strong>${escape(h.name)}</strong><small>${escape(h.target||"")}</small></span><input type="checkbox" data-habit-check="${h.id}" data-date="${state.date}" ${habitDone(h,state.date)?"checked":""} aria-label="${escape(h.name)}"></label>`).join("")}</div>`:empty("No hay hábitos para esta fecha."))}
    </div><aside class="day-side"><div class="side-stack">
    ${section("daily-metrics","Seguimiento del día","chart","Datos reales",`<div class="day-metrics-grid">${fields.map(([field,label,step])=>`<label class="field-label">${label}<input type="number" min="0" step="${step}" data-field="${field}" ${["studyMinutes","sleepMinutes"].includes(field)?'data-hours="true"':""} value="${["studyMinutes","sleepMinutes"].includes(field)?Number(r[field]||0)/60:r[field]??""}" placeholder="Sin registro"></label>`).join("")}</div>`)}
    ${section("training","Entrenamiento","training","Solo esta fecha",renderTraining([d]),'<button class="outline-btn small" data-action="modal" data-type="training-new">Añadir entrenamiento</button>')}
    ${section("notes","Nota / reflexión","notes",r.reflection?.notes?"Registrada":"Sin nota",renderDailyNotes(r),'<button class="outline-btn small" data-action="notes-history">Ver notas</button>')}
    </div></aside></div><div class="day-save-row"><button class="primary-btn" data-action="save-day">${illustratedIcon("save",22)} GUARDAR DÍA</button><small>${r.savedAt?"Último guardado: "+escape(new Date(r.savedAt).toLocaleString("es-CL")):"Guarda el registro de "+escape(fmtShortDate(d))}</small></div></div>`;
}
function getNextAction(d){
  const tasks=tasksFor(key(d)).filter(t=>!t.completed);
  if(!tasks.length)return null;
  const now=new Date(),nowM=now.getHours()*60+now.getMinutes();
  return tasks.map(t=>{
    const tm=minutesFromTime(t.time),priority=t.priority==="alta"?5:t.priority==="media"?3:1;
    const overdue=tm!==null&&key(d)===todayKey()&&tm<nowM?6:0;
    const near=tm===null?0:Math.max(0,180-Math.abs(tm-nowM))/60;
    const short=Math.max(0,60-Math.min(60,Number(t.estimatedMinutes)||60))/100;
    return {t,score:priority+overdue+near+short};
  }).sort((a,b)=>b.score-a.score||(minutesFromTime(a.t.time)??9999)-(minutesFromTime(b.t.time)??9999))[0].t;
}
function getFollowingAction(t){return tasksFor(state.date).filter(x=>!x.completed&&x.id!==t.id).sort((a,b)=>(minutesFromTime(a.time)??9999)-(minutesFromTime(b.time)??9999))[0]||null}
function renderAgenda(tasks){if(!tasks.length)return empty("Este día todavía no tiene tareas.",'<button class="add-inline" data-action="modal" data-type="task-new">＋ Agregar tarea</button>');return `<div class="task-list">${[...tasks].sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99")).map(taskRow).join("")}</div><button class="add-inline" data-action="modal" data-type="task-new">＋ Agregar tarea</button>`}
function taskRow(t){return `<div class="task-row ${t.completed?"done":""}" data-task-id="${t.id}">
  <label class="task-status-control"><input class="task-checkbox" type="checkbox" data-task-check="${t.id}" ${t.completed?"checked":""} aria-label="Completar ${escape(t.title)}"><span>${t.completed?"Listo":"Pendiente"}</span></label>
  <span class="task-icon">${dataIcon(t.category||t.title,30)}</span><div class="task-title-wrap"><strong>${escape(t.title)}</strong><small>${escape(t.time||"Sin horario")}${t.time&&t.estimatedMinutes?" – "+timeEnd(t.time,t.estimatedMinutes):""}</small>${t.note?`<small>${escape(t.note)}</small>`:""}</div>
  <details class="task-menu"><summary aria-label="Opciones de ${escape(t.title)}">⋮</summary><div><button data-action="modal" data-type="task-edit" data-id="${t.id}">Editar</button><button data-action="task-repeat" data-id="${t.id}">Agregar a otros días</button>${t.date?`<button data-action="task-unassign" data-id="${t.id}">Quitar de este día</button>`:""}<button class="danger" data-action="task-delete" data-id="${t.id}">Eliminar esta tarea</button></div></details></div>`}
function pendingAge(createdAt){const diff=Math.max(0,Math.floor((parse(state.date)-parse(createdAt))/86400000));return diff===0?"Pendiente hoy":`Pendiente desde hace ${diff} día${diff===1?"":"s"}`}
function renderNonneg(ns){
 const row=n=>{const outcome=nonnegOutcome(n),label=outcome==="done"?"Cumplido":outcome==="missed"?"No cumplido":"Pendiente";return `<div class="metric-row"><span class="metric-icon">${dataIcon(n.icon||n.name,28)}</span><div class="metric-copy"><strong>${escape(n.name.replace(/\s*[—–-]\s*__ h/,""))}</strong><small>${["sleep","study"].includes(n.mode)?nonnegTarget(n)/60+" horas":escape(n.target||"Acuerdo personal")}</small></div><button class="outcome-control ${outcome}" data-action="nonneg-outcome" data-id="${n.id}" aria-label="Registrar resultado de ${escape(n.name)}"><b>${n.mode==="sleep"&&dayRecord().sleepRecorded?Number(dayRecord().sleepMinutes)/60+" h":outcome==="done"?"✓":outcome==="missed"?"×":"□"}</b><small>${n.mode==="sleep"?"Registrar horas":label}</small></button></div><div class="nonneg-reminder"><label><input type="checkbox" data-nonneg-notify="${n.id}" ${reminderFor(n).enabled?"checked":""}> Notifícame este día</label><input type="time" data-nonneg-time="${n.id}" value="${reminderFor(n).time}" aria-label="Hora de recordatorio de ${escape(n.name)}"></div>`};
 const training=plannedNonneg().filter(n=>n.mode==="training"),selected=ns.find(n=>n.mode==="training");
 return `<p class="note-helper">Solo ${escape(fmtDate(currentDate()))}. Elige ✓ cumplido o × no cumplido; sin registro sigue pendiente.</p><div class="nonneg-list">${ns.filter(n=>n.mode!=="training").map(row).join("")}${training.length?`<details class="training-nonneg" ${state.open.trainingNonneg?"open":""}><summary>${dataIcon("training",26)} Entrenamiento</summary><label class="field-label">Sesión de este día<select data-training-choice>${training.map(n=>`<option value="${n.id}" ${selected?.id===n.id?"selected":""}>Entrenamiento ${n.slot||1}</option>`).join("")}</select></label>${selected?row(selected):""}</details>`:""}</div>`;
}
function renderPriorities(d){const list=prioritiesFor(d);if(!list.length)return empty("Define hasta 3 prioridades que representen lo importante de la semana.",'<button class="add-inline" data-action="modal" data-type="priority-new">＋ Crear prioridad</button>');return `<div class="priority-list">${list.slice(0,3).map((p,i)=>{const pr=priorityProgress(p);return `<div class="priority-row"><div class="priority-number n${i+1}">${i+1}</div><div class="priority-copy"><strong>${escape(p.title)}</strong>${bar(pr,i===1?"green":"blue")}<small class="related-count">${p.taskIds?.length||0} tareas relacionadas</small></div><span>${pr}%</span><button class="text-action" data-action="modal" data-type="priority-edit" data-id="${p.id}">Editar</button><button class="row-action danger" data-action="priority-delete" data-id="${p.id}" aria-label="Eliminar prioridad">×</button></div>`}).join("")}</div>`}
function renderTodos(){const list=data.tasks.filter(t=>!t.date&&!t.completed);return list.length?`<div class="task-list compact">${list.map(taskRow).join("")}</div>`:empty("Tu bandeja de pendientes está limpia.",'<button class="add-inline" data-action="modal" data-type="task-new" data-no-date="true">＋ Agregar pendiente</button>')}
function renderHabits(w){return data.habits.length?`<div class="weekly-records">${data.habits.map(h=>`<article class="weekly-record"><div class="weekly-record-heading">${dataIcon(h.name,30)}<strong>${escape(h.name)}</strong><b>${habitWeekPctFor(h,w)}%</b><button class="text-action" data-action="modal" data-type="habit-edit" data-id="${h.id}">Editar</button><button class="row-action danger" data-action="habit-delete" data-id="${h.id}" aria-label="Eliminar ${escape(h.name)}">×</button></div><small>${escape(h.target||"")}</small><div class="weekly-checks">${w.map((d,i)=>{const k=key(d);return `<label><span>${DAY_KEYS[i]}</span><input type="checkbox" data-habit-check="${h.id}" data-date="${k}" ${habitDone(h,k)?"checked":""} ${habitScheduled(h,d)?"":"disabled"} aria-label="${escape(h.name)} · ${escape(fmtDate(d))}"></label>`}).join("")}</div></article>`).join("")}</div>`:empty("Aún no tienes hábitos adicionales.");}
function renderTraining(w){const list=data.training.filter(t=>w.some(d=>key(d)===t.date));if(!list.length)return empty("No hay entrenamientos registrados para este día.",'<button class="add-inline" data-action="modal" data-type="training-new">＋ Añadir entrenamiento</button>');return `<div class="training-list">${[...list].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>`<div class="training-row"><button class="tiny-check ${t.completed?"checked":""}" data-action="training-toggle" data-id="${t.id}">${t.completed?"✓":""}</button><div><strong>${escape(t.title)}</strong><small>${escape(fmtShortDate(parse(t.date)))} · ${escape(t.time||"—")} · ${Number(t.durationMinutes||0)} min · ${escape(t.type||"General")}${t.perception?" · "+escape(t.perception):""}</small></div><button class="text-action" data-action="modal" data-type="training-edit" data-id="${t.id}">Editar</button></div>`).join("")}</div>`}
function renderRing(c,done,total,hd,ht){return `<div class="card mini-card summary-ring"><div class="mini-head"><strong>Cumplimiento del día</strong><span>${c}%</span></div><div class="ring" style="--value:${c*3.6}deg"><span>${c}%</span></div><div class="ring-note">Tareas ${done}/${total} · Hábitos ${hd}/${ht}</div></div>`}
function renderMinimal(m){return `<div class="minimal-list">${[["study","30 min de estudio"],["water","Agua"],["training","Entrenamiento"],["sleep","Dormir antes de 00:00"]].map(([k,l])=>`<button class="minimal-row" data-action="minimal-toggle" data-key="${k}"><span class="task-check ${m?.[k]?"checked":""}">${m?.[k]?"✓":""}</span>${l}</button>`).join("")}</div><div class="support-note">♡ Hoy no necesitas hacerlo todo.<br>Cumple lo esencial.</div>`}
function renderDailyBalance(r){return `<label class="field-label">Lo que logré<textarea data-reflection="achieved" placeholder="¿Qué salió bien hoy?">${escape(r.reflection?.achieved||"")}</textarea></label><label class="field-label">Qué voy a mejorar<textarea data-reflection="improve" placeholder="Una mejora concreta para mañana...">${escape(r.reflection?.improve||"")}</textarea></label><label class="field-label">Notas<textarea data-reflection="notes" placeholder="Ideas, observaciones o recordatorios">${escape(r.reflection?.notes||"")}</textarea></label>`}
function noteSummary(r){const text=String(r?.reflection?.notes||r?.reflection?.achieved||r?.reflection?.improve||"").trim();return text.split(/\s+/).slice(0,7).join(" ")+(text.split(/\s+/).length>7?"…":"")||"Sin texto registrado"}
function renderDailyNotes(r){return `<div class="day-note-editor"><p class="note-helper">Solo para ${escape(fmtDate(currentDate()))}. No modifica el balance semanal.</p><label class="field-label">Título<input data-reflection="title" value="${escape(r.reflection?.title||"")}" placeholder="Mi reflexión del día"></label><label class="field-label">Nota / reflexión<textarea data-reflection="notes" placeholder="¿Qué salió bien? ¿Qué aprendí?">${escape(r.reflection?.notes||"")}</textarea></label><details><summary>Logros y mejoras del día</summary><label class="field-label">Lo que logré<textarea data-reflection="achieved">${escape(r.reflection?.achieved||"")}</textarea></label><label class="field-label">Qué puedo mejorar<textarea data-reflection="improve">${escape(r.reflection?.improve||"")}</textarea></label></details></div>`}
function renderWeek(){const w=week(currentDate()),tasks=weekTasks(currentDate()),done=tasks.filter(t=>t.completed).length,study=w.reduce((s,d)=>s+Number(data.days[key(d)]?.studyMinutes||0),0),planned=weekPlannedCount(currentDate());return `<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">SEMANA ${weekNumber(currentDate())}</span><h1>${escape(weekLabel(currentDate()))}</h1><p>Representa lo planificado y lo realmente ejecutado.</p></div><button class="primary-btn" data-action="view" data-view="planning">Abrir planificación</button></div><div class="week-summary-grid">${metricCard("Días planificados",planned+" / 7",pct(planned,7))}${metricCard("Cumplimiento real",weekCompletion(currentDate())+"%",weekCompletion(currentDate()))}${metricCard("Tareas",done+" / "+tasks.length,pct(done,tasks.length))}${metricCard("Entrenamientos",trainingWeekCount(w)+" / 4",pct(trainingWeekCount(w),4),"green")}</div><div class="week-day-grid">${w.map(daySummary).join("")}</div><div class="two-col">${renderWeekDetails(w)}<section class="card detail-panel"><h2>Balance de la semana</h2>${renderWeeklyBalance(weekRecord())}</section></div></div>`}
function metricCard(title,value,p,tone="blue"){return `<div class="card metric-card"><span>${escape(title)}</span><strong>${escape(value)}</strong>${bar(p,tone)}</div>`}
function renderWeekDetails(w){const ts=weekTasks(currentDate()),done=ts.filter(t=>t.completed).length,planned=w.filter(d=>dayHasPlan(key(d))).length,nsTotal=w.reduce((s,d)=>s+activeNonneg(key(d)).length,0),nsDone=w.reduce((s,d)=>s+activeNonneg(key(d)).filter(n=>nonnegDone(n,key(d))).length,0),study=w.reduce((s,d)=>s+Number(data.days[key(d)]?.studyMinutes||0),0),sl=w.map(d=>Number(data.days[key(d)]?.sleepMinutes||0)).filter(v=>v>0);return `<section class="card detail-panel"><div class="panel-heading"><div><h3>Resumen de la semana</h3><small>Solo se evalúan los días planificados.</small></div></div><div class="stats-table"><div><span>Días planificados</span><b>${planned} / 7</b></div><div><span>Tareas completadas</span><b>${done} / ${ts.length}</b></div><div><span>No negociables</span><b>${nsDone} / ${nsTotal}</b></div><div><span>Hábitos</span><b>${habitWeekPct(w)}%</b></div><div><span>Entrenamientos</span><b>${trainingWeekCount(w)} / 4</b></div><div><span>Estudio</span><b>${fmtHours(study)}</b></div><div><span>Sueño promedio</span><b>${sl.length?fmtMin(Math.round(avg(sl))):"—"}</b></div></div></section>`}
function renderMonth(){const a=parse(state.month),cells=monthGrid(a),days=cells.filter(d=>d.getMonth()===a.getMonth()),scores=days.filter(d=>dayHasPlan(key(d))).map(d=>dayCompletion(key(d))),mc=scores.length?Math.round(avg(scores)):0,ts=days.flatMap(tasksFor),tp=pct(ts.filter(t=>t.completed).length,ts.length),tr=data.training.filter(t=>t.completed&&t.date.startsWith(state.month.slice(0,7))).length;return `<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">MES</span><h1>${cap(fmtMonth(a))}</h1><p>Selecciona un día para entrar a su planificación.</p></div><div class="month-nav"><button class="outline-btn" data-action="month-nav" data-delta="-1">←</button><button class="outline-btn" data-action="month-nav" data-delta="1">→</button></div></div><div class="month-month-summary"><div><span>Cumplimiento medio</span><b>${scores.length?mc+"%":"—"}</b></div><div><span>Tareas</span><b>${ts.length?tp+"%":"—"}</b></div><div><span>Entrenamientos</span><b>${tr}</b></div><div><span>Hábitos</span><b>${monthlyHabitPct(a)}%</b></div></div><section class="card month-card"><div class="calendar-week-head">${DAY_KEYS.map(x=>`<span>${x}</span>`).join("")}</div><div class="calendar-grid">${cells.map(d=>{const k=key(d),inside=d.getMonth()===a.getMonth(),t=tasksFor(k),planned=dayHasPlan(k),c=planned?dayCompletion(k):null,h=data.habits.some(x=>habitDone(x,k)),x=data.training.some(z=>z.date===k&&z.completed);return `<button class="calendar-day ${inside?"":"muted"} ${k===state.date?"selected":""}" data-action="go-date" data-date="${k}"><span class="calendar-num">${d.getDate()}</span><span class="calendar-score">${c===null?"—":c+"%"}</span><div class="calendar-meta"><i class="task ${t.some(z=>z.completed)?"on":""}"></i><i class="habit ${h?"on":""}"></i><i class="train ${x?"on":""}"></i></div><small>${t.filter(z=>z.completed).length}/${t.length}</small></button>`}).join("")}</div></section></div>`}
function monthlyHabitPct(a){const ds=monthGrid(a).filter(d=>d.getMonth()===a.getMonth());let total=0,done=0;for(const h of data.habits)for(const d of ds)if(habitScheduled(h,d)){total++;if(habitDone(h,key(d)))done++;}return pct(done,total)}
function toggleNonnegForDate(n,date){
  const k=key(parse(date));
  if(n.mode==="water")return setData(d=>{const r=ensureDay(d,k);r.waterLiters=nonnegDone(n,k)?0:d.settings.waterGoal;return d;});
  if(n.mode==="study")return setData(d=>{const r=ensureDay(d,k);r.studyMinutes=nonnegDone(n,k)?0:d.settings.studyGoalMinutes;return d;});
  if(n.mode==="sleep")return setData(d=>{const r=ensureDay(d,k);r.sleepMinutes=nonnegDone(n,k)?0:d.settings.sleepGoalMinutes;return d;});
  if(n.mode==="training"){const slot=Number(n.slot)||1;const ex=data.training.find(t=>t.date===k&&Number(t.slot)===slot);if(ex)return setData(d=>({...d,training:d.training.map(t=>t.id===ex.id?{...t,completed:!t.completed}:t)}));return setData(d=>({...d,training:[...d.training,{id:id("training"),title:"Entrenamiento "+slot,slot,date:k,time:"19:00",durationMinutes:60,type:"General",completed:true}]}));}
  return setData(d=>({...d,nonNegotiables:d.nonNegotiables.map(x=>x.id===n.id?{...x,checks:{...(x.checks||{}),[k]:!nonnegDone(n,k)}}:x)}));
}
function renderGoals(){return `<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">METAS</span><h1>Metas a largo plazo</h1><p>Meta → prioridad → tarea → completado.</p></div><button class="primary-btn" data-action="modal" data-type="goal-new">＋ Añadir meta</button></div>${data.goals.length?`<div class="goal-grid">${data.goals.map(g=>{const p=goalProgress(g);return `<div class="card goal-card"><div class="goal-icon">${dataIcon(g.icon||g.title,28)}</div><div class="goal-copy"><small>${escape(g.category||"Personal")}</small><h3>${escape(g.title)}</h3>${bar(p,p>=80?"green":"blue")}${g.description?`<p>${escape(g.description)}</p>`:""}${g.targetDate?`<small>Fecha objetivo: ${escape(fmtShortDate(parse(g.targetDate)))}</small>`:""}${(g.milestones||[]).length?`<div class="goal-milestones">${g.milestones.map((m,i)=>`<label><input type="checkbox" data-goal-milestone="${g.id}" data-index="${i}" ${m.completed?"checked":""}> ${escape(typeof m==="string"?m:m.title)}</label>`).join("")}</div>`:""}</div><strong>${p}%</strong><div class="goal-links"><span>${g.priorityIds?.length||0} prioridades</span><span>${data.tasks.filter(t=>(g.taskIds||[]).includes(t.id)||t.goalId===g.id).length} tareas</span><span>${g.habitIds?.length||0} hábitos</span><button class="text-action" data-action="modal" data-type="goal-edit" data-id="${g.id}">Editar</button><button class="row-action danger" data-action="goal-delete" data-id="${g.id}">×</button></div></div>`}).join("")}</div>`:empty("Todavía no tienes metas.",'<button class="add-inline" data-action="modal" data-type="goal-new">＋ Crear meta</button>')}<div class="card chain-card"><h3>La cadena que importa</h3><div class="chain"><span>META</span><b>↓</b><span>PRIORIDAD</span><b>↓</b><span>TAREA</span><b>↓</b><span>COMPLETADO</span></div></div></div>`}
function weekMetric(w,l){if(l==="Cumplimiento")return weekCompletion(w[3]);if(l==="Hábitos")return habitWeekPct(w);if(l==="Entrenamiento")return pct(data.training.filter(t=>t.completed&&w.some(d=>key(d)===t.date)).length,4);const rs=w.map(d=>data.days[key(d)]).filter(Boolean);if(l==="Estudio")return pct(rs.reduce((s,r)=>s+Number(r.studyMinutes||0),0),data.settings.studyGoalMinutes*7);if(l==="Sueño"){const v=rs.map(r=>Number(r.sleepMinutes||0)).filter(x=>x>0);return pct(v.length?avg(v):0,data.settings.sleepGoalMinutes)}if(l==="Pasos"){const v=rs.map(r=>Number(r.steps||0)).filter(x=>x>0);return pct(v.length?avg(v):0,data.settings.stepsGoal)}const v=rs.map(r=>Number(r.weight||0)).filter(x=>x>0);return v.length?avg(v):0}
function trendCard(l,ws){const vals=ws.map(w=>weekMetric(w,l)),latest=vals[vals.length-1]||0;return `<div class="card trend-card"><div class="trend-top"><div><small>${l}</small><strong>${l==="Peso"?(latest?latest.toFixed(1)+" kg":"—"):Math.round(latest)+"%"}</strong></div><span>4 semanas</span></div><div class="sparkline"><svg viewBox="0 0 220 70"><polyline points="${spark(vals)}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="trend-note">Basado únicamente en registros guardados.</div></div>`}
function spark(v){if(v.length<2)return"0,54 220,54";const min=Math.min(...v),max=Math.max(...v),span=max-min||1;return v.map((x,i)=>(i/(v.length-1))*220+","+(58-((x-min)/span)*46)).join(" ")}
function renderSettings(){const n="Notification"in window,sw="serviceWorker"in navigator,secure=location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1";return `<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">CONFIGURACIÓN</span><h1>Configura lo necesario</h1><p>Datos locales, PWA, notificaciones y sincronización.</p></div></div><div class="settings-grid"><div class="card"><h3>Objetivos</h3><label class="field-label">Agua (L)<input type="number" min="0" step="0.1" value="${data.settings.waterGoal}" data-setting="waterGoal"></label><label class="field-label">Estudio (min)<input type="number" min="0" step="5" value="${data.settings.studyGoalMinutes}" data-setting="studyGoalMinutes"></label><label class="field-label">Sueño objetivo (min)<input type="number" min="0" step="10" value="${data.settings.sleepGoalMinutes}" data-setting="sleepGoalMinutes"></label><label class="field-label">Pasos objetivo<input type="number" min="0" step="500" value="${data.settings.stepsGoal}" data-setting="stepsGoal"></label><label class="field-label">RECUERDA POR QUÉ LO HACES<textarea data-setting-text="reasonWhy" placeholder="El motivo que quieres tener presente.">${escape(data.settings.reasonWhy||"")}</textarea></label></div><div class="card"><h3>Notificaciones</h3><p class="settings-copy">Permiso del dispositivo: ${n?Notification.permission:"no disponible"}<br>Service Worker: ${sw?"disponible":"no disponible"}<br>Entorno seguro: ${secure?"sí":"no"}</p><div class="settings-actions"><button class="primary-btn" data-action="notification-enable">${data.notifications.enabled?"Permiso activado":"Activar notificaciones"}</button><button class="outline-btn" data-action="notification-test">Probar</button></div><label class="minimal-row"><input type="checkbox" data-setting-notification="enabled" ${data.notifications.enabled?"checked":""}> Recordatorios activados en este dispositivo</label><label class="field-label">Avisar antes (min)<input type="number" min="0" max="120" step="5" value="${data.notifications.leadMinutes}" data-setting-notification="leadMinutes"></label><label class="minimal-row"><input type="checkbox" data-setting-notification="overdue" ${data.notifications.overdue?"checked":""}> Avisar por tareas vencidas</label><div class="support-note">Se muestran en este dispositivo con permiso y la app activa. Tareas: selecciona Notificar al editar. No negociables (incluida creatina): define días y hora en Planificar semana. Con la app cerrada o suspendida NO hay entrega garantizada: falta configurar un servidor push.</div></div><div class="card"><h3>PWA</h3><p class="settings-copy">Manifest, iconos, service worker, instalación y caché offline están incluidos.</p><button class="outline-btn" data-action="install-pwa">${state.deferredInstallPrompt?"Instalar PLAN 2.0":"Instalar / añadir a inicio"}</button><div class="support-note">En Android usa “Instalar app” o “Añadir a pantalla de inicio”.</div></div><div class="card"><h3>Sincronización</h3><p class="settings-copy">Entre pestañas: ${"BroadcastChannel"in window?"activa":"no disponible"}. Para distintos dispositivos puedes configurar un endpoint REST.</p><label class="minimal-row"><input type="checkbox" data-sync-setting="enabled" ${data.sync.enabled?"checked":""}> Activar sincronización remota</label><label class="field-label">Endpoint REST<input type="url" placeholder="https://tu-servidor.example/sync" value="${escape(data.sync.endpoint||"")}" data-sync-setting="endpoint"></label><label class="field-label">Token<input type="password" value="${escape(data.sync.token||"")}" data-sync-setting="token"></label><div class="settings-actions"><button class="outline-btn" data-action="sync-now">Sincronizar ahora</button><button class="outline-btn" data-action="export">Exportar respaldo</button><label class="outline-btn file-button">Importar respaldo<input type="file" accept="application/json" data-action="import"></label></div><small class="settings-copy">Última sincronización: ${escape(data.sync.lastSync||"nunca")}</small></div><div class="card"><h3>Datos</h3><p class="settings-copy">La versión comienza vacía y usa una clave v2, separada de la antigua demo.</p><button class="outline-btn" data-action="reset">Restaurar PLAN 2.0 vacío</button></div></div></div>`}
function findItem(type,itemId){const map={task:data.tasks,habit:data.habits,priority:data.priorities,training:data.training,goal:data.goals,nonneg:data.nonNegotiables};const e=Object.entries(map).find(([k])=>type.startsWith(k));return e?.[1].find(x=>x.id===itemId)||null}
function renderModal(){
  if(state.modal.type==="nonneg-outcome")return renderOutcomeModal();
  if(state.modal.type==="task-repeat")return renderRepeatModal();
  const m=state.modal,t=m.type,item=findItem(t,m.id),task=t.startsWith("task"),habit=t.startsWith("habit"),priority=t.startsWith("priority"),training=t.startsWith("training"),goal=t.startsWith("goal"),non=t.startsWith("nonneg");
  let title=task?(m.id?"Editar tarea":"Nueva tarea"):habit?(m.id?"Editar hábito":"Nuevo hábito"):priority?(m.id?"Editar prioridad":"Nueva prioridad"):training?(m.id?"Editar entrenamiento":"Nuevo entrenamiento"):goal?(m.id?"Editar meta":"Nueva meta"):(m.id?"Editar no negociable":"Nuevo no negociable"),body="";
  if(task){
    body=`<label class="field-label">Título<input data-form="title" value="${escape(item?.title||"")}" autofocus></label><div class="form-grid"><label class="field-label">Fecha<input type="date" data-form="date" value="${escape(item?.date||m.plannedDate||state.date)}"></label><label class="field-label">Hora<input type="time" data-form="time" value="${escape(item?.time||"")}"></label></div><label class="minimal-row"><input type="checkbox" data-form="noDate" ${(m.noDate||(m.id&&!item?.date))?"checked":""}> Guardar sin fecha (pendiente)</label><div class="form-grid"><label class="field-label">Prioridad<select data-form="priority"><option value="alta" ${item?.priority==="alta"?"selected":""}>Alta</option><option value="media" ${!item?.priority||item?.priority==="media"?"selected":""}>Media</option><option value="baja" ${item?.priority==="baja"?"selected":""}>Baja</option></select></label><label class="field-label">Duración (min)<input type="number" min="0" step="5" data-form="estimatedMinutes" value="${item?.estimatedMinutes||60}"></label></div><label class="field-label">Prioridad semanal<select data-form="priorityId"><option value="">— Ninguna —</option>${prioritiesFor(currentDate()).map(p=>`<option value="${p.id}" ${item?.priorityId===p.id?"selected":""}>${escape(p.title)}</option>`).join("")}</select></label><label class="field-label">Meta relacionada<select data-form="goalId"><option value="">— Ninguna —</option>${data.goals.map(g=>`<option value="${g.id}" ${item?.goalId===g.id?"selected":""}>${escape(g.title)}</option>`).join("")}</select></label><label class="field-label">Nota<textarea data-form="note">${escape(item?.note||"")}</textarea></label>`;
    body=body.replace('<label class="field-label">Prioridad semanal', '<label class="field-label">Categoría<input data-form="category" value="'+escape(item?.category||"")+'" placeholder="Mis tareas, estudio, entrenamiento..."></label><label class="field-label">Prioridad semanal');
    body+=`<label class="minimal-row"><input type="checkbox" data-form="notify" ${item?.notify?"checked":""}> Notificar esta tarea</label><label class="field-label">Hora del recordatorio<input type="time" data-form="reminderTime" value="${escape(item?.reminderTime||item?.time||"09:00")}"></label>${item?`<label class="minimal-row"><input type="checkbox" data-form="notifyAll"> Aplicar esta preferencia a todas las copias de esta tarea en la semana</label>`:""}<p class="note-helper">Las copias en otros días heredan esta preferencia. Con la app cerrada aún no hay envío push configurado.</p>`;
  }else if(habit){
    const days=item?.daysOfWeek||DAY_NUMS;
    body=`<label class="field-label">Nombre<input data-form="name" value="${escape(item?.name||"")}" autofocus></label><label class="field-label">Objetivo<input data-form="target" value="${escape(item?.target||"")}" placeholder="Ej. 20 min"></label><label class="field-label">Frecuencia<select data-form="frequency"><option value="daily" ${item?.frequency!=="weekly"?"selected":""}>Diaria</option><option value="weekly" ${item?.frequency==="weekly"?"selected":""}>Semanal</option></select></label><div class="field-label">Días activos<div class="weekday-picks">${DAY_NUMS.map((n,i)=>`<label><input type="checkbox" data-habit-day="${n}" ${days.includes(n)?"checked":""}> ${DAY_KEYS[i]}</label>`).join("")}</div></div>`;
  }else if(priority){
    const tids=item?.taskIds||[];
    body=`<label class="field-label">Prioridad<input data-form="title" value="${escape(item?.title||"")}" autofocus></label><label class="field-label">Progreso base <span id="range-output">${item?.progress||0}%</span><input type="range" min="0" max="100" value="${item?.progress||0}" data-form="progress" data-range-output="range-output"></label><div class="field-label">Tareas relacionadas de esta semana<div class="checklist-picks">${weekTasks(currentDate()).map(x=>`<label><input type="checkbox" data-priority-task="${x.id}" ${tids.includes(x.id)?"checked":""}> ${escape(x.title)} <small>${escape(x.date||"Sin fecha")}</small></label>`).join("")}</div></div>`;
  }else if(training){
    body=`<label class="field-label">Nombre<input data-form="title" value="${escape(item?.title||"")}" autofocus></label><div class="form-grid"><label class="field-label">Fecha<input type="date" data-form="date" value="${escape(item?.date||state.date)}"></label><label class="field-label">Hora<input type="time" data-form="time" value="${escape(item?.time||"19:00")}"></label></div><div class="form-grid"><label class="field-label">Duración (min)<input type="number" min="0" data-form="durationMinutes" value="${item?.durationMinutes||60}"></label><label class="field-label">Tipo<input data-form="type" value="${escape(item?.type||"Fuerza")}"></label></div><label class="field-label">Percepción general<input data-form="perception" value="${escape(item?.perception||"")}" placeholder="Ej. Bien, cansado, fácil..."></label><label class="minimal-row"><input type="checkbox" data-form="completed" ${item?.completed?"checked":""}> Marcar como completado</label><label class="field-label">Notas<textarea data-form="note">${escape(item?.note||"")}</textarea></label>`;
  }else if(goal){
    const pids=item?.priorityIds||[],tids=[...new Set([...(item?.taskIds||[]),...data.tasks.filter(x=>item&&x.goalId===item.id).map(x=>x.id)])],hids=item?.habitIds||[];
    body=`<div class="form-grid"><label class="field-label">Icono<select data-form="icon">${iconOptions(item?.icon,"target")}</select></label><label class="field-label">Categoría<input data-form="category" value="${escape(item?.category||"Personal")}"></label></div><label class="field-label">Meta<input data-form="title" value="${escape(item?.title||"")}" autofocus></label><label class="field-label">Progreso base <span id="range-output">${item?.progress||0}%</span><input type="range" min="0" max="100" value="${item?.progress||0}" data-form="progress" data-range-output="range-output"></label><label class="field-label">Fecha objetivo<input type="date" data-form="targetDate" value="${escape(item?.targetDate||"")}"></label><div class="field-label">Prioridades relacionadas<div class="checklist-picks">${prioritiesFor(currentDate()).map(p=>`<label><input type="checkbox" data-goal-priority="${p.id}" ${pids.includes(p.id)?"checked":""}> ${escape(p.title)}</label>`).join("")}</div></div><div class="field-label">Tareas relacionadas<div class="checklist-picks">${data.tasks.filter(x=>x.date).map(x=>`<label><input type="checkbox" data-goal-task="${x.id}" ${tids.includes(x.id)?"checked":""}> ${escape(x.title)}</label>`).join("")}</div></div><div class="field-label">Hábitos relacionados<div class="checklist-picks">${data.habits.map(h=>`<label><input type="checkbox" data-goal-habit="${h.id}" ${hids.includes(h.id)?"checked":""}> ${escape(h.name)}</label>`).join("")}</div></div>`;
    body+=`<label class="field-label">Descripción<textarea data-form="description">${escape(item?.description||"")}</textarea></label><label class="field-label">Hitos (uno por línea)<textarea data-form="milestones">${escape((item?.milestones||[]).map(x=>typeof x==="string"?x:x.title||"").join("\n"))}</textarea></label>`;
  }else if(non){
    const plan=item?data.weekly[currentWeekStart()]?.nonnegPlans?.[item.id]||{}:{};const days=plan.days||item?.days||DAY_NUMS;
    body=`<div class="form-grid"><label class="field-label">Icono<select data-form="icon">${iconOptions(item?.icon,"check")}</select></label><label class="field-label">Objetivo<input data-form="target" value="${escape(item?.target||"Diario")}"></label></div><label class="field-label">Nombre<input data-form="name" value="${escape(item?.name||"")}" autofocus></label><div class="form-grid"><label class="field-label">Qué mide<select data-form="mode"><option value="manual" ${!item?.mode||item?.mode==="manual"?"selected":""}>Marcación manual</option><option value="water" ${item?.mode==="water"?"selected":""}>Agua</option><option value="study" ${item?.mode==="study"?"selected":""}>Estudio</option><option value="sleep" ${item?.mode==="sleep"?"selected":""}>Sueño</option><option value="training" ${item?.mode==="training"?"selected":""}>Entrenamiento</option></select></label><label class="minimal-row"><input type="checkbox" data-form="active" ${item?.active!==false?"checked":""}> Activo</label></div><label class="field-label">ENTRENAMIENTO<select data-form="slot"><option value="1" ${Number(item?.slot||1)===1?"selected":""}>1</option><option value="2" ${Number(item?.slot)===2?"selected":""}>2</option><option value="3" ${Number(item?.slot)===3?"selected":""}>3</option><option value="4" ${Number(item?.slot)===4?"selected":""}>4</option></select></label><div class="field-label">Días activos<div class="weekday-picks">${DAY_NUMS.map((n,i)=>`<label><input type="checkbox" data-nonneg-day="${n}" ${days.includes(n)?"checked":""}> ${DAY_KEYS[i]}</label>`).join("")}</div></div>`;
    body+=`<label class="field-label">Objetivo en horas (estudio / sueño)<input type="number" min="0" max="24" step="0.25" data-form="targetHours" value="${plan.targetHours??item?.targetHours??(item?.mode==="sleep"?data.settings.sleepGoalMinutes:data.settings.studyGoalMinutes)/60}"></label><label class="minimal-row"><input type="checkbox" data-form="notify" ${(plan.notify??item?.notify??true)?"checked":""}> Recordar si sigue pendiente</label><label class="field-label">Hora del recordatorio<input type="time" data-form="reminderTime" value="${escape(plan.reminderTime||item?.reminderTime||"20:00")}"></label><p class="note-helper">Días, horas y recordatorios se aplican a esta semana: ${escape(weekLabel(currentDate()))}. Guarda y activa los permisos en Configura.</p>`;
  }
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal card" data-modal-inner><div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-action="close-modal">×</button></div>${body}<div class="modal-actions"><button class="outline-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" data-action="modal-save">Guardar</button></div></div></div>`;
}
function modalForm(){const q={};document.querySelectorAll("[data-form]").forEach(el=>q[el.dataset.form]=el.type==="checkbox"?el.checked:el.value);return q}
function saveModal(){
  const m=state.modal,t=m.type,f=modalForm(),itemId=m.id;
  let savedTaskId=itemId||null,savedTaskDate=null,savedTrainingDate=null;
  if(t==="task-new"||t==="task-edit"){
    const noDate=!!f.noDate,title=String(f.title||"").trim();if(!title){toast("Escribe un título para la tarea.");return}
    const obj={title,date:noDate?"":(f.date||m.plannedDate||state.date),time:f.time||"",priority:f.priority||"media",note:f.note||"",estimatedMinutes:Math.max(0,Number(f.estimatedMinutes)||0),priorityId:f.priorityId||"",goalId:f.goalId||"",category:String(f.category||"Mis tareas").trim()||"Mis tareas",notify:!!f.notify,reminderTime:f.reminderTime||f.time||"09:00"};
    savedTaskId=itemId||id("task");savedTaskDate=obj.date||null;
    data={...data,tasks:itemId?data.tasks.map(x=>x.id===itemId?{...x,...obj}:x):[...data.tasks,{id:savedTaskId,completed:false,createdAt:todayKey(),...obj}]};
    if(itemId&&f.notifyAll){const source=data.tasks.find(x=>x.id===itemId),root=source.sourceId||source.id;data.tasks=data.tasks.map(x=>(x.id===root||x.sourceId===root)&&x.date&&source.date&&weekKey(x.date)===weekKey(source.date)?{...x,notify:obj.notify,reminderTime:obj.reminderTime}:x);}
  }else if(t==="habit-new"||t==="habit-edit"){
    const ds=[...document.querySelectorAll("[data-habit-day]:checked")].map(x=>Number(x.dataset.habitDay)),obj={name:(f.name||"").trim()||"Hábito",target:f.target||"",frequency:f.frequency||"daily",daysOfWeek:ds.length?ds:DAY_NUMS,logs:itemId?(findItem(t,itemId)?.logs||{}):{}};
    data={...data,habits:itemId?data.habits.map(x=>x.id===itemId?{...x,...obj}:x):[...data.habits,{id:id("habit"),...obj}]};
  }else if(t==="priority-new"||t==="priority-edit"){
    const taskIds=[...document.querySelectorAll("[data-priority-task]:checked")].map(x=>x.dataset.priorityTask),old=findItem(t,itemId),list=prioritiesFor(currentDate());
    if(!itemId&&list.length>=3){state.modal=null;toast("Esta semana ya tiene 3 prioridades.");render();return}
    const priorityId=itemId||id("priority"),weekStart=old?.weekStart||currentWeekStart(),obj={id:priorityId,title:(f.title||"").trim()||"Prioridad",progress:Number(f.progress)||0,taskIds,weekStart};
    let tasks=data.tasks.map(task=>{
      if(taskIds.includes(task.id))return {...task,priorityId};
      if(itemId&&task.priorityId===itemId)return {...task,priorityId:""};
      return task;
    });
    let priorities=itemId?data.priorities.map(x=>x.id===itemId?obj:x):[...data.priorities,obj];
    priorities=priorities.map(p=>p.id===priorityId?p:{...p,taskIds:(p.taskIds||[]).filter(id=>!taskIds.includes(id)||p.id===priorityId)});
    data={...data,tasks,priorities};
  }else if(t==="training-new"||t==="training-edit"){
    const slot=Number(f.slot)||1,obj={title:(f.title||"").trim()||("Entrenamiento "+slot),slot,date:f.date||state.date,time:f.time||"19:00",durationMinutes:Number(f.durationMinutes)||60,type:f.type||"General",perception:f.perception||"",completed:!!f.completed,note:f.note||""};
    savedTrainingDate=obj.date;
    data={...data,training:itemId?data.training.map(x=>x.id===itemId?{...x,...obj}:x):[...data.training,{id:id("training"),...obj}]};
  }else if(t==="goal-new"||t==="goal-edit"){
    const priorityIds=[...document.querySelectorAll("[data-goal-priority]:checked")].map(x=>x.dataset.goalPriority),taskIds=[...document.querySelectorAll("[data-goal-task]:checked")].map(x=>x.dataset.goalTask),habitIds=[...document.querySelectorAll("[data-goal-habit]:checked")].map(x=>x.dataset.goalHabit),obj={title:(f.title||"").trim()||"Nueva meta",icon:iconToken(f.icon,"target"),category:f.category||"Personal",progress:Number(f.progress)||0,targetDate:f.targetDate||"",description:f.description||"",milestones:String(f.milestones||"").split("\n").map(x=>x.trim()).filter(Boolean).map(title=>{const previous=findItem(t,itemId)?.milestones?.find(x=>x.title===title);return previous||{id:id("milestone"),title,completed:false}}),priorityIds,taskIds,habitIds};
    data={...data,goals:itemId?data.goals.map(x=>x.id===itemId?{...x,...obj}:x):[...data.goals,{id:id("goal"),...obj}]};
  }else if(t==="nonneg-new"||t==="nonneg-edit"){
    const ds=[...document.querySelectorAll("[data-nonneg-day]:checked")].map(x=>Number(x.dataset.nonnegDay)),old=findItem(t,itemId),obj={name:(f.name||"").trim()||"Nuevo acuerdo",icon:iconToken(f.icon,"check"),target:f.target||"Diario",mode:f.mode||"manual",slot:f.mode==="training"?(Number(f.slot)||1):undefined,active:!!f.active,days:old?.days||ds,checks:old?.checks||{}};
    data={...data,nonNegotiables:itemId?data.nonNegotiables.map(x=>x.id===itemId?{...x,...obj}:x):[...data.nonNegotiables,{id:id("nonneg"),...obj}]};
    const savedId=itemId||data.nonNegotiables.at(-1).id;
    const wr=ensureWeek(data,currentWeekStart());wr.nonnegPlans={...wr.nonnegPlans,[savedId]:{days:ds,targetHours:Math.max(0,Math.min(24,Number(f.targetHours)||0)),notify:!!f.notify,reminderTime:f.reminderTime||"20:00"}};
  }
  if(t==="goal-edit"||t==="goal-new"){const g=itemId?data.goals.find(x=>x.id===itemId):data.goals.at(-1);for(const task of data.tasks){if(g.taskIds.includes(task.id))task.goalId=g.id;else if(task.goalId===g.id)task.goalId="";}}
  repairPriorityRelations();
  if(savedTaskDate){const w=ensureWeek(data,weekKey(savedTaskDate));w.plannedDays[savedTaskDate]=true;}
  if(savedTrainingDate){const w=ensureWeek(data,weekKey(savedTrainingDate));w.plannedDays[savedTrainingDate]=true;}
  data=save(data);
  state.modal=null;
  render();
  toast("Guardado");
}
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]");if(!el)return;const a=el.dataset.action;
  if(a==="picker-open"){state.date=el.dataset.date;state.page="plan";state.view="picker";state.pickerIds=[];render();return}
  if(a==="picker-add"){const selected=new Set(state.pickerIds||[]);setData(d=>{const additions=d.tasks.filter(t=>selected.has(t.id)).map(t=>({...t,id:id("task"),sourceId:t.sourceId||t.id,date:state.date,completed:false,createdAt:todayKey(),priorityId:t.date&&weekKey(t.date)===weekKey(state.date)?t.priorityId:""}));d.tasks.push(...additions);if(additions.length)ensureWeek(d,weekKey(state.date)).plannedDays[state.date]=true;return d});state.pickerIds=[];state.view="day";render();return}
  if(a==="task-repeat"){state.modal={type:"task-repeat",id:el.dataset.id};render();return}
  if(a==="repeat-save"){try{saveRepeatTasks()}catch{toast("No se pudo guardar. Exporta un respaldo antes de continuar.");}return}
  if(a==="repeat-rest"){const task=data.tasks.find(x=>x.id===state.modal.id),base=task?.date||state.date;document.querySelectorAll("[data-repeat-date]").forEach(x=>x.checked=x.dataset.repeatDate>base);return}
  if(a==="task-unassign"){setData(d=>({...d,tasks:d.tasks.map(t=>t.id===el.dataset.id?{...t,date:"",priorityId:""}:t)}));return}
  if(a==="nonneg-outcome"){state.modal={type:"nonneg-outcome",id:el.dataset.id,date:el.dataset.date||state.date};render();return}
  if(a==="sleep-hours-save"){const value=Number(document.querySelector("[data-sleep-hours]").value),date=state.modal.date||state.date,n=data.nonNegotiables.find(x=>x.id===state.modal.id);if(!Number.isFinite(value)||value<0||value>24)return;setData(d=>{const r=ensureDay(d,date);r.sleepMinutes=value*60;r.sleepRecorded=true;if(n?.outcomes)delete n.outcomes[date];return d});state.modal=null;render();return}
  if(a==="outcome-save"){saveNonnegOutcome(el.dataset.value);return}
  if(a==="toggle"){state.open[el.dataset.id]=!state.open[el.dataset.id];render();return}
  if(a==="nav"){state.page=el.dataset.page;state.mobileMenu=false;if(state.page==="plan")state.view="planning";render();return}
  if(a==="mobile-menu"){state.mobileMenu=!state.mobileMenu;render();return}
  if(a==="view"){state.view=el.dataset.view;render();return}
  if(a==="progress-period"){state.progressPeriod=el.dataset.period;state.page="progress";render();return}
  if(a==="today"){state.date=todayKey();state.month=state.date.slice(0,7)+"-01";render();return}
  if(a==="save-day"){try{document.querySelectorAll("[data-reflection]").forEach(x=>ensureDay(data,state.date).reflection[x.dataset.reflection]=x.value);ensureDay(data,state.date).savedAt=new Date().toISOString();data=save(data);toast(`Día ${fmtDate(parse(state.date))} guardado`);render();}catch{toast("No se pudo guardar. Tus datos locales no fueron descartados.");}return}
  if(a==="notes-history"){state.page="notes";render();return}
  if(a==="note-toggle"){const k=el.dataset.date;state.open["note:"+k]=state.open["note:"+k]!==true;render();return}
  if(a==="date-nav"){const n=Number(el.dataset.delta);if(state.page==="progress"){const d=currentDate(),p=state.progressPeriod||"week";if(p==="year")d.setFullYear(d.getFullYear()+n);else if(p==="month"){d.setDate(1);d.setMonth(d.getMonth()+n)}else d.setDate(d.getDate()+7*n);state.date=key(d);render();return}if(state.page==="insights"){state.date=key(add(currentDate(),7*n));render();return}if(state.view==="day")state.date=key(add(currentDate(),n));else if(state.view==="week"||state.view==="planning")state.date=key(add(currentDate(),n*7));else{const d=parse(state.month);d.setMonth(d.getMonth()+n);state.month=key(new Date(d.getFullYear(),d.getMonth(),1))}render();return}
  if(a==="month-nav"){const d=parse(state.month);d.setMonth(d.getMonth()+Number(el.dataset.delta));state.month=key(new Date(d.getFullYear(),d.getMonth(),1));render();return}
  if(a==="go-date"){state.date=el.dataset.date;state.month=key(parse(state.date));state.page="plan";state.view="day";render();return}
  if(a==="planner-day-open"){state.date=el.dataset.date;state.month=key(parse(state.date));state.page="plan";state.view="day";render();return}
  if(a==="mood"){if(state.view==="day"&&state.date<=todayKey())setDay({mood:el.dataset.mood});return}
  if(a==="plan-day-toggle"){setPlannedDay(el.dataset.date,!dayHasPlan(el.dataset.date));return}
  if(a==="task-assign"){const t=data.tasks.find(x=>x.id===el.dataset.id);if(!t)return;const day=el.dataset.day,assigning=t.date!==day;setData(d=>{let tasks=d.tasks;if(assigning){tasks=[...tasks,{...t,id:id("task"),sourceId:t.id,date:day,completed:false}];}else if(t.sourceId){tasks=tasks.filter(x=>x.id!==t.id);}else{tasks=tasks.map(x=>x.id===t.id?{...x,date:""}:x);}const out={...d,tasks};if(assigning)ensureWeek(out,weekKey(day)).plannedDays[day]=true;return out});return}
  if(a==="nonneg-toggle-date"){const n=data.nonNegotiables.find(x=>x.id===el.dataset.id);if(n)toggleNonnegForDate(n,el.dataset.date);return}
  if(a==="nav-goals"){state.page="goals";state.mobileMenu=false;render();return}
  if(a==="task-toggle"){setData(d=>({...d,tasks:d.tasks.map(t=>t.id===el.dataset.id?{...t,completed:!t.completed}:t)}));return}
  if(a==="task-delete"){if(!confirm("¿Eliminar esta tarea?"))return;setData(d=>({...d,tasks:d.tasks.filter(t=>t.id!==el.dataset.id)}));return}
  if(a==="task-tomorrow"){const t=data.tasks.find(x=>x.id===el.dataset.id);if(t)setData(d=>({...d,tasks:d.tasks.map(x=>x.id===t.id?{...x,date:key(add(t.date?parse(t.date):currentDate(),1))}:x)}));return}
  if(a==="habit-toggle"){setData(d=>({...d,habits:d.habits.map(h=>h.id===el.dataset.id?{...h,logs:{...(h.logs||{}),[el.dataset.date]:!h.logs?.[el.dataset.date]}}:h)}));return}
  if(a==="habit-delete"){if(!confirm("¿Eliminar este hábito?"))return;setData(d=>({...d,habits:d.habits.filter(h=>h.id!==el.dataset.id)}));return}
  if(a==="training-toggle"){setData(d=>({...d,training:d.training.map(t=>t.id===el.dataset.id?{...t,completed:!t.completed}:t)}));return}
  if(a==="minimal-toggle"){const r=dayRecord();setDay({minimalPlan:{...r.minimalPlan,[el.dataset.key]:!r.minimalPlan?.[el.dataset.key]}});return}
  if(a==="nonneg-toggle"){const n=data.nonNegotiables.find(x=>x.id===el.dataset.id);if(n)toggleNonnegForDate(n,state.date);return}
  if(a==="goal-delete"){if(!confirm("¿Eliminar esta meta?"))return;setData(d=>({...d,goals:d.goals.filter(g=>g.id!==el.dataset.id)}));return}
  if(a==="priority-delete"){if(!confirm("¿Eliminar esta prioridad?"))return;setData(d=>({...d,priorities:d.priorities.filter(p=>p.id!==el.dataset.id)}));return}
  if(a==="delete-note"){if(!confirm("¿Eliminar esta reflexión?"))return;const k=el.dataset.date;setData(d=>{const r=ensureDay(d,k);r.reflection={title:"",notes:"",achieved:"",improve:""};return d});return}
  if(a==="modal"){state.modal={type:el.dataset.type,id:el.dataset.id||undefined,noDate:el.dataset.noDate==="true",plannedDate:el.dataset.plannedDate||undefined};render();return}
  if(a==="close-modal"){if(el.classList.contains("modal-backdrop")&&e.target!==el)return;state.modal=null;render();return}
  if(a==="modal-save"){try{saveModal()}catch{toast("No se pudo guardar. Conservamos el formulario para reintentar.");}return}
  if(a==="reset"){if(confirm("¿Borrar todos tus registros? Exporta antes un respaldo.")){try{reset()}catch{toast("No se pudo restaurar. No se eliminaron tus datos.");}}return}
  if(a==="notification-settings"){state.page="settings";render();return}
  if(a==="notification-enable"){openNotificationSettings();return}
  if(a==="notification-test"){testNotification();return}
  if(a==="install-pwa"){installPwa();return}
  if(a==="sync-now"){syncRemote();return}
  if(a==="export"){exportBackup();return}
});
document.addEventListener("change",e=>{
  const el=e.target;
  if(el.matches("[data-task-picker-category]")){state.taskPickerCategory=el.value;render();return}
  if(el.matches("[data-nonneg-notify]")||el.matches("[data-nonneg-time]")){const n=data.nonNegotiables.find(x=>x.id===(el.dataset.nonnegNotify||el.dataset.nonnegTime)),date=el.dataset.date||state.date;if(!n)return;const previous=reminderFor(n,date);n.reminders={...n.reminders,[date]:{...previous,...(el.dataset.nonnegNotify?{enabled:el.checked}:{time:el.value||"20:00"})}};persistDraft();return}
  if(el.matches("[data-training-choice]")){state.open.trainingNonneg=true;setDay({trainingNonnegId:el.value});return}
  if(el.matches("[data-goal-milestone]")){setData(d=>({...d,goals:d.goals.map(g=>g.id===el.dataset.goalMilestone?{...g,milestones:g.milestones.map((m,i)=>i===Number(el.dataset.index)?{...(typeof m==="string"?{title:m}:m),completed:el.checked}:m)}:g)}));return}
  if(el.matches("[data-date-select]")){if(el.value){state.date=el.value;state.month=state.date.slice(0,7)+"-01";render()}return}
  if(el.matches("[data-picker-check]")){const ids=new Set(state.pickerIds||[]);if(el.checked)ids.add(el.dataset.pickerCheck);else ids.delete(el.dataset.pickerCheck);state.pickerIds=[...ids];return}
  if(el.matches("[data-task-check]")){setData(d=>({...d,tasks:d.tasks.map(t=>t.id===el.dataset.taskCheck?{...t,completed:el.checked}:t)}));return}
  if(el.matches("[data-nonneg-check]")){const n=data.nonNegotiables.find(x=>x.id===el.dataset.nonnegCheck);if(n)toggleNonnegForDate(n,el.dataset.date||state.date);return}
  if(el.matches("[data-habit-check]")){setData(d=>({...d,habits:d.habits.map(h=>h.id===el.dataset.habitCheck?{...h,logs:{...h.logs,[el.dataset.date]:el.checked}}:h)}));return}
  if(el.matches("[data-field]")){const value=el.value===""?null:Math.max(0,Number(el.value))*(el.dataset.hours?60:1);if(el.dataset.field==="sleepMinutes")ensureDay(data,state.date).sleepRecorded=true;ensureDay(data,state.date)[el.dataset.field]=el.dataset.field==="energy"&&value!=null?Math.min(10,value):value;persistDraft();if(el.dataset.field==="energy"){document.getElementById("energy-output").textContent=value+" / 10";}return}
  if(el.matches("[data-reflection]")){ensureDay(data,state.date).reflection[el.dataset.reflection]=el.value;persistDraft();return}
  if(el.matches("[data-weekly]")){setWeeklyField(el.dataset.weekly,el.value);return}
  if(el.matches("[data-setting]")){setData(d=>({...d,settings:{...d.settings,[el.dataset.setting]:Math.max(0,Number(el.value))}}));return}
  if(el.matches("[data-setting-text]")){setData(d=>({...d,settings:{...d.settings,[el.dataset.settingText]:el.value}}));return}
  if(el.matches("[data-setting-notification]")){setData(d=>({...d,notifications:{...d.notifications,[el.dataset.settingNotification]:el.type==="checkbox"?el.checked:Number(el.value)}}));return}
  if(el.matches("[data-sync-setting]")){setData(d=>({...d,sync:{...d.sync,[el.dataset.syncSetting]:el.type==="checkbox"?el.checked:el.value}}));return}
  if(el.matches('input[type="file"][data-action="import"]'))importBackup(el.files?.[0]);
});
function bindGlobal(){document.querySelectorAll("[data-range-output]").forEach(i=>i.addEventListener("input",()=>{const o=document.getElementById(i.dataset.rangeOutput);if(o)o.textContent=i.value+"%"}))}
async function openNotificationSettings(){if(!("Notification"in window)){toast("Este navegador no admite notificaciones.");return}if(location.protocol!=="https:"&&location.hostname!=="localhost"&&location.hostname!=="127.0.0.1"){toast("Las notificaciones requieren HTTPS o localhost.");return}const perm=Notification.permission==="granted"?"granted":await Notification.requestPermission();if(perm!=="granted"){toast("Permiso de notificaciones: "+perm);return}data=save({...data,notifications:{...data.notifications,enabled:true}});render();toast("Notificaciones activadas.");await maybeSubscribePush()}
async function maybeSubscribePush(){if(!CONFIG.vapidPublicKey||!("serviceWorker"in navigator)||!("PushManager"in window))return;try{const reg=await navigator.serviceWorker.getRegistration();if(!reg)return;const sub=await reg.pushManager.getSubscription();if(sub)return;const s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(CONFIG.vapidPublicKey)});localStorage.setItem("plan20-push-subscription",JSON.stringify(s.toJSON()))}catch(e){console.warn("PLAN20 push",e)}}
function base64ToBytes(b){const pad="=".repeat((4-b.length%4)%4),raw=atob((b+pad).replace(/-/g,"+").replace(/_/g,"/")),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a}
async function testNotification(){if(!("Notification"in window)){toast("Notificaciones no disponibles.");return}if(Notification.permission!=="granted"){await openNotificationSettings();return}try{const reg=await navigator.serviceWorker?.getRegistration();if(!reg?.active){toast("Preparando notificaciones. Recarga y vuelve a probar.");return;}await reg.showNotification("PLAN 2.0",{body:"La notificación de prueba funciona.",icon:"./public/icons/icon-192.svg",badge:"./public/icons/icon-192.svg",tag:"plan20-test",data:{url:"./"}})}catch{try{new Notification("PLAN 2.0",{body:"La notificación de prueba funciona."})}catch{toast("No se pudo mostrar la notificación.")}}}
function loadNotify(k){return !!notifyLog[k]}
function markNotify(k){notifyLog[k]=Date.now();try{localStorage.setItem(NOTIFY_LOG_KEY,JSON.stringify(notifyLog))}catch{}}
function scheduleLocalReminderCheck(){if(reminderTimer)return;reminderTimer=setInterval(checkLocalReminders,30000);setTimeout(checkLocalReminders,1200)}
function dueReminders(now=new Date()){
 const k=key(now),nowM=now.getHours()*60+now.getMinutes(),lead=Number(data.notifications.leadMinutes)||0,result=[];
 for(const t of tasksFor(k).filter(t=>!t.completed&&t.notify!==false)){
  const time=t.reminderTime||t.time,tm=minutesFromTime(time);if(tm===null)continue;
  if(nowM>=tm-lead&&(nowM<=tm||data.notifications.overdue))result.push({id:`task-${k}-${t.id}`,title:"Pendiente: "+t.title,body:"Recordatorio de hoy · "+time,taskId:t.id});
 }
 for(const n of activeNonneg(k)){
  const reminder=reminderFor(n,k),tm=minutesFromTime(reminder.time);
  if(reminder.enabled&&tm!==null&&nowM>=tm&&nonnegOutcome(n,k)==="pending")result.push({id:`nonneg-${k}-${n.id}`,title:"No negociable pendiente",body:n.name+" · Revisa el registro de hoy"});
 }
 return result;
}
async function checkLocalReminders(){if(!data.notifications.enabled||!("Notification"in window)||Notification.permission!=="granted")return;for(const r of dueReminders())await maybeNotify(r.id,r.title,r.body,r.taskId);}
async function maybeNotify(k,title,body,taskId){if(loadNotify(k))return;try{const reg=await navigator.serviceWorker?.getRegistration();if(!reg?.active)return;await reg.showNotification(title,{body,icon:"./public/icons/icon-192.svg",badge:"./public/icons/icon-192.svg",tag:k,renotify:false,data:{url:"./?date="+todayKey()+(taskId?"&task="+encodeURIComponent(taskId):"")}});markNotify(k)}catch{}}
async function installPwa(){if(state.deferredInstallPrompt){state.deferredInstallPrompt.prompt();try{await state.deferredInstallPrompt.userChoice}catch{}state.deferredInstallPrompt=null;render();return}toast("Usa el menú del navegador: “Instalar app” o “Añadir a pantalla de inicio”.")}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.deferredInstallPrompt=e;render()});
window.addEventListener("appinstalled",()=>{state.deferredInstallPrompt=null;render();toast("PLAN 2.0 instalado.")});
window.addEventListener("online",()=>{if(data.sync.enabled)syncRemote()});
installSyncListeners(incoming=>{if(incoming.meta?.updatedAt===data.meta?.updatedAt)return;data=incoming;repairPriorityRelations();render()});
async function syncRemote(){if(!data.sync.enabled||!data.sync.endpoint){toast("Configura un endpoint de sincronización.");return}try{const headers={"Content-Type":"application/json"};if(data.sync.token)headers.Authorization="Bearer "+data.sync.token;const r=await fetch(data.sync.endpoint,{headers,cache:"no-store"});let remote=null;if(r.ok){const p=await r.json();remote=p.data||p}const lt=Date.parse(data.meta?.updatedAt||0)||0,rt=Date.parse(remote?.meta?.updatedAt||remote?.updatedAt||0)||0;if(remote&&rt>lt){data=replace(remote);render();toast("Descargamos una versión más nueva.")}else{const u=await fetch(data.sync.endpoint,{method:"PUT",headers,body:JSON.stringify({data,updatedAt:data.meta.updatedAt})});if(!u.ok)throw new Error("HTTP "+u.status);data=save({...data,sync:{...data.sync,lastSync:new Date().toISOString()}},false);render();toast("Sincronización completada.")}}catch(e){console.warn("PLAN20 sync",e);toast("No se pudo sincronizar: revisa el endpoint.")}}
function exportBackup(){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="plan20-respaldo-"+todayKey()+".json";a.click();URL.revokeObjectURL(u);toast("Respaldo exportado.")}
async function importBackup(file){if(!file)return;try{const x=JSON.parse(await file.text());if(!x||typeof x!=="object"||!Array.isArray(x.tasks))throw new Error("Formato");data=replace(x);render();toast("Respaldo importado.")}catch{toast("No se pudo importar ese respaldo.")}}
const routeDate=new URLSearchParams(location.search).get("date");
if(routeDate&&/^\d{4}-\d{2}-\d{2}$/.test(routeDate)&&key(parse(routeDate))===routeDate){state.date=routeDate;state.month=routeDate.slice(0,7)+"-01";state.view="day";}
registerServiceWorker().then(()=>{});
render();
scheduleLocalReminderCheck();

// Mobile-safe summary override: use the same circular mood artwork as PLAN.
function daySummary(d){const k=key(d),planned=dayHasPlan(k),ts=tasksFor(k),done=ts.filter(t=>t.completed).length,r=data.days[k],m=(MOODS.concat(LEGACY_MOODS)).find(x=>x[0]===r?.mood),tr=data.training.some(t=>t.date===k&&t.completed),score=planned?dayCompletion(k):null;return `<button class="day-summary-card ${k===state.date?"today":""}" data-action="go-date" data-date="${k}"><div class="day-name">${cap(new Intl.DateTimeFormat("es-CL",{weekday:"short"}).format(d).replace(".",""))}</div><div class="day-num">${d.getDate()}</div><div class="day-task-count">${done}/${ts.length} tareas · ${planned?"planificado":"sin plan"}</div><div class="day-score">${score===null?"—":score+"%"}</div><div class="day-dots"><span class="dot task ${done?"active":""}"></span><span class="dot habit ${dayHabitPct(k)>0?"active":""}></span><span class="dot train ${tr?"active":""}></span></div>${m?`<span class="day-mood">${moodIllustration(m[0],24)}</span>`:'<span class="day-mood muted">—</span>'}</button>`}

function renderTaskPicker(day){
 const query=String(state.taskPickerSearch||"").trim().toLowerCase(),category=state.taskPickerCategory||"Todas";
 const candidates=data.tasks.filter(t=>!t.date||weekKey(t.date)===weekKey(day)),categories=[...new Set(["Todas","Mis tareas","Estudio","Entrenamiento",...candidates.map(t=>t.category||"Mis tareas")])],seen=new Set();
 const filtered=candidates.filter(t=>{const root=t.sourceId||t.id;if(seen.has(root))return false;seen.add(root);return (!query||(t.title+" "+(t.note||"")).toLowerCase().includes(query))&&(category==="Todas"||(t.category||"Mis tareas")===category)});
 return `<div class="view-stack"><div class="page-heading"><div><h1>Selector de tareas</h1><p>${escape(cap(fmtDate(parse(day))))}</p></div><button class="outline-btn" data-action="view" data-view="day">Volver al día</button></div><section class="card planner-picker"><div class="planner-picker-head"><strong>Añadir solo a este día</strong><button class="primary-btn" data-action="modal" data-type="task-new" data-planned-date="${day}">${illustratedIcon("plus",18)} Crear tarea</button></div><div class="planner-picker-tools"><input type="search" data-task-picker-search value="${escape(state.taskPickerSearch||"")}" placeholder="Buscar tareas" aria-label="Buscar tareas"><select data-task-picker-category aria-label="Categoría">${categories.map(c=>`<option ${category===c?"selected":""}>${escape(c)}</option>`).join("")}</select></div><div class="planner-task-picker-grid">${filtered.map(t=>{const present=candidates.some(x=>x.date===day&&(x.id===t.id||x.sourceId===(t.sourceId||t.id)));return `<label class="planner-picker-card ${present?"selected":""}"><input type="checkbox" data-picker-check="${t.id}" ${present?"checked disabled":(state.pickerIds||[]).includes(t.id)?"checked":""}>${dataIcon(t.category||t.title,36)}<strong>${escape(t.title)}</strong><small>${present?"Ya en este día":escape(t.category||"Mis tareas")}</small></label>`}).join("")||empty("Crea tu primera tarea para comenzar.")}</div><button class="primary-btn" data-action="picker-add">Añadir al día</button></section></div>`;
}
function renderNotesHistory(){
 const entries=Object.entries(data.days).filter(([,r])=>["title","notes","achieved","improve"].some(f=>String(r?.reflection?.[f]||"").trim())).sort(([a],[b])=>b.localeCompare(a));
 if(!entries.length)return empty("Todavía no hay reflexiones guardadas. Escribe una en Día.");
 return `<div class="notes-history-list">${entries.map(([date,r])=>{const open=state.open["note:"+date]===true;return `<article class="note-history-item ${open?"is-open":""}"><button class="note-history-head" data-action="note-toggle" data-date="${date}" aria-expanded="${open}"><span><strong>${escape(cap(fmtDate(parse(date))))}</strong><small>${escape(r.reflection.title||noteSummary(r))}</small></span><span>${icon(open?"minus":"chevron-down")}</span></button>${open?`<div class="note-history-body">${[["notes","Reflexión"],["achieved","Lo que logré"],["improve","Qué puedo mejorar"]].filter(([f])=>r.reflection[f]).map(([f,l])=>`<h3>${l}</h3><p>${escape(r.reflection[f])}</p>`).join("")}<div class="notes-actions"><button class="outline-btn" data-action="go-date" data-date="${date}">Editar nota</button><button class="outline-btn danger" data-action="delete-note" data-date="${date}">Eliminar nota</button></div></div>`:""}</article>`}).join("")}</div>`;
}
function renderNotesPage(){return `<div class="view-stack notes-page"><div class="page-heading"><div><h1>Notas / reflexión</h1><p>Tu historia, un día a la vez. De la más reciente a la más antigua.</p></div><button class="outline-btn" data-action="go-date" data-date="${state.date}">Escribir nota</button></div>${renderNotesHistory()}</div>`}
function renderProgress(){
 const period=state.progressPeriod||"week",ref=currentDate();
 const start=period==="year"?new Date(ref.getFullYear(),0,1):period==="month"?new Date(ref.getFullYear(),ref.getMonth(),1):startWeek(ref);
 const end=period==="year"?new Date(ref.getFullYear(),11,31):period==="month"?new Date(ref.getFullYear(),ref.getMonth()+1,0):add(start,6);
 const dates=[];for(let d=start;key(d)<=key(end);d=add(d,1))dates.push(key(d));
 const keys=new Set(dates),ts=data.tasks.filter(t=>keys.has(t.date)),done=ts.filter(t=>t.completed).length,planned=dates.filter(dayHasPlan),score=planned.length?Math.round(avg(planned.map(dayCompletion))):null;
 const records=dates.map(d=>data.days[d]||{}),moods=dates.filter(d=>data.days[d]?.mood),sleep=records.map(r=>Number(r.sleepMinutes)).filter(n=>n>0),study=records.reduce((a,r)=>a+Number(r.studyMinutes||0),0);
 let hTotal=0,hDone=0,nTotal=0,nDone=0;for(const d of planned){for(const h of data.habits)if(habitScheduled(h,parse(d))){hTotal++;if(habitDone(h,d))hDone++;}for(const n of activeNonneg(d)){nTotal++;if(nonnegDone(n,d))nDone++;}}
 return `<div class="view-stack"><div class="page-heading"><div><h1>Tu progreso</h1><p>${escape(fmtShortDate(start))} – ${escape(fmtShortDate(end))}</p></div></div><div class="period-tabs" role="tablist" aria-label="Periodo">${[["week","Semana"],["month","Mes"],["year","Año"]].map(([p,l])=>`<button role="tab" aria-selected="${period===p}" class="${period===p?"active":""}" data-action="progress-period" data-period="${p}">${l}</button>`).join("")}</div><section class="card progress-summary"><h2>Cumplimiento del periodo</h2><div class="ring" style="--value:${(score||0)*3.6}deg"><span>${score==null?"—":score+"%"}</span></div><p>${done} / ${ts.length} tareas · ${planned.length} días planificados</p><div class="progress-metrics">${metricCard("Hábitos",hTotal?pct(hDone,hTotal)+"%":"—",pct(hDone,hTotal))}${metricCard("No negociables",nTotal?pct(nDone,nTotal)+"%":"—",pct(nDone,nTotal))}${metricCard("Estudio",fmtHours(study),0)}${metricCard("Sueño promedio",sleep.length?fmtHours(avg(sleep)):"—",0)}${metricCard("Entrenamientos",String(data.training.filter(t=>keys.has(t.date)&&t.completed).length),0)}${metricCard("Pasos promedio",records.some(r=>r.steps!=null&&r.steps!=="")?Math.round(avg(records.filter(r=>r.steps!=null&&r.steps!=="").map(r=>Number(r.steps)))).toLocaleString("es-CL"):"—",0)}${metricCard("Peso promedio",records.some(r=>Number(r.weight)>0)?avg(records.filter(r=>Number(r.weight)>0).map(r=>Number(r.weight))).toFixed(1)+" kg":"—",0)}</div></section>
 <section class="card mood-history"><div class="panel-heading"><div><h2>Estado de ánimo registrado</h2><p>Solo registros de Día. Sin emociones supuestas.</p></div></div>${moods.length?moods.slice().reverse().map(d=>`<button class="mood-history-item" data-action="go-date" data-date="${d}">${moodIllustration(data.days[d].mood,42)}<span><strong>${escape(cap(fmtDate(parse(d))))}</strong><small>${escape(data.days[d].mood)}${data.days[d].energy==null?"":" · Energía "+data.days[d].energy+"/10"}</small></span><span>${dayHasPlan(d)?dayCompletion(d)+"%":"—"}</span></button>`).join(""):empty("Sin registros de ánimo en este periodo.")}</section>
 <section class="card history-card"><h2>Días del periodo</h2><div class="history-list">${dates.filter(d=>dayHasPlan(d)||data.days[d]?.savedAt).map(d=>`<button class="mood-history-item" data-action="go-date" data-date="${d}"><strong>${escape(fmtShortDate(parse(d)))}</strong><span>${tasksFor(d).filter(t=>t.completed).length}/${tasksFor(d).length} tareas</span><b>${dayHasPlan(d)?dayCompletion(d)+"%":"—"}</b></button>`).join("")||empty("Todavía no hay días planificados o guardados.")}</div></section></div>`;
}
function renderInsights(){
  const w=week(currentDate()),keys=new Set(w.map(key)),planned=w.filter(d=>dayHasPlan(key(d))).length;
  const tasks=data.tasks.filter(t=>keys.has(t.date)),done=tasks.filter(t=>t.completed).length;
  const priorities=prioritiesFor(currentDate()),habitPct=habitWeekPct(w),training=data.training.filter(t=>t.completed&&keys.has(t.date)).length;
  const records=w.map(d=>data.days[key(d)]||{}),study=records.reduce((s,r)=>s+Number(r.studyMinutes||0),0),water=records.map(r=>Number(r.waterLiters||0)).filter(Boolean),mood=weekGeneralMood(w);
  const sleepGood=w.filter(d=>Number(data.days[key(d)]?.sleepMinutes||0)>=420),sleepShort=w.filter(d=>{const n=Number(data.days[key(d)]?.sleepMinutes||0);return n>0&&n<420});
  if(planned<1&&!tasks.length&&!mood.count&&!study)return `<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">INSIGHTS</span><h1>Mis conclusiones</h1><p>Observaciones en español basadas en tus registros.</p></div></div><div class="card note-card"><strong>Datos insuficientes</strong><p>Planifica al menos un día y registra algunas acciones para generar observaciones fiables.</p></div></div>`;
  const cards=[
    ["success","Planificación y ejecución",`Esta semana hay ${planned} día(s) planificado(s), ${tasks.length} tarea(s) fechada(s), ${done} completada(s) y ${weekCompletion(currentDate())}% de cumplimiento.`],
    ["target","Prioridades",priorities.length?priorities.map((p,i)=>`P${i+1} ${escape(p.title)}: ${priorityProgress(p)}%`).join(" · "):"No hay prioridades definidas para esta semana."],
    ["habit","Hábitos y no negociables",`${data.habits.length} hábito(s) configurado(s), ${habitPct}% de cumplimiento y ${data.nonNegotiables.filter(n=>n.active!==false).length} no negociable(s) activo(s).`],
    ["training","Entrenamiento",`${training} entrenamiento(s) completado(s) esta semana. Es un dato descriptivo y no establece causalidad.`],
    ["notes","Estudio y agua",`Estudio registrado: ${fmtHours(study)}. Agua promedio: ${water.length?avg(water).toFixed(1)+" L":"sin registros"}.`],
    ["sleep","Sueño y cumplimiento",`${sleepGood.length?sleepGood.length+" día(s) con 7 h o más registrados":"No hay suficientes días con 7 h o más"}; ${sleepShort.length?sleepShort.length+" día(s) con menos de 7 h":"sin registros cortos suficientes"}.`],
    ["heart","Estado emocional",mood.count?`Se registraron estados en ${mood.count} día(s); estado más frecuente: ${mood.label}.`:"No hay estados emocionales suficientes esta semana."]
  ];
  return `<div class="view-stack"><div class="page-heading"><div><span class="eyebrow">INSIGHTS</span><h1>Mis insights</h1><p>Observaciones descriptivas basadas en datos guardados.</p></div></div><div class="insight-grid">${cards.map(([ico,title,copy])=>`<div class="card insight-card"><div class="insight-icon atlas-holder">${atlasIcon(ico,29)}</div><div><h3>${title}</h3><p>${copy}</p></div></div>`).join("")}</div><div class="card note-card"><strong>Cómo leer estos insights</strong><p>Describen registros y coincidencias observadas. No inventan datos ni afirman que una variable cause otra.</p></div></div>`;
}

function renderWhatNow(next){
  if(!next)return empty("No hay tareas por hacer para este día.",'<button class="add-inline" data-action="modal" data-type="task-new" data-planned-date="'+state.date+'">＋ Añadir tarea</button>');
  const following=getFollowingAction(next);
  return `<div class="now-grid"><div class="now-main now-task-card"><div class="kicker">POR HACER</div><div class="now-task-line"><button class="task-check now-check ${next.completed?"checked":""}" data-action="task-toggle" data-id="${next.id}" aria-label="${next.completed?"Marcar pendiente":"Marcar listo"}: ${escape(next.title)}">${next.completed?"✓":""}</button><div><div class="now-title">${escape(next.title)}</div><div class="now-meta">${next.time?`${next.time} – ${timeEnd(next.time,next.estimatedMinutes||60)}`:"Sin horario"}</div><span class="task-state ${next.completed?"is-done":""}">${next.completed?"Listo":"Pendiente"}</span></div></div></div><div class="now-next"><div class="kicker">SIGUIENTE</div><strong>${escape(following?.title||"Nada pendiente")}</strong><span>Marca la casilla para actualizar el estado.</span></div></div>`;
}

function renderPlannerDay(d){
 const k=key(d),r=data.days[k],tasks=tasksFor(k),planned=dayHasPlan(k),name=cap(new Intl.DateTimeFormat("es-CL",{weekday:"long"}).format(d));
 return `<article class="planner-day-card ${planned?"planned":""}" data-plan-day="${k}"><div class="planner-day-head"><div><span class="day-name">${escape(name)}</span><strong>${d.getDate()} <small>${new Intl.DateTimeFormat("es-CL",{month:"short"}).format(d)}</small></strong></div><button class="day-plan-toggle ${planned?"active":""}" data-action="plan-day-toggle" data-date="${k}">${planned?"Planificado":"Planificar"}</button></div>
 <div class="planner-mood-summary">${r?.mood?`${moodIllustration(r.mood,42)}<small>${escape(r.mood)}</small>`:'<span class="mood-unrecorded">—</span><small>Sin registro</small>'}</div>
 <div class="planner-task-list">${tasks.length?tasks.slice(0,3).map(renderPlannerTask).join(""):'<div class="planner-empty-line">Añade tu primera tarea.</div>'}</div>
 <div class="planner-task-count">${tasks.filter(t=>t.completed).length} / ${tasks.length} tareas listas${tasks.length>3?" · "+(tasks.length-3)+" más":""}</div>
 <div class="planner-day-footer"><button class="day-open-btn" data-action="planner-day-open" data-date="${k}">Editar día</button><button class="add-inline planner-add" data-action="picker-open" data-date="${k}" aria-label="Añadir tarea al ${escape(name)}">${illustratedIcon("plus",18)} Añadir tarea</button></div></article>`;
}
function appShell(){
  const tabs=state.page==="plan"?"<div class=\"segmented\"><button class=\""+(state.view==="planning"?"active":"")+" data-action=\"view\" data-view=\"planning\">Planificación</button><button class=\""+(state.view==="day"?"active":"")+" data-action=\"view\" data-view=\"day\">Día</button><button class=\""+(state.view==="week"?"active":"")+" data-action=\"view\" data-view=\"week\">Semana</button><button class=\""+(state.view==="month"?"active":"")+" data-action=\"view\" data-view=\"month\">Mes</button></div>":"";
  const navItems=[["plan","Plan","calendar"],["goals","Metas","target"],["progress","Progreso","chart"],["insights","Insights","spark"],["settings","Configuración","settings"]];
  return `<div class="app-shell"><aside class="sidebar ${state.mobileMenu?"mobile-open":""}"><div class="brand"><span class="brand-leaf">${atlasIcon("habit",28)}</span><div><strong>PLAN 2.0</strong><small><span class="brand-motto">Cree en ti</span></small></div></div><nav class="main-nav">${navItems.map(([p,l,i])=>`<button class="nav-item ${state.page===p?"active":""}" data-action="nav" data-page="${p}">${atlasIcon(i,22)}<span>${l}</span></button>`).join("")}</nav><div class="sidebar-bottom"><button class="sidebar-notify" data-action="notification-settings">${atlasIcon("notification",22)}<span>Notificaciones</span><em>${data.notifications.enabled?"ON":"OFF"}</em></button><div class="sidebar-quote">Disciplina hoy,<br>mejor mañana.</div></div></aside>${state.mobileMenu?`<div class="mobile-scrim" data-action="mobile-menu"></div>`:""}<main class="main-shell"><div class="mobile-brand"><div class="mobile-brand-copy"><span class="mobile-brand-mark">${atlasIcon("habit",30)}</span><div><strong>PLAN 2.0</strong><small><span class="brand-motto">Cree en ti</span></small></div></div></div><header class="topbar"><div class="top-date"><button data-action="date-nav" data-delta="-1" aria-label="Semana anterior">${icon("back")}</button><div><strong>${cap(fmtMonth(currentDate()))}</strong><small>Semana ${weekNumber(currentDate())} · ${weekLabel(currentDate())}</small></div><button data-action="date-nav" data-delta="1" aria-label="Semana siguiente">${icon("next")}</button></div>${tabs}<div class="top-actions"><button class="outline-btn top-notes-btn" data-action="notes-history">Ver notas</button><button class="today-btn" data-action="today">Hoy</button><button class="icon-btn" data-action="notification-settings" title="Configurar notificaciones" aria-label="Configurar notificaciones">${atlasIcon("notification",22)}</button></div></header><div class="content-wrap">${renderPage()}</div></main>${state.modal?renderModal():""}</div>`;
}


function renderRepeatModal(){
 const t=data.tasks.find(x=>x.id===state.modal.id);if(!t)return "";
 const base=t.date||state.date,days=week(parse(base)).map(key).filter(d=>d!==t.date);
 return `<div class="modal-backdrop" data-action="close-modal"><section class="modal card" data-modal-inner role="dialog" aria-modal="true" aria-label="Agregar a otros días"><div class="modal-head"><h2>Agregar a otros días</h2><button class="icon-btn" data-action="close-modal" aria-label="Cerrar">×</button></div><h3>${escape(t.title)}</h3><p>Copias independientes, solo hasta el domingo de esta semana. Editarlas o completarlas no cambia la original.</p><div class="weekday-picks">${days.map(d=>`<label><input type="checkbox" data-repeat-date="${d}"> ${escape(cap(fmtDate(parse(d))))}</label>`).join("")||empty("No quedan más días en esta semana.")}</div><button class="outline-btn" data-action="repeat-rest">Seleccionar resto de la semana</button><div class="modal-actions"><button class="outline-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" data-action="repeat-save">${illustratedIcon("plus",18)} Agregar a los seleccionados</button></div></section></div>`;
}
function saveRepeatTasks(){
 const t=data.tasks.find(x=>x.id===state.modal.id);if(!t)return;
 const base=t.date||state.date,allowed=new Set(week(parse(base)).map(key).filter(d=>d!==t.date)),selected=[...document.querySelectorAll("[data-repeat-date]:checked")].map(x=>x.dataset.repeatDate).filter(d=>allowed.has(d));
 if(!selected.length){toast("Selecciona al menos un día.");return}
 const root=t.sourceId||t.id,added=selected.filter(date=>!data.tasks.some(x=>x.date===date&&(x.id===root||x.sourceId===root)));
 for(const date of added){data.tasks.push({...t,id:id("task"),sourceId:root,date,completed:false,createdAt:todayKey()});ensureWeek(data,weekKey(date)).plannedDays[date]=true;}
 repairPriorityRelations();data=save(data);state.modal=null;render();toast(added.length?"Copias añadidas: "+added.length:"La tarea ya estaba en esos días.");
}

document.addEventListener("input",e=>{
 const el=e.target;
 if(el.matches("[data-task-picker-search]")){const pos=el.selectionStart;state.taskPickerSearch=el.value;render();const next=document.querySelector("[data-task-picker-search]");next?.focus();if(next&&pos!=null)next.setSelectionRange(pos,pos);}
 if(el.matches('[data-field="energy"]')){const out=document.getElementById("energy-output");if(out)out.textContent=el.value+" / 10";}
});


function persistDraft(){try{data=save(data);return true}catch{toast("No se pudo guardar. Tus datos locales no fueron descartados.");return false;}}


function renderOutcomeModal(){
 const n=data.nonNegotiables.find(x=>x.id===state.modal.id),date=state.modal.date||state.date,reminder=reminderFor(n,date);
 const sleep=n?.mode==="sleep",value=Number(data.days[date]?.sleepMinutes||0)/60;
 return `<div class="modal-backdrop" data-action="close-modal"><section class="modal card" data-modal-inner><h2>${sleep?"¿Cuántas horas dormiste?":escape(n?.name||"No negociable")}</h2><p>${escape(fmtDate(parse(date)))}</p>${sleep?`<label class="field-label">Horas reales de sueño<select data-sleep-hours>${Array.from({length:49},(_,i)=>i/2).map(h=>`<option value="${h}" ${h===value?"selected":""}>${h} horas</option>`).join("")}</select></label><button class="primary-btn" data-action="sleep-hours-save">Guardar horas</button>`:`<div class="outcome-options"><button data-action="outcome-save" data-value="done">✓ Cumplido</button><button data-action="outcome-save" data-value="missed">× No cumplido</button><button data-action="outcome-save" data-value="pending">Dejar pendiente</button></div>`}<div class="nonneg-reminder"><label><input type="checkbox" data-nonneg-notify="${n.id}" data-date="${date}" ${reminder.enabled?"checked":""}> Notifícame este día</label><input type="time" data-nonneg-time="${n.id}" data-date="${date}" value="${reminder.time}" aria-label="Hora del recordatorio"></div><p class="note-helper">Si sigue pendiente a esa hora. Requiere permiso en este dispositivo y la app activa.</p><button class="outline-btn" data-action="close-modal">Cerrar</button></section></div>`;
}
function saveNonnegOutcome(value){if(!["done","missed","pending"].includes(value))return;const n=data.nonNegotiables.find(x=>x.id===state.modal.id);if(!n)return;const date=state.modal.date||state.date;setData(d=>{n.outcomes={...n.outcomes,[date]:value};if(n.mode==="training"){ensureDay(d,date).trainingNonnegId=n.id;const t=d.training.find(t=>t.date===date&&Number(t.slot)===Number(n.slot));if(t)t.completed=value==="done";else if(value==="done")d.training.push({id:id("training"),title:n.name,slot:n.slot,date,completed:true,durationMinutes:0});}return d});state.modal=null;render();}
