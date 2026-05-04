// BagrutAI Service Worker — handles notifications + offline cache
const VERSION = "v1";
const CACHE_NAME = "bagrutai-" + VERSION;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Handle scheduled notifications via message
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "show-reminder") {
    self.registration.showNotification(
      event.data.title || "BagrutAI - זמן ללמוד!",
      {
        body: event.data.body || "הגיע הזמן ללמוד למבחן הבגרות שלך 📚",
        icon: event.data.icon || "/favicon.svg",
        badge: "/favicon.svg",
        tag: event.data.tag || "bagrutai-reminder",
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: { url: event.data.url || "/app.html" },
      }
    );
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windows) => {
      const open = windows.find((c) => c.url.includes(url));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })
  );
});

// Push notification handler (for future server-sent push)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "BagrutAI", body: event.data?.text() || "תזכורת חדשה" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "BagrutAI", {
      body: data.body || "זמן ללמוד!",
      icon: data.icon || "/favicon.svg",
      badge: "/favicon.svg",
      tag: data.tag || "bagrutai-push",
      vibrate: [200, 100, 200],
    })
  );
});
