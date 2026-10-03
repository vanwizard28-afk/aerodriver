/* AeroDriver service worker — offline app shell + flight API fallback */
const VERSION = "v1";
const STATIC_CACHE = `aerodriver-static-${VERSION}`;
const PAGE_CACHE = `aerodriver-pages-${VERSION}`;
const API_CACHE = `aerodriver-api-${VERSION}`;
const ALL_CACHES = [STATIC_CACHE, PAGE_CACHE, API_CACHE];
const API_CACHE_LIMIT = 50;

const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGE_CACHE);
      await pages.add("/");
      // Precache the hashed build assets referenced by the shell HTML so the
      // app still boots offline on the very first reload after install.
      try {
        const res = await pages.match("/");
        const html = await res.text();
        const assetUrls = [
          ...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g),
        ].map((m) => m[1]);
        const statics = await caches.open(STATIC_CACHE);
        await Promise.allSettled([
          ...assetUrls.map((u) => statics.add(u)),
          ...PRECACHE_URLS.slice(1).map((u) => pages.add(u)),
        ]);
      } catch {}
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
};

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) {
      await cache.put(request, res.clone());
      const keys = await cache.keys();
      if (keys.length > API_CACHE_LIMIT) await cache.delete(keys[0]);
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ found: false, error: "Offline" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Flight telemetry: fresh data when possible, last known when offline.
  if (url.pathname.startsWith("/api/flight/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Page navigations: network-first, fall back to the cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () =>
          (await caches.match(request)) || (await caches.match("/")) || Response.error()
        )
    );
    return;
  }

  // Hashed build assets + icons are immutable — cache-first is safe.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.endsWith(".png")
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});
