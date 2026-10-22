// Accounts, saved cities and settings.
// Back4App (Parse) is used when config.js has real keys; otherwise a local stand-in keeps
// everything in this browser so the app is fully usable before the backend is set up.
(function () {
  const cfg = window.SKYLOOM_CONFIG || {};
  const b4a = cfg.back4app || {};
  const configured = !!(window.Parse && b4a.appId && !b4a.appId.startsWith("YOUR_") && b4a.jsKey && !b4a.jsKey.startsWith("YOUR_"));
  const DEFAULTS = window.SKYLOOM_DEFAULTS.settings;
  const CITY_FIELDS = ["name", "admin1", "country", "countryCode", "lat", "lon", "tz"];

  const withDefaults = (s) => ({ ...DEFAULTS, ...(s || {}) });

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
    Parse.initialize(b4a.appId, b4a.jsKey);
    Parse.serverURL = b4a.serverURL || "https://parseapi.back4app.com/";
    const City = Parse.Object.extend("City");

    const toUser = (u) => u && { id: u.id, email: u.get("email") || u.get("username"), name: u.get("displayName") || "", settings: withDefaults(u.get("settings")) };
    const toCity = (o) => ({ id: o.id, ...Object.fromEntries(CITY_FIELDS.map((f) => [f, o.get(f)])), order: o.get("order") || 0 });

    return {
      mode: "back4app",
      async current() {
        const u = Parse.User.current();
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
        q.equalTo("owner", Parse.User.current());
        q.ascending("order");
        q.limit(200);
        return (await q.find()).map(toCity);
      },
      async addCity(city, order) {
        const o = new City();
        CITY_FIELDS.forEach((f) => o.set(f, city[f] ?? ""));
        o.set("order", order);
        o.set("owner", Parse.User.current());
        o.setACL(new Parse.ACL(Parse.User.current()));
        await o.save();
        return toCity(o);
      },
      async removeCity(id) {
        const o = new City();
        o.id = id;
        await o.destroy();
      },
      async saveSettings(settings) {
        const u = Parse.User.current();
        u.set("settings", settings);
        await u.save();
      },
      async savePush(subscription, prefs) {
        return Parse.Cloud.run("savePushSubscription", { subscription, ...prefs });
      },
      async removePush(endpoint) {
        return Parse.Cloud.run("removePushSubscription", { endpoint });
      },
      async testPush() {
        return Parse.Cloud.run("sendTestPush");
      },
    };
  }

  // ---------------- Local stand-in ----------------
  function localBackend() {
    const store = {
      get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
      del(k) { try { localStorage.removeItem(k); } catch {} },
    };
    const users = () => store.get("skyloom.users", {});
    const sessionId = () => store.get("skyloom.session", null);
    async function hash(pw, salt) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    const pub = (u) => u && { id: u.id, email: u.email, name: u.name, settings: withDefaults(u.settings) };
    const me = () => Object.values(users()).find((u) => u.id === sessionId());
    const citiesKey = () => `skyloom.cities.${sessionId()}`;

    return {
      mode: "local",
      async current() { return pub(me()); },
      async signUp({ name, email, password }) {
        email = email.toLowerCase();
        const all = users();
        if (all[email]) throw new Error("An account with that email already exists.");
        const salt = crypto.getRandomValues(new Uint32Array(2)).join("");
        const u = { id: `u${Date.now().toString(36)}`, email, name: name || "", salt, hash: await hash(password, salt), settings: withDefaults() };
        all[email] = u;
        store.set("skyloom.users", all);
        store.set("skyloom.session", u.id);
        return pub(u);
      },
      async logIn({ email, password }) {
        const u = users()[email.toLowerCase()];
        if (!u || (await hash(password, u.salt)) !== u.hash) throw new Error("That email and password don't match.");
        store.set("skyloom.session", u.id);
        return pub(u);
      },
      async resetPassword() {
        throw new Error("Password reset emails need Back4App. Connect it in config.js.");
      },
      async logOut() { store.del("skyloom.session"); },
      async listCities() { return store.get(citiesKey(), []); },
      async addCity(city, order) {
        const list = store.get(citiesKey(), []);
        const c = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...Object.fromEntries(CITY_FIELDS.map((f) => [f, city[f] ?? ""])), order };
        list.push(c);
        store.set(citiesKey(), list);
        return c;
      },
      async removeCity(id) { store.set(citiesKey(), store.get(citiesKey(), []).filter((c) => c.id !== id)); },
      async saveSettings(settings) {
        const all = users();
        const u = Object.values(all).find((x) => x.id === sessionId());
        if (u) { u.settings = settings; store.set("skyloom.users", all); }
      },
      async savePush() { return { simulated: true }; },
      async removePush() { return { simulated: true }; },
      async testPush() { return { simulated: true }; },
    };
  }

  window.Backend = configured ? parseBackend() : localBackend();
})();
