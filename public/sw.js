// Jednoduchý service worker: aplikace se po prvním načtení otevře i bez signálu.
const CACHE = 'prasous-shell-v2';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // data jdou vždy přímo
  e.respondWith(
    fetch(req, req.mode === 'navigate' ? { cache: 'no-cache' } : undefined) // stránka se vždy ověří na serveru, ať se neukazuje stará verze
      .then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('gstatic') || url.hostname.includes('googleapis'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
