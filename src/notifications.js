const SENT_KEY = "plan20-notified-v2";
const ICON = "./public/icons/icon-192.svg";

function readSent() {
  try {
    const sent = JSON.parse(localStorage.getItem(SENT_KEY) || "{}");
    return sent && typeof sent === "object" && !Array.isArray(sent) ? sent : {};
  } catch { return {}; }
}
function writeSent(v) { try { localStorage.setItem(SENT_KEY, JSON.stringify(v)); } catch {} }

export function notificationSupported() {
  return "Notification" in window;
}

export async function requestPermission() {
  if (!notificationSupported()) return "unsupported";
  return await Notification.requestPermission();
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const hadController=!!navigator.serviceWorker.controller;
    let reloaded=false;
    navigator.serviceWorker.addEventListener?.("controllerchange",()=>{
      if(hadController&&!reloaded){reloaded=true;location.reload();}
    });
    const registration=await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
    await registration.update?.();
    return registration;
  } catch { return null; }
}

export async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active ? reg : null;
  } catch { return null; }
}

function base64ToBytes(base64) {
  const pad = "=".repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function subscribePush(vapidPublicKey) {
  const reg = await getRegistration();
  if (!reg?.pushManager || !vapidPublicKey) return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToBytes(vapidPublicKey)
    });
  }
  return sub;
}

export async function saveSubscription(endpoint, subscription) {
  if (!endpoint || !subscription) return { ok: false, reason: "missing" };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, source: "PLAN 2.0" })
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function testNotification(title = "PLAN 2.0", body = "Las notificaciones están activadas.") {
  if (!notificationSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, { body, tag: "plan20-test", icon: ICON, badge: ICON });
    } else {
      new Notification(title, { body, tag: "plan20-test", icon: ICON });
    }
    return true;
  } catch {
    return false;
  }
}

function markSent(id, stamp) {
  const sent = readSent();
  sent[id] = stamp;
  const keys = Object.keys(sent);
  if (keys.length > 120) for (const k of keys.slice(0, keys.length - 120)) delete sent[k];
  writeSent(sent);
}

export function checkForegroundReminders(data, dateKey) {
  if (!data?.notifications?.enabled || !notificationSupported() || Notification.permission !== "granted") return;
  const now = new Date();
  if (dateKey !== localKey(now)) return;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const configuredLead = Number(data.notifications.leadMinutes ?? 10);
  const lead = Number.isFinite(configuredLead) ? Math.max(0, configuredLead) : 10;
  for (const task of data.tasks || []) {
    if (task.completed || task.date !== dateKey || !task.time) continue;
    const [h, m] = task.time.split(":").map(Number);
    const taskMin = h * 60 + m;
    const delta = taskMin - nowMin;
    let stamp = "";
    if (delta >= 0 && delta <= lead) stamp = "due-" + dateKey + "-" + task.id;
    else if (data.notifications.overdue && delta < 0 && delta >= -60) stamp = "overdue-" + dateKey + "-" + task.id;
    const sentId = task.id + "-" + stamp;
    if (!stamp || readSent()[sentId] === stamp) continue;
    const when = delta >= 0 ? "en " + delta + " min" : "está pendiente";
    try {
      new Notification("PLAN 2.0 · " + task.title, {
        body: task.time + " · " + when,
        tag: "plan20-task-" + task.id,
        icon: ICON
      });
      markSent(sentId, stamp);
    } catch {}
  }
}

function localKey(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
