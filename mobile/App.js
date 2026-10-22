// Skyloom for phones: the main screen, app state, and wiring between sky, backend and push.
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif";
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, useFonts } from "@expo-google-fonts/manrope";
import { LinearGradient } from "expo-linear-gradient";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, View, useColorScheme } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Backend } from "./src/backend";
import { DEFAULT_SETTINGS, REFRESH_MINUTES, STARTER_CITIES } from "./src/defaults";
import { disablePush, enablePush, testPush, updatePushPrefs } from "./src/push";
import { THEMES, ThemeContext, FONTS } from "./src/theme";
import * as W from "./src/weather";
import Sky from "./src/components/Sky";
import { CountryBadge, DriftSlider, Glass, Icon, IconButton, T } from "./src/components/ui";
import { Daily, Details, Hourly, SunArc, Twins, Wear } from "./src/components/Panels";
import Auth, { Mark } from "./src/screens/Auth";
import AddCity from "./src/screens/AddCity";
import Settings from "./src/screens/Settings";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Before login the sky shows the phone's own local time.
const ambient = () => ({ code: 1, cloud: 15, wind: 8, t: Date.now() - new Date().getTimezoneOffset() * 60000 });

function at(w, i) {
  if (i === 0) return { ...w.current, pop: w.hourly[0]?.pop ?? 0 };
  return w.hourly[Math.min(i, w.hourly.length - 1)];
}
function dayOf(w, t) {
  const day = Math.floor(t / 86400000);
  return w.daily.find((d) => Math.floor(d.t / 86400000) === day) || w.daily[0];
}

function useToast() {
  const [msg, setMsg] = useState("");
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef();
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(timer.current);
    Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    timer.current = setTimeout(() => Animated.timing(op, { toValue: 0, duration: 300, useNativeDriver: true }).start(), 3800);
  }, []);
  return [show, msg, op];
}

