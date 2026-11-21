/* SunuCampus service worker (generated at build time from frontend/pwa/sw-template.js). */
const VERSION = '__VERSION__';
const PRECACHE = `sunucampus-shell-${VERSION}`;
const RUNTIME = 'sunucampus-media';
// The app shell: index.html, the built JS/CSS/fonts, icons and intro photos.
const PRECACHE_URLS = __PRECACHE_URLS__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sunucampus-shell-') && k !== PRECACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data is never cached: the API and the realtime connection always go to the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // Pages: try the network, fall back to the cached app shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(PRECACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Built files have hashed names and never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((res) => putIn(PRECACHE, request, res))));
    return;
  }

  // Photos and other media: show the cached copy straight away, refresh it in the background.
  if (/^\/(uploads|intro|brand)\//.test(url.pathname) || /\.(png|jpe?g|webp|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit ?? network;
      }),
    );
  }
});

function putIn(cacheName, request, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(request, copy));
  }
  return res;
}
