importScripts("./app-version.js");

const CACHE_NAME = "renovo-static-" + String(self.RENOVO_APP_VERSION || "dev");
const RENOVO_PLUS_URL = new URL("./renovo-plus/", self.registration.scope);
const APP_SHELL = [
  "./",
  "./index.html",
  "./instalar.html",
  "./visitantes.html",
  "./app-version.js",
  "./styles.css",
  "./script.js",
  "./firebase-db.js",
  "./pwa-install.js",
  "./manifest.webmanifest",
  "./entrada renovo.png",
  "./icon.png",
  "./pwa-192.png",
  "./pwa-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isRootLegacyApp = isSameOrigin && (
    requestUrl.pathname === new URL("./", self.registration.scope).pathname
    || requestUrl.pathname === new URL("./index.html", self.registration.scope).pathname
  );
  const isIsolatedV2Route = isSameOrigin && (
    requestUrl.pathname.includes("/renovo-plus/")
    || /\/plus(\/|$)/.test(requestUrl.pathname)
  );

  if (request.mode === "navigate" && isRootLegacyApp) {
    event.respondWith(Response.redirect(RENOVO_PLUS_URL.href, 302));
    return;
  }

  // The Renovo+ route is evolving separately from the V1 PWA.
  // Let the browser fetch it directly so the root SW does not pin old JS/CSS.
  if (isIsolatedV2Route) {
    return;
  }

  const isNavigation = request.mode === "navigate";
  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("./index.html"))
    );
    return;
  }

  const isHtml = request.url.endsWith(".html") || request.url.endsWith("/");
  if (isHtml && isSameOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: isSameOrigin }).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && isSameOrigin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (!isSameOrigin) {
            return Response.error();
          }

          return caches.match(request, { ignoreSearch: true }).then((asset) => asset || Response.error());
        });
    })
  );
});
