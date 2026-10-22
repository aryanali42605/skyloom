// Skyloom - Back4App Cloud Code
// Serves both apps: the web app (Web Push, VAPID) and the Expo mobile app (Expo push service).
// Deploy this folder (main.js + package.json + vapid.js) from Back4App > Cloud Code > Functions & Web Hosting.
// The web app's pushes need VAPID keys: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// They are read from environment variables when the host offers them, otherwise from vapid.js
// (made by `node make-vapid.js`, uploaded only to Back4App's cloud folder, never committed).
// Then schedule the "skyloomDigest" job to run every hour (Cloud Code > Jobs > Scheduled Jobs).

const webpush = require("web-push");

function vapidKeys() {
  let file = {};
  try { file = require("./vapid.js"); } catch (e) {}
  const pick = (k) => process.env[k] || file[k];
  return { VAPID_PUBLIC_KEY: pick("VAPID_PUBLIC_KEY"), VAPID_PRIVATE_KEY: pick("VAPID_PRIVATE_KEY"), VAPID_SUBJECT: pick("VAPID_SUBJECT") };
}

let vapidReady = false;
function vapid() {
  if (vapidReady) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = vapidKeys();
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Parse.Error(141, "VAPID keys are missing: upload cloud/vapid.js to Back4App's cloud folder.");
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
}

// ---------- Cities: always owned by, and visible only to, the user who saved them ----------
Parse.Cloud.beforeSave("City", (req) => {
  if (req.master) return;
  if (!req.user) throw new Parse.Error(209, "Log in to save cities.");
  const city = req.object;
  if (city.isNew()) {
    city.set("owner", req.user);
    city.setACL(new Parse.ACL(req.user));
  } else if (city.get("owner") && city.get("owner").id !== req.user.id) {
    throw new Parse.Error(119, "That city belongs to someone else.");
  }
  const lat = city.get("lat"), lon = city.get("lon");
  if (typeof lat !== "number" || typeof lon !== "number" || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Parse.Error(142, "A city needs valid coordinates.");
  }
});

// ---------- Weather helpers ----------
const CODES = {
  0: ["Clear", "\u2600\ufe0f"], 1: ["Mostly clear", "\ud83c\udf24\ufe0f"], 2: ["Partly cloudy", "\u26c5"], 3: ["Overcast", "\u2601\ufe0f"],
  45: ["Fog", "\ud83c\udf2b\ufe0f"], 48: ["Freezing fog", "\ud83c\udf2b\ufe0f"], 51: ["Drizzle", "\ud83c\udf26\ufe0f"], 53: ["Drizzle", "\ud83c\udf26\ufe0f"], 55: ["Drizzle", "\ud83c\udf27\ufe0f"],
  56: ["Freezing drizzle", "\ud83c\udf27\ufe0f"], 57: ["Freezing drizzle", "\ud83c\udf27\ufe0f"], 61: ["Light rain", "\ud83c\udf26\ufe0f"], 63: ["Rain", "\ud83c\udf27\ufe0f"],
  65: ["Heavy rain", "\ud83c\udf27\ufe0f"], 66: ["Freezing rain", "\ud83c\udf27\ufe0f"], 67: ["Freezing rain", "\ud83c\udf27\ufe0f"], 71: ["Light snow", "\ud83c\udf28\ufe0f"],
  73: ["Snow", "\ud83c\udf28\ufe0f"], 75: ["Heavy snow", "\u2744\ufe0f"], 77: ["Snow grains", "\ud83c\udf28\ufe0f"], 80: ["Showers", "\ud83c\udf26\ufe0f"], 81: ["Showers", "\ud83c\udf27\ufe0f"],
  82: ["Violent showers", "\u26c8\ufe0f"], 85: ["Snow showers", "\ud83c\udf28\ufe0f"], 86: ["Snow showers", "\u2744\ufe0f"], 95: ["Thunderstorm", "\u26c8\ufe0f"],
  96: ["Storm with hail", "\u26c8\ufe0f"], 99: ["Storm with hail", "\u26c8\ufe0f"],
};
const describe = (code) => CODES[code] || CODES[3];
const fmtTemp = (c, unit) => Math.round(unit === "F" ? c * 9 / 5 + 32 : c);

