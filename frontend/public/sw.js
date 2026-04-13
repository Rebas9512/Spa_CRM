// Cache version — bumped automatically by build script (see vite.config.ts)
// When this changes, the activate handler purges all old caches.
const CACHE_VERSION = '__BUILD_HASH__'
const CACHE_NAME = `spa-crm-${CACHE_VERSION}`

// Install: activate immediately (don't wait for old tabs to close)
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Activate: purge all caches except current version
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch strategy — Network First for everything
// Vite content-hashed filenames already guarantee CDN cache efficiency;
// the SW layer is purely for offline resilience, not for speed.
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET (POST/PATCH/DELETE should never be cached)
  if (request.method !== 'GET') return

  // API requests: Network First, cache successful responses for offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // All other requests (HTML, JS, CSS, images): Network First
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return res
      })
      .catch(() => caches.match(request))
  )
})
