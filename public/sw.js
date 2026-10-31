// easy-travel 서비스 워커 — 데이터가 끊겨도 마지막으로 연 화면을 다시 열 수 있게 합니다.
// 화면(HTML)은 항상 네트워크를 먼저 쓰고 실패할 때만 저장본을 씁니다(배포 후 옛 화면이 남지 않게).
// 파일 이름에 해시가 붙는 정적 파일만 저장본을 먼저 씁니다. /api/ 요청은 저장하지 않습니다.
const CACHE = "easy-travel-v1";
const SHELL = ["/traveler", "/guardian", "/", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(() => caches.match(url.pathname).then((cached) => cached || caches.match("/traveler")))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
      )
    );
  }
});