async function weatherFor(city) {
  const res = await Parse.Cloud.httpRequest({
    url: "https://api.open-meteo.com/v1/forecast",
    params: {
      latitude: city.get("lat"),
      longitude: city.get("lon"),
      current: "temperature_2m,weather_code,apparent_temperature",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      hourly: "weather_code,temperature_2m,apparent_temperature",
      forecast_hours: 12,
      forecast_days: 1,
      timezone: "auto",
    },
  });
  const j = res.data;
  return {
    name: city.get("name"),
    temp: j.current.temperature_2m,
    code: j.current.weather_code,
    max: j.daily.temperature_2m_max[0],
    min: j.daily.temperature_2m_min[0],
    pop: j.daily.precipitation_probability_max[0] || 0,
    next: j.hourly.weather_code.map((code, i) => ({ code, temp: j.hourly.temperature_2m[i], feels: j.hourly.apparent_temperature[i] })),
  };
}

async function citiesOf(user) {
  const q = new Parse.Query("City");
  q.equalTo("owner", user);
  q.ascending("order");
  q.limit(20);
  return q.find({ useMasterKey: true });
}

// Spot the things worth interrupting someone for in the next 12 hours.
function alertsFrom(reports, unit) {
  const out = [];
  for (const r of reports) {
    if (r.next.some((h) => h.code >= 95)) out.push(`\u26a1 Thunderstorms expected in ${r.name}`);
    else if (r.next.some((h) => [65, 67, 75, 82, 86].includes(h.code))) out.push(`\ud83c\udf27\ufe0f Heavy ${r.next.some((h) => [75, 86].includes(h.code)) ? "snow" : "rain"} on the way in ${r.name}`);
    const hot = Math.max(...r.next.map((h) => h.feels));
    const cold = Math.min(...r.next.map((h) => h.feels));
    if (hot >= 38) out.push(`\ud83d\udd25 Extreme heat in ${r.name}: feels like ${fmtTemp(hot, unit)}\u00b0`);
    if (cold <= -20) out.push(`\ud83e\udd76 Dangerous cold in ${r.name}: feels like ${fmtTemp(cold, unit)}\u00b0`);
  }
  return out;
}

async function buildDigest(user, unit) {
  const cities = await citiesOf(user);
  if (!cities.length) return { title: "Skyloom", body: "Your loom is empty. Add a city to start getting sky digests.", alerts: [] };
  const reports = (await Promise.all(cities.slice(0, 8).map((c) => weatherFor(c).catch(() => null)))).filter(Boolean);
  const lines = reports.map((r) => `${describe(r.code)[1]} ${r.name} ${fmtTemp(r.temp, unit)}\u00b0 (${fmtTemp(r.min, unit)}-${fmtTemp(r.max, unit)}\u00b0)`);
  const alerts = alertsFrom(reports, unit);
  const wettest = reports.reduce((a, b) => (b.pop > (a ? a.pop : -1) ? b : a), null);
  const tip = wettest && wettest.pop >= 60 ? ` \u00b7 \u2614 Umbrella day in ${wettest.name}` : "";
  return {
    title: alerts.length ? alerts[0] : "Good morning from Skyloom",
    body: lines.join(" \u00b7 ") + tip,
    alerts,
  };
}

async function sendExpo(sub, payload) {
  const res = await Parse.Cloud.httpRequest({
    method: "POST",
    url: "https://exp.host/--/api/v2/push/send",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: [{ to: sub.get("expoToken"), title: payload.title, body: payload.body, sound: "default", data: { tag: payload.tag } }],
  });
  const ticket = (res.data && res.data.data && res.data.data[0]) || {};
  if (ticket.status === "error") {
    // The app was uninstalled or the token rotated; forget it.
    if (ticket.details && ticket.details.error === "DeviceNotRegistered") await sub.destroy({ useMasterKey: true });
    else console.error("Expo push failed", ticket.message);
    return false;
  }
  return true;
}

async function send(sub, payload) {
  try {
    if (sub.get("kind") === "expo") return await sendExpo(sub, payload);
    vapid();
    await webpush.sendNotification({ endpoint: sub.get("endpoint"), keys: sub.get("keys") }, JSON.stringify(payload), { TTL: 3600 });
    return true;
  } catch (e) {
    // 404/410 mean the browser threw the subscription away; forget it.
    if (e.statusCode === 404 || e.statusCode === 410) await sub.destroy({ useMasterKey: true });
    else console.error("Push failed", e.statusCode || e.code, e.body || e.message);
    return false;
  }
}

function localParts(timezone) {
  const tz = timezone || "UTC";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour };
}

