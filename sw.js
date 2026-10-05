const CACHE = "plan20-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/data.js",
  "./src/store.js",
  "./src/utils.js",
  "./src/styles.css",
  "./public/icons/icon.svg",
  "./public/icons/icon-192.svg",
  "./public/icons/icon-512.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      }).catch(()=>caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  })));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const p=event.data.payload||{};
    event.waitUntil(self.registration.showNotification(p.title||"PLAN 2.0",{
      body:p.body||"",
      icon:"./public/icons/icon-192.png",
      badge:"./public/icons/icon-192.png",
      tag:p.tag||"plan20",
      renotify:false,
      data:{url:p.url||"./"}
    }));
  }
});

self.addEventListener("push", event => {
  let payload={};
  try { payload=event.data ? event.data.json() : {}; } catch { payload={body:event.data?.text()||""}; }
  event.waitUntil(self.registration.showNotification(payload.title||"PLAN 2.0",{
    body:payload.body||"Tienes algo pendiente.",
    icon:"./public/icons/icon-192.png",
    badge:"./public/icons/icon-192.png",
    tag:payload.tag||"plan20-push",
    renotify:true,
    data:{url:payload.url||"./"}
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target=new URL(event.notification.data?.url||"./",self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
      for(const client of clients){
        if("focus" in client){client.navigate(target);return client.focus();}
      }
      if(self.clients.openWindow)return self.clients.openWindow(target);
      return undefined;
    })
  );
});