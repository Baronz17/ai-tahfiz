// Service worker AI Tahfiz.
// - Shell aplikasi: stale-while-revalidate (cepat & offline, pembaruan terbawa pada kunjungan berikutnya).
// - API Al-Qur'an: network-first dengan cadangan cache (aplikasi juga menyimpan surah di IndexedDB).
// - Font Google: cache-first.
// Naikkan VERSION setiap rilis agar cache lama dibersihkan.
const VERSION = 'v2.2.0';
const SHELL_CACHE = `ai-tahfiz-shell-${VERSION}`;
const DATA_CACHE = 'ai-tahfiz-data';
const FONT_CACHE = 'ai-tahfiz-fonts';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg', './icon-maskable.svg',
  './js/app.js', './js/api.js', './js/arabic.js', './js/dates.js', './js/db.js', './js/dom.js',
  './js/follow.js', './js/mushaf.js', './js/player.js', './js/progress.js', './js/reader.js', './js/review.js', './js/setoran.js',
  './js/srs.js', './js/state.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ai-tahfiz-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k))))
    .then(() => caches.delete('ai-tahfiz-shell-v1'))
    .then(() => self.clients.claim()));
});

async function put(cacheName, req, res) {
  if (res && res.ok && res.status === 200) {
    const c = await caches.open(cacheName);
    await c.put(req, res);
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const network = fetch(req).then(res => { e.waitUntil(put(SHELL_CACHE, req, res.clone())); return res; });
      if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
      try { return await network; } catch {
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      }
    })());
    return;
  }

  if (url.hostname === 'api.alquran.cloud') {
    e.respondWith(fetch(req)
      .then(res => { e.waitUntil(put(DATA_CACHE, req, res.clone())); return res; })
      .catch(async () => (await caches.match(req)) || Response.error()));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => { e.waitUntil(put(FONT_CACHE, req, res.clone())); return res; })));
  }
  // Audio (cdn.islamic.network) tidak di-cache: pemutar memakai permintaan Range (206) yang tidak bisa disimpan Cache API.
});