// ---------- Functions called by the app ----------
// The web app sends { subscription } (Web Push); the mobile app sends { expoToken }.
Parse.Cloud.define("savePushSubscription", async (req) => {
  if (!req.user) throw new Parse.Error(209, "Log in first.");
  const { subscription, expoToken, notify = true, notifyHour = 7, alerts = true, temp = "C", timezone = "UTC" } = req.params;
  const isExpo = typeof expoToken === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(expoToken);
  if (!isExpo && (!subscription || !subscription.endpoint || !subscription.keys)) throw new Parse.Error(142, "Missing push subscription.");
  const q = new Parse.Query("PushSub");
  if (isExpo) q.equalTo("expoToken", expoToken);
  else q.equalTo("endpoint", subscription.endpoint);
  const sub = (await q.first({ useMasterKey: true })) || new Parse.Object("PushSub");
  sub.set({ user: req.user, kind: isExpo ? "expo" : "web", notify: !!notify, notifyHour: Math.max(0, Math.min(23, +notifyHour)), alerts: !!alerts, temp, timezone });
  if (isExpo) sub.set("expoToken", expoToken);
  else sub.set({ endpoint: subscription.endpoint, keys: subscription.keys });
  sub.setACL(new Parse.ACL()); // master key only
  await sub.save(null, { useMasterKey: true });
  return { ok: true };
}, { requireUser: true });

Parse.Cloud.define("removePushSubscription", async (req) => {
  const q = new Parse.Query("PushSub");
  if (req.params.expoToken) q.equalTo("expoToken", req.params.expoToken);
  else q.equalTo("endpoint", req.params.endpoint);
  q.equalTo("user", req.user);
  const sub = await q.first({ useMasterKey: true });
  if (sub) await sub.destroy({ useMasterKey: true });
  return { ok: true };
}, { requireUser: true });

Parse.Cloud.define("sendTestPush", async (req) => {
  const q = new Parse.Query("PushSub");
  q.equalTo("user", req.user);
  const subs = await q.find({ useMasterKey: true });
  if (!subs.length) throw new Parse.Error(141, "Turn on the daily digest first so this device is registered.");
  const unit = (req.user.get("settings") || {}).temp || "C";
  const d = await buildDigest(req.user, unit);
  let sent = 0;
  for (const s of subs) if (await send(s, { title: `\ud83e\uddea ${d.title}`, body: d.body, tag: "skyloom-test" })) sent++;
  return { sent };
}, { requireUser: true });

// ---------- Hourly job: digests at each user's chosen local hour, plus same-day alerts ----------
Parse.Cloud.job("skyloomDigest", async (req) => {
  const q = new Parse.Query("PushSub");
  q.equalTo("notify", true);
  q.include("user");
  q.limit(1000);
  const subs = await q.find({ useMasterKey: true });
  let digests = 0, alerts = 0;
  const cache = new Map(); // one weather lookup per user per run

  for (const sub of subs) {
    const user = sub.get("user");
    if (!user) { await sub.destroy({ useMasterKey: true }); continue; }
    const { day, hour } = localParts(sub.get("timezone"));
    const dueDigest = hour === sub.get("notifyHour") && sub.get("lastDigestDay") !== day;
    const mayAlert = sub.get("alerts") && sub.get("lastAlertDay") !== day && hour >= 6 && hour <= 22;
    if (!dueDigest && !mayAlert) continue;

    const key = `${user.id}:${sub.get("temp")}`;
    if (!cache.has(key)) cache.set(key, await buildDigest(user, sub.get("temp")));
    const d = cache.get(key);

    if (dueDigest) {
      if (await send(sub, { title: d.title, body: d.body, tag: "skyloom-digest" })) {
        sub.set("lastDigestDay", day);
        if (d.alerts.length) sub.set("lastAlertDay", day);
        digests++;
      }
    } else if (mayAlert && d.alerts.length) {
      if (await send(sub, { title: d.alerts[0], body: d.alerts.slice(1).join(" \u00b7 ") || "Open Skyloom for the details.", tag: "skyloom-alert" })) {
        sub.set("lastAlertDay", day);
        alerts++;
      }
    }
    if (sub.dirty()) await sub.save(null, { useMasterKey: true });
  }
  const msg = `Sent ${digests} digests and ${alerts} alerts to ${subs.length} subscriptions.`;
  req.message(msg);
  return msg;
});
