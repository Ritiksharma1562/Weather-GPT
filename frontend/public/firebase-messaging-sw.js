self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { return; }
  const notification = payload.notification || {};
  event.waitUntil(self.registration.showNotification(notification.title || "WeatherGPT alert", {
    body: notification.body || "Open WeatherGPT for details.",
    icon: "/icon.svg", tag: payload.data?.alert_id || "weather-alert",
    data: { url: "/alerts" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    const existing = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (existing) { existing.navigate("/alerts"); return existing.focus(); }
    return clients.openWindow("/alerts");
  }));
});
