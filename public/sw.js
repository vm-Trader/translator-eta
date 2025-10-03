self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate" || e.request.destination === "document") {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response("You’re offline – please connect to use the translator.", {
          headers: { "Content-Type": "text/html" }
        })
      )
    );
  }
});