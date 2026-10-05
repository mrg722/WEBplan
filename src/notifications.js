const SENT_KEY='plan20-notified-v1';

function readSent(){
  try{return JSON.parse(localStorage.getItem(SENT_KEY)||'{}')}catch{return {}}
}
function writeSent(v){localStorage.setItem(SENT_KEY,JSON.stringify(v));}

export function notificationSupported(){return 'Notification' in window;}
export async function requestPermission(){
  if(!notificationSupported())return 'unsupported';
  return await Notification.requestPermission();
}
export async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return null;
  try{return await navigator.serviceWorker.register('./sw.js',{scope:'./'});}catch{return null;}
}
export async function getRegistration(){
  if(!('serviceWorker' in navigator))return null;
  try{return await navigator.serviceWorker.ready}catch{return null;}
}
function base64ToBytes(base64){
  const pad='='.repeat((4-base64.length%4)%4);
  const raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
export async function subscribePush(vapidPublicKey){
  const reg=await getRegistration();
  if(!reg?.pushManager || !vapidPublicKey)return null;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(vapidPublicKey)});
  return sub;
}
export async function saveSubscription(endpoint,subscription){
  if(!endpoint || !subscription)return {ok:false,reason:'missing'};
  try{
    const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription,source:'PLAN 2.0'})});
    return {ok:res.ok,status:res.status};
  }catch{return {ok:false,reason:'network'};}
}
export function testNotification(title='PLAN 2.0',body='Las notificaciones están activadas.'){
  if(!notificationSupported() || Notification.permission!=='granted')return false;
  new Notification(title,{body,tag:'plan20-test',icon:'./icons/icon-192.svg'});
  return true;
}
function alreadySent(id,stamp){
  const sent=readSent();
  if(sent[id]===stamp)return true;
  sent[id]=stamp;
  const keys=Object.keys(sent);
  if(keys.length>120)for(const k of keys.slice(0,keys.length-120))delete sent[k];
  writeSent(sent);
  return false;
}
export function checkForegroundReminders(data,dateKey){
  if(!data?.notifications?.enabled || !notificationSupported() || Notification.permission!=='granted')return;
  const now=new Date();
  if(dateKey!==localKey(now))return;
  const nowMin=now.getHours()*60+now.getMinutes();
  const lead=Math.max(0,Number(data.notifications.reminderLeadMinutes)||10);
  for(const task of data.tasks||[]){
    if(task.completed || task.date!==dateKey || !task.time)continue;
    const [h,m]=task.time.split(':').map(Number);
    const taskMin=h*60+m;
    const delta=taskMin-nowMin;
    let stamp='';
    if(delta>=0 && delta<=lead)stamp='due-'+dateKey+'-'+task.id;
    else if(data.notifications.overdueReminders && delta<0 && delta>=-60)stamp='overdue-'+dateKey+'-'+task.id;
    if(!stamp || alreadySent(task.id+'-'+stamp,stamp))continue;
    const when=delta>=0?'en '+delta+' min':'está pendiente';
    new Notification('PLAN 2.0 · '+task.title,{body:task.time+' · '+when,tag:'plan20-task-'+task.id,icon:'./icons/icon-192.svg'});
  }
  if(data.notifications.dailySummary && now.getHours()===9 && now.getMinutes()<2){
    const pending=(data.tasks||[]).filter(t=>!t.completed && t.date===dateKey).length;
    const stamp='summary-'+dateKey;
    if(pending && !alreadySent('summary-'+dateKey,stamp))new Notification('PLAN 2.0 · Hoy',{body:'Tienes '+pending+' tarea(s) sin completar hoy.',tag:'plan20-summary',icon:'./icons/icon-192.svg'});
  }
}
function localKey(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
