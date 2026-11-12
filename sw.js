// TAPJERR.io service worker — offline app shell (stale-while-revalidate for same-origin assets).
const VERSION = 'tapjerr-v1.0.0';
const SHELL = ['./', 'index.html', 'admin.html', 'order.html', 'kitchen.html', 'css/base.css', 'css/admin.css', 'css/customer.css', 'assets/icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache Firebase / Google APIs — realtime data must always be live.
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  // Clean customer URLs (/order/table/01, /order/takeaway) → order.html
  if (req.mode === 'navigate' && url.pathname.startsWith(scope.pathname + 'order/')) {
    e.respondWith(fetch(req).catch(() => caches.match('order.html')));
    return;
  }
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
