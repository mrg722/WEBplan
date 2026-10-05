export const DAY_KEYS=['L','M','X','J','V','S','D']
export const MOODS=[['Excelente','😄'],['Bien','🙂'],['Normal','😐'],['Bajo','😓'],['Agotado','😴']]
export function key(d){return d.toISOString().slice(0,10)}
export function parse(s){return new Date(`${s}T12:00:00`)}
export function add(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
export function startWeek(d){const x=new Date(d); const day=x.getDay(); const diff=(day+6)%7; x.setDate(x.getDate()-diff); x.setHours(12,0,0,0); return x}
export function week(d){const s=startWeek(d);return Array.from({length:7},(_,i)=>add(s,i))}
export function monthGrid(d){const first=new Date(d.getFullYear(),d.getMonth(),1,12);const s=startWeek(first);return Array.from({length:42},(_,i)=>add(s,i))}
export function fmtDate(d){return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long'}).format(d)}
export function fmtMonth(d){return new Intl.DateTimeFormat('es-CL',{month:'long',year:'numeric'}).format(d)}
export function cap(s){return s? s.charAt(0).toUpperCase()+s.slice(1):s}
export function fmtMin(m){m=Number(m)||0;const h=Math.floor(m/60),mm=m%60;return h?`${h} h${mm?` ${mm} min`:''}`:`${mm} min`}
export function fmtHours(m){return `${((Number(m)||0)/60).toFixed(1)} h`}
export function pct(a,b){return b?Math.round(a/b*100):0}
export function clamp(v){return Math.max(0,Math.min(100,Number(v)||0))}
export function weekNum(d){const start=new Date(d.getFullYear(),0,1,12);return Math.ceil((((d-start)/86400000)+start.getDay()+1)/7)}
export function weekLabel(d){const w=week(d);const a=new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short'}).format(w[0]).replace('.','');const b=new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short'}).format(w[6]).replace('.','');return `${a} – ${b}`}
export function timeEnd(t,min){if(!t)return '—';const [h,m]=t.split(':').map(Number);const end=(h*60+m+(Number(min)||60))%1440;return `${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`}
export function avg(a){const v=a.filter(n=>Number.isFinite(Number(n)));return v.length?v.reduce((s,n)=>s+Number(n),0)/v.length:0}
export function escape(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
