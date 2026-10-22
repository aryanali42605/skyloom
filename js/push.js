// Web Push on the client: service worker registration, subscribing, and handing the
// subscription to the backend. Back4App Cloud Code (cloud/main.js) does the sending.
(function () {
  const cfg = window.SKYLOOM_CONFIG || {};
  const vapid = cfg.vapidPublicKey && !cfg.vapidPublicKey.startsWith("YOUR_") ? cfg.vapidPublicKey : null;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let reg = null;

  function keyBytes(base64) {
    const pad = "=".repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function register() {
    if (!("serviceWorker" in navigator)) return null;
    try { reg = await navigator.serviceWorker.register("sw.js"); } catch (e) { console.warn("Service worker failed", e); }
    return reg;
  }

  // Real push needs Back4App + a VAPID key; otherwise we preview notifications on-device.
  const live = () => Backend.mode === "back4app" && !!vapid;

  async function enable(prefs) {
    if (!supported) throw new Error("This browser doesn't support push notifications.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser's site settings.");
    reg = reg || (await register());
    if (!live()) return { simulated: true };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) });
    await Backend.savePush(sub.toJSON(), prefs);
    return { simulated: false };
  }

  async function updatePrefs(prefs) {
    if (!live() || !reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await Backend.savePush(sub.toJSON(), prefs);
  }

  async function disable() {
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    if (sub) {
      if (live()) await Backend.removePush(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  }

  // localDigest is what the backend would send, built on-device for the preview.
  async function test(localDigest) {
    if (!supported) throw new Error("This browser doesn't support notifications.");
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifications are blocked for this site.");
    }
    reg = reg || (await register());
    if (live()) {
      await Backend.testPush();
      return "Sent from Back4App. It should arrive in a few seconds.";
    }
    await (reg || (await navigator.serviceWorker.ready)).showNotification(localDigest.title, {
      body: localDigest.body, icon: "icon.svg", badge: "icon.svg", tag: "skyloom-digest",
    });
    return Backend.mode === "back4app"
      ? "Preview shown on this device. Add your VAPID key to config.js to send real pushes from Back4App."
      : "Preview shown on this device. Connect Back4App for real scheduled pushes.";
  }

  window.Push = { register, enable, disable, updatePrefs, test, supported, live };
})();
