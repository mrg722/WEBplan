// Cache ownership includes the deployment scope (several apps may share an origin).
const CACHE_PREFIX = "plan20-" + encodeURIComponent(self.registration.scope) + "-v";
const CACHE_VERSION = 8;
const CACHE = CACHE_PREFIX + CACHE_VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/data.js",
  "./src/store.js",
  "./src/utils.js",
  "./src/styles.css",
  "./src/notifications.js",
  "./public/icons/icon.svg",
  "./public/icons/icon-192.svg",
  "./public/icons/icon-512.svg"
];
const SHELL_URLS = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    [...SHELL_URLS].map(url => new Request(url, { cache: "reload" }))
  )).then(() => self.skipWaiting()));
  // The client reloads on controllerchange only after the complete new shell exists.
});

self.addEventListener("activate", event => {
  event.waitUntil(
    // Unscoped legacy caches (including v6) have ambiguous ownership; retain them.
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && /^\d+$/.test(k.slice(CACHE_PREFIX.length)) && Number(k.slice(CACHE_PREFIX.length)) < CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      // Keep HTML and modules from the same installed release, online and offline.
      caches.open(CACHE).then(cache => cache.match(INDEX_URL)).then(cached => cached || fetch(event.request))
    );
    return;
  }
  // In particular, never cache same-origin sync endpoints or unrelated apps.
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request)));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const p=event.data.payload||{};
    event.waitUntil(self.registration.showNotification(p.title||"PLAN 2.0",{
      body:p.body||"",
      icon:"./public/icons/icon-192.svg",
      badge:"./public/icons/icon-192.svg",
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
    icon:"./public/icons/icon-192.svg",
    badge:"./public/icons/icon-192.svg",
    tag:payload.tag||"plan20-push",
    renotify:true,
    data:{url:payload.url||"./"}
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  let target = self.registration.scope;
  try {
    const candidate = new URL(event.notification.data?.url || "./", self.registration.scope);
    if (candidate.origin === self.location.origin && candidate.href.startsWith(self.registration.scope)) target = candidate.href;
  } catch {}
  event.waitUntil(
    self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
      for(const client of clients){
        if(client.url?.startsWith(self.registration.scope) && "focus" in client){
          return Promise.resolve(client.navigate(target)).then(navigated => (navigated || client).focus());
        }
      }
      if(self.clients.openWindow)return self.clients.openWindow(target);
      return undefined;
    })
  );
});
