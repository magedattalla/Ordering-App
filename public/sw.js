const SHELL_CACHE = "order-shell-v2-2";
const SHELL = ["/", "/manifest.webmanifest", "/icons/app-icon.svg", "/icons/app-icon-192.png", "/icons/app-icon-512.png"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") { event.respondWith(fetch(request).catch(() => caches.match("/"))); return; }
  if (!["script", "style", "image", "font", "manifest"].includes(request.destination)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok && response.type === "basic") { const copy = response.clone(); event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))); } return response; })));
});
