/* ParkWecker Service Worker – kompatibel zur gelieferten index.html
   Strategie:
   - App-Shell (Core) cache-first
   - Sonst: netzwerk-versuch -> bei Erfolg cachen -> sonst Cache-Fallback
*/

const CACHE_NAME = 'parkwecker-v10';
const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install – Core-Dateien cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

// Activate – alte Caches aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Fetch – Cache-first für Core, sonst Netzwerk mit Cache-Fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Nur GET behandeln
  if (request.method !== 'GET') return;

  // Navigation-Requests (index mit Query wie ?quick=30 inkl.)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Versuche aus Netzwerk (neuste Version)
          const net = await fetch(request);
          // Erfolgreiche Antwort im Cache aktualisieren (optional)
          const cache = await caches.open(CACHE_NAME);
          cache.put('./', net.clone());
          return net;
        } catch (e) {
          // Fallback: gecachte App-Shell
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // Für alle anderen GETs: Cache-first, ansonsten Netzwerk -> cachen
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(request);
      if (hit) return hit;

      try {
        const net = await fetch(request);
        // Nur erfolgreiche Antworten cachen
        if (net && net.status === 200 && net.type !== 'opaque') {
          cache.put(request, net.clone());
        }
        return net;
      } catch (e) {
        // Letzter Fallback: evtl. index oder einfache Offline-Antwort
        const shell = await cache.match('./');
        if (shell) return shell;
        return new Response('Offline – keine Verbindung.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
        }
    })()
  );
});
