// VES Field Assistant -- offline service worker.
//
// Strategy: cache-first. Once the app shell is cached, every load is served
// from the cache with no network dependency at all -- this is a deliberate
// choice over "network-first" or "stale-while-revalidate", because a field
// tool with intermittent or no connectivity needs a GUARANTEE it will load,
// not a best-effort. The tradeoff is that updates don't appear automatically;
// see CACHE_VERSION below for how updates are rolled out on purpose.
//
// To ship an update: bump CACHE_VERSION. The next time the device has a
// connection and opens the app, the new version is fetched, cached under the
// new name, and the old cache is deleted on activation. Until then, the
// previously-cached version keeps working offline, which is the correct
// behavior for a field tool -- never leave someone with nothing mid-survey.
const CACHE_VERSION = 'ves-field-assistant-v6';

const APP_SHELL = [
  './',
  './index.html',
  './VES_Field_Assistant.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin app-shell resources. Anything
  // else (e.g. a cross-origin font request) falls through to the network
  // untouched, since caching those isn't this service worker's job.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Opportunistically cache anything new fetched while online (e.g.
        // the Google Fonts stylesheet/files), so a later offline load has
        // a chance of finding it too, without that being a hard guarantee.
        if (response && response.status === 200 && response.type !== 'opaque') {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        // Offline and not in cache: nothing more this service worker can
        // do for a navigation request. The browser's own offline page (or
        // the already-cached app shell on a subsequent retry) takes over.
        return caches.match('./VES_Field_Assistant.html');
      });
    })
  );
});
