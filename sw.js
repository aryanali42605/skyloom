// Skyloom service worker: receives pushes from Back4App and keeps the app shell available offline.
const CACHE = "skyloom-v1";
const SHELL = ["./", "index.html", "styles.css", "config.js", "defaults.js", "js/weather.js", "js/sky.js", "js/backend.js", "js/push.js", "js/app.js", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  // Cache each file on its own so one missing file (e.g. an icon the host rejected) can't block install.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((f) => c.add(f)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first for our own files, so updates show immediately; cache when offline.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || "Skyloom", {
      body: data.body || "Your skies have changed.",
      icon: "icon.svg",
      badge: "icon.svg",
      tag: data.tag || "skyloom",
      data: { url: data.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(target);
    })
  );
});
