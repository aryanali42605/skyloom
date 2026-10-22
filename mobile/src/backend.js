// Accounts, saved cities and settings — same Back4App classes as the web app, so data syncs.
// With placeholder keys in config.js a local stand-in keeps everything on this phone.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Parse from "parse/react-native.js";
import { BACK4APP } from "./config";
import { DEFAULT_SETTINGS } from "./defaults";

const configured = !!(BACK4APP.appId && !BACK4APP.appId.startsWith("YOUR_") && BACK4APP.jsKey && !BACK4APP.jsKey.startsWith("YOUR_"));
const CITY_FIELDS = ["name", "admin1", "country", "countryCode", "lat", "lon", "tz"];
const withDefaults = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });

function friendly(err) {
  const map = {
    101: "That email and password don't match.",
    125: "That doesn't look like a valid email.",
    202: "An account with that email already exists.",
    203: "An account with that email already exists.",
    205: "No account uses that email.",
    100: "Can't reach Back4App. Check your connection.",
    209: "Your session expired. Please log in again.",
  };
  return new Error(map[err && err.code] || (err && err.message) || "Something went wrong.");
}

// ---------------- Back4App / Parse ----------------
function parseBackend() {
  Parse.setAsyncStorage(AsyncStorage);
  Parse.initialize(BACK4APP.appId, BACK4APP.jsKey);
  Parse.serverURL = BACK4APP.serverURL;
  const City = Parse.Object.extend("City");
  const toUser = (u) => u && { id: u.id, email: u.get("email") || u.get("username"), name: u.get("displayName") || "", settings: withDefaults(u.get("settings")) };
  const toCity = (o) => ({ id: o.id, ...Object.fromEntries(CITY_FIELDS.map((f) => [f, o.get(f)])), order: o.get("order") || 0 });

  return {
    mode: "back4app",
    async current() {
      const u = await Parse.User.currentAsync();
      if (!u) return null;
      try { await u.fetch(); } catch (e) { if (e.code === 209) { await Parse.User.logOut().catch(() => {}); return null; } }
      return toUser(u);
    },
    async signUp({ name, email, password }) {
      const u = new Parse.User();
      u.set("username", email.toLowerCase());
      u.set("email", email.toLowerCase());
      u.set("password", password);
      u.set("displayName", name || "");
      u.set("settings", withDefaults());
      try { await u.signUp(); } catch (e) { throw friendly(e); }
      return toUser(u);
    },
    async logIn({ email, password }) {
      try { return toUser(await Parse.User.logIn(email.toLowerCase(), password)); } catch (e) { throw friendly(e); }
    },
    async resetPassword(email) {
      try { await Parse.User.requestPasswordReset(email.toLowerCase()); } catch (e) { throw friendly(e); }
    },
    async logOut() { await Parse.User.logOut().catch(() => {}); },
    async listCities() {
      const q = new Parse.Query(City);
      q.equalTo("owner", await Parse.User.currentAsync());
      q.ascending("order");
      q.limit(200);
      return (await q.find()).map(toCity);
    },
    async addCity(city, order) {
      const me = await Parse.User.currentAsync();
      const o = new City();
      CITY_FIELDS.forEach((f) => o.set(f, city[f] ?? ""));
      o.set("order", order);
      o.set("owner", me);
      o.setACL(new Parse.ACL(me));
      await o.save();
      return toCity(o);
    },
    async removeCity(id) {
      const o = new City();
      o.id = id;
      await o.destroy();
    },
    async saveSettings(settings) {
      const u = await Parse.User.currentAsync();
      u.set("settings", settings);
      await u.save();
    },
    savePush: (params) => Parse.Cloud.run("savePushSubscription", params),
    removePush: (params) => Parse.Cloud.run("removePushSubscription", params),
    testPush: () => Parse.Cloud.run("sendTestPush"),
  };
}

// ---------------- Local stand-in ----------------
// Only for trying the app before Back4App is connected; the password check is a simple
// salted hash and the data never leaves the phone.
function localBackend() {
  const get = async (k, d) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const set = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {});
  const hash = (pw, salt) => {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let r = 0; r < 500; r++) for (const ch of salt + pw + r) { h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619); h2 = Math.imul(h2 ^ h1, 2246822507); }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  };
  const pub = (u) => u && { id: u.id, email: u.email, name: u.name, settings: withDefaults(u.settings) };
  const session = () => get("skyloom.session", null);
  const citiesKey = async () => `skyloom.cities.${await session()}`;

  return {
    mode: "local",
    async current() {
      const id = await session();
      return pub(Object.values(await get("skyloom.users", {})).find((u) => u.id === id));
    },
    async signUp({ name, email, password }) {
      email = email.toLowerCase();
      const all = await get("skyloom.users", {});
      if (all[email]) throw new Error("An account with that email already exists.");
      const salt = Math.random().toString(36).slice(2);
      const u = { id: `u${Date.now().toString(36)}`, email, name: name || "", salt, hash: hash(password, salt), settings: withDefaults() };
      all[email] = u;
      await set("skyloom.users", all);
      await set("skyloom.session", u.id);
      return pub(u);
    },
    async logIn({ email, password }) {
      const u = (await get("skyloom.users", {}))[email.toLowerCase()];
      if (!u || hash(password, u.salt) !== u.hash) throw new Error("That email and password don't match.");
      await set("skyloom.session", u.id);
      return pub(u);
    },
    async resetPassword() { throw new Error("Password reset emails need Back4App. Add your keys to src/config.js."); },
    async logOut() { await AsyncStorage.removeItem("skyloom.session").catch(() => {}); },
    async listCities() { return get(await citiesKey(), []); },
    async addCity(city, order) {
      const key = await citiesKey();
      const list = await get(key, []);
      const c = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...Object.fromEntries(CITY_FIELDS.map((f) => [f, city[f] ?? ""])), order };
      list.push(c);
      await set(key, list);
      return c;
    },
    async removeCity(id) {
      const key = await citiesKey();
      await set(key, (await get(key, [])).filter((c) => c.id !== id));
    },
    async saveSettings(settings) {
      const all = await get("skyloom.users", {});
      const id = await session();
      const u = Object.values(all).find((x) => x.id === id);
      if (u) { u.settings = settings; await set("skyloom.users", all); }
    },
    savePush: async () => ({ simulated: true }),
    removePush: async () => ({ simulated: true }),
    testPush: async () => ({ simulated: true }),
  };
}

export const Backend = configured ? parseBackend() : localBackend();