function Main() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const [toast, toastMsg, toastOp] = useToast();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [cities, setCities] = useState([]);
  const [weather, setWeather] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [drift, setDrift] = useState(0);
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);
  const scroller = useRef();

  const themeName = settings.theme === "auto" ? (scheme === "light" ? "paper" : "aurora") : settings.theme;
  const base = THEMES[themeName];
  const city = cities.find((c) => c.id === activeId);
  const w = city && weather[city.id];
  const c = w && at(w, drift);
  const theme = settings.aura && c ? { ...base, aura: W.tempColor(c.temp), aura2: W.tempColor(c.temp + 12) } : base;

  const loadWeather = useCallback(async (list) => {
    const results = await Promise.all(list.map((ct) => W.forecast(ct).then((f) => [ct.id, f]).catch(() => null)));
    setWeather((prev) => ({ ...prev, ...Object.fromEntries(results.filter(Boolean)) }));
  }, []);

  async function enter(u, isNew) {
    if (isNew) {
      for (const [i, sc] of STARTER_CITIES.entries()) await Backend.addCity(sc, i);
      toast(`Welcome${u.name ? `, ${u.name}` : ""}! We started your loom with three very different skies.`);
    }
    setUser(u);
    setSettings(u.settings);
    const list = await Backend.listCities();
    setCities(list);
    setActiveId(list[0]?.id ?? null);
    loadWeather(list);
  }

  useEffect(() => {
    (async () => {
      try { const u = await Backend.current(); if (u) await enter(u, false); } catch {}
      setBooting(false);
    })();
  }, []);

  // Refresh weather on an interval and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => loadWeather(cities), REFRESH_MINUTES * 60000);
    const clock = setInterval(() => tick((n) => n + 1), 60000);
    const sub = AppState.addEventListener("change", (st) => st === "active" && loadWeather(cities));
    return () => { clearInterval(id); clearInterval(clock); sub.remove(); };
  }, [user, cities]);

  const pushPrefs = (s) => ({ notify: s.notify, notifyHour: s.notifyHour, alerts: s.alerts, temp: s.temp, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });

  const saveTimer = useRef();
  function changeSettings(next) {
    setSettings(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await Backend.saveSettings(next);
        if (next.notify) await updatePushPrefs(pushPrefs(next));
      } catch (e) { toast(`Couldn't save settings: ${e.message}`); }
    }, 400);
  }

  // Settings is a modal, so its feedback uses alerts (a toast would sit underneath it).
  async function toggleNotify(on) {
    const next = { ...settings, notify: on };
    try {
      if (on) {
        const r = await enablePush(pushPrefs(next));
        Alert.alert("Daily digest on", r.simulated ? "Preview mode: connect Back4App for scheduled pushes." : `See you at ${String(next.notifyHour).padStart(2, "0")}:00.`);
      } else {
        await disablePush();
      }
      changeSettings(next);
    } catch (e) {
      changeSettings({ ...settings, notify: false });
      Alert.alert("Notifications", e.message);
    }
  }

  function localDigest() {
    const lines = cities.filter((ct) => weather[ct.id]).slice(0, 6).map((ct) => {
      const cw = weather[ct.id];
      return `${W.describe(cw.current.code, cw.current.isDay).icon} ${ct.name} ${W.temp(cw.current.temp, settings)}°`;
    });
    const stormy = cities.find((ct) => weather[ct.id]?.hourly.slice(0, 12).some((h) => h.code >= 95));
    return { title: stormy ? `⚡ Storm watch for ${stormy.name}` : "Skyloom · your skies right now", body: lines.join("  ·  ") || "Add a city to get your first digest." };
  }

  function select(id) {
    setActiveId(id);
    setDrift(0);
    scroller.current?.scrollTo({ y: 0, animated: true });
  }

  async function addCity(place) {
    const dupe = cities.find((ct) => Math.abs(ct.lat - place.lat) < 0.05 && Math.abs(ct.lon - place.lon) < 0.05);
    setAdding(false);
    if (dupe) { select(dupe.id); toast(`${dupe.name} is already in your loom.`); return; }
    try {
      const order = cities.reduce((m, ct) => Math.max(m, ct.order || 0), -1) + 1;
      const added = await Backend.addCity(place, order);
      setCities((prev) => [...prev, added]);
      select(added.id);
      toast(`${added.name} woven into your loom.`);
      loadWeather([added]);
    } catch (e) { toast(e.message); }
  }

  function removeCity(ct) {
    Alert.alert(`Remove ${ct.name}?`, "It will disappear from your loom on every device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          try {
            await Backend.removeCity(ct.id);
            const rest = cities.filter((x) => x.id !== ct.id);
            setCities(rest);
            if (activeId === ct.id) select(rest[0]?.id ?? null);
          } catch (e) { toast(e.message); }
        },
      },
    ]);
  }

  async function signOut() {
    await Backend.logOut();
    setShowSettings(false);
    setUser(null);
    setCities([]);
    setWeather({});
    setActiveId(null);
    setSettings(DEFAULT_SETTINGS);
  }

  const [fontsLoaded] = useFonts({ InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold });
  const ready = fontsLoaded && !booting;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null;

  const t = theme;
  const s = settings;
  const skyCond = w && c
    ? (() => { const d = dayOf(w, c.t); return { code: c.code, cloud: c.cloud, wind: c.wind, t: drift === 0 ? W.cityNow(w.offset) : c.t, sunrise: d.sunrise, sunset: d.sunset }; })()
    : ambient();
  const where = city ? [city.admin1, city.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "";
  const d = c && W.describe(c.code, c.isDay);

  return (
    <ThemeContext.Provider value={t}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={t.dark ? "light" : "dark"} />
        <Sky cond={skyCond} motion={s.motion} veil={t.veil} />

        {!user ? (
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <Auth onAuthed={enter} toast={toast} />
          </View>
        ) : (
          <>
            <ScrollView ref={scroller} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 150 + insets.bottom }}
              refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.ink} onRefresh={async () => { setRefreshing(true); await loadWeather(cities); setRefreshing(false); }} />}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Mark />
                  <T kind="serif" style={{ fontSize: 26 }}>Skyloom</T>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <IconButton name="plus" label="Add a city" onPress={() => setAdding(true)} />
                  <IconButton name="gear" label="Settings" onPress={() => setShowSettings(true)} />
                </View>
              </View>

              {!city ? (
                <Glass style={{ marginTop: 120, alignItems: "center", gap: 10, padding: 28 }}>
                  <T kind="serif" style={{ fontSize: 32 }}>Your loom is empty</T>
                  <T muted style={{ textAlign: "center" }}>Add any city on Earth and Skyloom will paint its sky, live.</T>
                  <Pressable onPress={() => setAdding(true)} style={{ marginTop: 6, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999, backgroundColor: t.aura }}>
                    <T kind="bold" style={{ color: "#fff" }}>Add your first city</T>
                  </Pressable>
                </Glass>
              ) : (
                <>
                  <View style={{ minHeight: 460, justifyContent: "center", paddingVertical: 20 }}>
                    <T kind="serif" style={{ fontSize: 52, lineHeight: 56 }}>{city.name}</T>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                      <CountryBadge code={W.countryCode(city.countryCode)} />
                      <T kind="small" muted style={{ flexShrink: 1 }}>{w ? `${where} · ${W.clock(W.cityNow(w.offset), s)} local` : `${where} · loading the sky…`}</T>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 4 }}>
                      <T kind="serif" style={{ fontSize: 170, lineHeight: 180, letterSpacing: -4 }}>{c ? W.temp(c.temp, s) : "--"}</T>
                      <T kind="serif" muted style={{ fontSize: 70, lineHeight: 90, marginTop: 14 }}>{`°${s.temp}`}</T>
                    </View>
                    {c && <T kind="semi" style={{ fontSize: 19 }}>{`${d.icon} ${d.label} · feels ${W.temp(c.feels, s)}°`}</T>}
                    {w && <T kind="italic" muted style={{ fontSize: 22, marginTop: 10, marginBottom: 22 }}>{W.sentence(city, w)}</T>}

                    {w && (
                      <Glass style={{ paddingBottom: 10 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                          <T kind="eyebrow">Time drift</T>
                          <T kind="bold">{drift === 0 ? "Now" : `+${drift}h · ${W.clock(c.t, s)}`}</T>
                        </View>
                        <DriftSlider value={drift} onChange={setDrift} colors={w.hourly.map((h) => W.tempColor(h.temp))} />
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          {["now", "+6h", "+12h", "+18h", "+23h"].map((l) => <T key={l} kind="small" style={{ fontSize: 11, color: t.ink3 }}>{l}</T>)}
                        </View>
                      </Glass>
                    )}
                  </View>

                  {w && (
                    <>
                      <Hourly w={w} s={s} drift={drift} />
                      <Daily w={w} s={s} />
                      <SunArc w={w} s={s} />
                      <Details w={w} s={s} />
                      <Wear w={w} />
                      <Twins city={city} w={w} cities={cities} weather={weather} s={s} onPick={select} />
                    </>
                  )}
                </>
              )}
            </ScrollView>

            {/* The loom: saved cities. Tap to open, long-press to remove. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 10 }}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {cities.map((ct) => {
                const cw = weather[ct.id];
                const [a, b] = cw ? W.swatch(W.describe(cw.current.code).kind, cw.current.isDay) : ["#2a2f4a", "#4a4f6a"];
                return (
                  <Pressable key={ct.id} onPress={() => select(ct.id)} onLongPress={() => removeCity(ct)} accessibilityLabel={`${ct.name}. Long-press to remove.`}
                    style={{ width: 140, height: 92, borderRadius: 18, overflow: "hidden", borderWidth: ct.id === activeId ? 2 : 1, borderColor: ct.id === activeId ? "#fff" : "rgba(255,255,255,0.25)" }}>
                    <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    {cw && <View style={{ position: "absolute", right: -30, top: -30, width: 90, height: 90, borderRadius: 45, backgroundColor: W.tempColor(cw.current.temp, 0.55) }} />}
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.35)"]} style={StyleSheet.absoluteFill} />
                    <View style={{ flex: 1, padding: 10, justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <CountryBadge code={W.countryCode(ct.countryCode)} color="#fff" />
                        <T kind="bold" numberOfLines={1} style={{ color: "#fff", fontSize: 13.5, flexShrink: 1 }}>{ct.name}</T>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <T kind="serif" style={{ color: "#fff", fontSize: 32, lineHeight: 34 }}>{cw ? `${W.temp(cw.current.temp, s)}°` : "··"}</T>
                        {cw && <T kind="small" style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>{`${W.describe(cw.current.code, cw.current.isDay).icon} ${W.clock(W.cityNow(cw.offset), s)}`}</T>}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setAdding(true)} style={{ width: 92, height: 92, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: t.lineStrong, backgroundColor: t.glass, alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Icon name="plus" size={22} />
                <T kind="small">Add city</T>
              </Pressable>
            </ScrollView>
          </>
        )}

        <AddCity visible={adding} onClose={() => setAdding(false)} onAdd={addCity} toast={toast} />
        <Settings visible={showSettings} onClose={() => setShowSettings(false)} settings={s} onChange={changeSettings} user={user}
          onToggleNotify={toggleNotify} onSignOut={signOut} onTestPush={async () => { try { Alert.alert("Test notification", await testPush(localDigest())); } catch (e) { Alert.alert("Test notification", e.message); } }} />

        <Animated.View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 120, alignItems: "center", opacity: toastOp }}>
          <View style={{ backgroundColor: t.glassStrong, borderColor: t.lineStrong, borderWidth: 1, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 }}>
            <T style={{ textAlign: "center", fontFamily: FONTS.semi }}>{toastMsg}</T>
          </View>
        </Animated.View>
      </View>
    </ThemeContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}
