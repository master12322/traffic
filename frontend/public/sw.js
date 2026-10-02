// Traffic Radar service worker — Phase 4 Web Push.
// Receives push messages from the backend and shows an OS-level notification,
// and focuses/opens the app when the notification is clicked.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_err) {
    data = { body: event.data && event.data.text ? event.data.text() : "" };
  }
  const title = data.title || "🚦 Traffic Radar";
  const options = {
    body: data.body || "Congestion update in your watch area.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: "traffic-radar-jam",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
