/**
 * Service worker: makes the installed game open and play offline.
 * - Pages: network first (so updates arrive), falling back to the cached copy.
 * - Everything else from this site: cache first (built files have hashed,
 *   never-changing names), stored as it's fetched.
 * - The page reports the files it's using; older cached builds are pruned.
 */
const CACHE = 'ssk-v3';
const CORE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // "Is there a newer build?" checks must reach the network, not this cache.
  if (req.cache === 'no-store') return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./', { ignoreVary: true })),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

/** The page sends the URLs of its current build: cache any missing, drop old builds' files. */
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.type === 'files' ? event.data.urls : null;
  if (!Array.isArray(urls)) return;
  const keep = new Set([...urls, ...CORE.map((u) => new URL(u, self.registration.scope).href)]);
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await Promise.all(
        urls.map((u) =>
          c.match(u, { ignoreVary: true }).then((hit) => hit || c.add(u).catch(() => undefined)),
        ),
      );
      for (const req of await c.keys()) {
        if (/\/assets\//.test(req.url) && !keep.has(req.url)) await c.delete(req);
      }
    }),
  );
});
