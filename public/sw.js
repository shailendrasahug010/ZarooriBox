// Zaroori service worker: makes the installed app open instantly and work offline.
// Pages: network first, falling back to the cached app shell. Built assets (hashed
// file names): cache first. Supabase and other cross-origin calls are never cached.
const VERSION = 'zaroori-v3';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.png', '/logo-mark.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Tapping a notification opens (or focuses) Zaroori. The Done / Tomorrow buttons and
// taps on a single-item reminder go to /app/act, which runs the action in the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.target;
  let url = data.url || '/app';
  if (target && target.kind && target.id) {
    const action = ['done', 'tomorrow'].includes(event.action) ? event.action : 'open';
    url = `/app/act?kind=${encodeURIComponent(target.kind)}&id=${encodeURIComponent(target.id)}&do=${action}`;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes('/app'));
      if (open) return open.navigate(url).then((c) => (c || open).focus()).catch(() => open.focus());
      return self.clients.openWindow(url);
    }),
  );
});
