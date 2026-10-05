import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const scope = "https://example.test/WEBplan/";
const prefix = `plan20-${encodeURIComponent(scope)}-v`;
const current = prefix + "7";

function worker() {
  const listeners = {};
  const stores = new Map();
  const deleted = [];
  const requests = [];
  const opened = [];
  let clients = [];
  let offline = false;
  let failInstall = false;
  let claims = 0;
  let skips = 0;
  const cacheFor = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async addAll(items) {
        requests.push(...items);
        if (failInstall) throw new Error("Incomplete shell");
        for (const request of items) entries.set(request.url, new Response("installed:" + request.url));
      },
      async match(request) { return entries.get(typeof request === "string" ? request : request.url)?.clone(); }
    };
  };
  const self = {
    registration: { scope }, location: { origin: "https://example.test" },
    addEventListener: (type, callback) => { listeners[type] = callback; },
    skipWaiting: async () => { skips++; },
    clients: {
      claim: async () => { claims++; },
      matchAll: async () => clients,
      openWindow: async url => { opened.push(url); }
    }
  };
  vm.runInNewContext(source, {
    self, URL, Request,
    caches: {
      open: async name => cacheFor(name),
      keys: async () => [...stores.keys()],
      delete: async name => { deleted.push(name); return stores.delete(name); }
    },
    fetch: async () => { if (offline) throw new Error("Offline"); return new Response("network failure", { status: 503 }); }
  });
  return {
    stores, deleted, requests, opened,
    setOffline: value => { offline = value; },
    setFailInstall: value => { failInstall = value; },
    setClients: value => { clients = value; },
    claims: () => claims, skips: () => skips,
    async event(type, detail = {}) {
      const pending = [];
      listeners[type]({ ...detail, waitUntil: p => pending.push(p) });
      await Promise.all(pending);
    },
    async fetch(path, { mode = "cors", method = "GET" } = {}) {
      let response;
      listeners.fetch({ request: { url: new URL(path, scope).href, mode, method }, respondWith: p => { response = p; } });
      return response;
    }
  };
}

test("install precaches existing local shell files with HTTP cache bypass", async () => {
  const w = worker();
  await w.event("install");
  assert.ok(w.requests.length >= 12);
  for (const request of w.requests) {
    assert.equal(request.cache, "reload");
    const relative = request.url.slice(scope.length) || "index.html";
    await access(new URL("../" + relative, import.meta.url));
  }
  assert.equal(w.skips(), 0, "updates must wait until previous shell clients close");
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(new URL(manifest.start_url, scope).href, scope);
  assert.equal(new URL(manifest.scope, scope).href, scope);
  for (const icon of manifest.icons) assert.ok(w.requests.some(r => r.url === new URL(icon.src, scope).href));
});

test("incomplete precache rejects installation", async () => {
  const w = worker();
  w.setFailInstall(true);
  await assert.rejects(w.event("install"), /Incomplete shell/);
  assert.equal(w.skips(), 0);
});

test("activation deletes only older version caches owned by this deployment", async () => {
  const w = worker();
  const others = ["unrelated-cache", "plan20-v6", "plan20-v5", prefix + "8", prefix + "metadata", `plan20-${encodeURIComponent("https://example.test/other/")}-v6`];
  for (const name of [current, prefix + "6", ...others]) w.stores.set(name, new Map());
  await w.event("activate");
  assert.deepEqual(w.deleted, [prefix + "6"]);
  for (const name of [current, ...others]) assert.ok(w.stores.has(name), name);
  assert.equal(w.claims(), 1);
});

test("offline reload and notification query use the installed HTML and modules", async () => {
  const w = worker();
  await w.event("install");
  w.setOffline(true);
  for (const path of ["./", "./index.html", "./?date=2026-10-12&task=one"]) {
    const response = await w.fetch(path, { mode: "navigate" });
    assert.equal(await response.text(), "installed:" + scope + "index.html");
  }
  for (const path of ["src/app.js", "src/store.js", "src/utils.js", "src/notifications.js", "src/styles.css"]) {
    assert.equal(await (await w.fetch(path)).text(), "installed:" + scope + path);
  }
});

test("online navigation keeps one shell version and unrelated requests bypass caches", async () => {
  const w = worker();
  await w.event("install");
  assert.equal(await (await w.fetch("./", { mode: "navigate" })).text(), "installed:" + scope + "index.html");
  for (const path of ["api/sync", "/other/app.js", "https://external.test/file.js"]) assert.equal(await w.fetch(path), undefined);
  assert.equal(await w.fetch("src/store.js", { method: "POST" }), undefined);
});

test("cache misses cannot store error responses or fall back to another app cache", async () => {
  const w = worker();
  w.stores.set("unrelated-cache", new Map([[scope + "src/store.js", new Response("wrong app")]]));
  const response = await w.fetch("src/store.js");
  assert.equal(response.status, 503);
  assert.equal(w.stores.get(current).size, 0);
});

test("notification links stay within deployment and do not navigate other app clients", async () => {
  const w = worker();
  w.setClients([{ url: "https://example.test/other/", navigate() { assert.fail("Unrelated tab navigated"); }, focus() { assert.fail("Unrelated tab focused"); } }]);
  for (const [url, expected] of [["./?date=2026-10-12", scope + "?date=2026-10-12"], ["https://external.test/", scope], ["/other/", scope]]) {
    await w.event("notificationclick", { notification: { close() {}, data: { url } } });
    assert.equal(w.opened.at(-1), expected);
  }
});

test("notification click awaits navigation before focusing its own tab", async () => {
  const w = worker();
  const actions = [];
  const client = { url: scope, async navigate(url) { actions.push(url); return client; }, async focus() { actions.push("focus"); } };
  w.setClients([client]);
  await w.event("notificationclick", { notification: { close() {}, data: { url: "./?date=2026-10-05" } } });
  assert.deepEqual(actions, [scope + "?date=2026-10-05", "focus"]);
  assert.deepEqual(w.opened, []);
});
