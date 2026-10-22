// The living sky for phones: the same idea as the web canvas (js/sky.js), built from native
// views so it runs smoothly in Expo Go. Every particle loop uses the native driver.
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { describe } from "../weather";

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const STOPS = [
  { at: -1.0, top: hex("#03051a"), bottom: hex("#0d1440") },
  { at: -0.25, top: hex("#0a0f33"), bottom: hex("#2b2466") },
  { at: -0.05, top: hex("#26205c"), bottom: hex("#e0738a") },
  { at: 0.08, top: hex("#3d5fae"), bottom: hex("#ffb27a") },
  { at: 0.3, top: hex("#2f7ee6"), bottom: hex("#9fd2ff") },
  { at: 1.0, top: hex("#1f6fe0"), bottom: hex("#bfe3ff") },
];
function skyAt(alt) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (alt <= b.at) {
      const t = clamp((alt - a.at) / (b.at - a.at));
      return [mix(a.top, b.top, t), mix(a.bottom, b.bottom, t)];
    }
  }
  return [STOPS[5].top, STOPS[5].bottom];
}
const hoursOf = (t) => new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;

// Turns conditions into everything the sky needs to draw.
export function skyState(cond) {
  const kind = describe(cond.code).kind;
  const hour = hoursOf(cond.t);
  const rise = cond.sunrise ? hoursOf(cond.sunrise) : 6.5;
  const set = cond.sunset ? hoursOf(cond.sunset) : 18.5;
  const day = hour >= rise && hour <= set;
  const nightLen = 24 - (set - rise);
  const into = hour > set ? hour - set : hour + 24 - set;
  const alt = day ? Math.sin(((hour - rise) / (set - rise)) * Math.PI) : -Math.sin((into / nightLen) * Math.PI);
  const cloud = kind === "clear" ? Math.min(cond.cloud ?? 10, 25) : cond.cloud ?? 70;
  const overcast = clamp((cloud - 30) / 70);
  const storm = kind === "storm" ? 1 : 0;
  let [top, bottom] = skyAt(alt);
  const grey = alt > 0 ? hex("#6f7a8f") : hex("#141824");
  top = mix(mix(top, grey, overcast * 0.75), hex("#211c3a"), storm * 0.6);
  bottom = mix(mix(bottom, grey, overcast * 0.7), hex("#211c3a"), storm * 0.4);
  const heavy = [65, 67, 75, 82, 86, 99].includes(cond.code);
  return {
    kind, alt, overcast, storm, top, bottom,
    sun: day ? (hour - rise) / (set - rise) : null,
    moon: day ? null : into / nightLen,
    clouds: Math.round((cloud / 100) * 7),
    rain: kind === "drizzle" ? 0.3 : kind === "rain" ? (heavy ? 1 : 0.6) : storm,
    snow: kind === "snow" ? (heavy ? 1 : 0.55) : 0,
    fog: kind === "fog",
    stars: clamp(-alt * 2.2) * (1 - overcast),
    aurora: alt < -0.1 && (kind === "clear" || kind === "partly"),
    wind: cond.wind ?? 8,
  };
}

function useLoop(duration, enabled, { delay = 0, easing = Easing.linear, reverse = false } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) { v.setValue(0.5); return; }
    v.setValue(0);
    const anim = reverse
      ? Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration, easing, useNativeDriver: true })]))
      : Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }));
    const t = setTimeout(() => anim.start(), delay);
    return () => { clearTimeout(t); anim.stop(); };
  }, [duration, enabled]);
  return v;
}

function Star({ s, w, h, opacity, motion }) {
  const v = useLoop(1600 + s.z * 2400, motion, { delay: s.p * 2000, reverse: true, easing: Easing.inOut(Easing.sin) });
  return (
    <Animated.View
      style={{ position: "absolute", left: s.x * w, top: s.y * h * 0.7, width: 1.5 + s.z * 1.5, height: 1.5 + s.z * 1.5, borderRadius: 2, backgroundColor: "#fff",
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [opacity * 0.25, opacity * (0.5 + s.z * 0.5)] }) }}
    />
  );
}

function Cloud({ c, w, h, tone, alpha, wind, motion }) {
  const size = c.s * Math.min(w, h) * 0.28;
  const v = useLoop(Math.max(25000, 120000 - wind * 1500) * (1.3 - c.z), motion, { delay: 0 });
  const x = v.interpolate({ inputRange: [0, 1], outputRange: [-size * 2.2 + c.x * w * 0.2, w + size] });
  return (
    <Animated.View style={{ position: "absolute", top: c.y * h, left: motion ? 0 : c.x * w, width: size * 2, height: size, transform: motion ? [{ translateX: x }] : [] }}>
      {c.puffs.map(([ox, oy, r], i) => (
        <View key={i} style={{ position: "absolute", left: size + ox * size * 1.6 - r * size, top: size / 2 + oy * size - r * size, width: r * size * 2, height: r * size * 2, borderRadius: size, backgroundColor: rgb(tone, alpha) }} />
      ))}
    </Animated.View>
  );
}

function Drop({ d, w, h, slant, color, motion }) {
  const v = useLoop(700 / d.v, motion, { delay: d.y * 900 });
  return (
    <Animated.View
      style={{ position: "absolute", left: d.x * w, top: -30, width: 1.4, height: 16 + d.l * 10, backgroundColor: color, borderRadius: 1,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [d.y * (motion ? 0 : h), h + 40] }) }, { rotate: `${slant}deg` }] }}
    />
  );
}

function Flake({ f, w, h, motion }) {
  const v = useLoop(7000 / f.v, motion, { delay: f.y * 6000 });
  const sway = useLoop(2500 + f.p * 1500, motion, { reverse: true, easing: Easing.inOut(Easing.sin) });
  return (
    <Animated.View
      style={{ position: "absolute", left: f.x * w, top: -10, width: f.r * 2, height: f.r * 2, borderRadius: f.r, backgroundColor: "rgba(255,255,255,0.88)",
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [motion ? 0 : f.y * h, h + 20] }) }, { translateX: sway.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) }] }}
    />
  );
}

function Lightning({ enabled }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    let alive = true, t;
    const strike = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 60, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.1, duration: 80, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.4, duration: 50, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]).start();
      t = setTimeout(strike, 2500 + Math.random() * 6000);
    };
    t = setTimeout(strike, 1500);
    return () => { alive = false; clearTimeout(t); };
  }, [enabled]);
  if (!enabled) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#e6e1ff", opacity: v }]} />;
}

function Aurora({ w, h, motion }) {
  const v = useLoop(9000, motion, { reverse: true, easing: Easing.inOut(Easing.sin) });
  const bands = [["rgba(80,255,180,0)", "rgba(80,255,180,0.22)", "rgba(80,255,180,0)"], ["rgba(90,200,255,0)", "rgba(90,200,255,0.16)", "rgba(90,200,255,0)"], ["rgba(190,110,255,0)", "rgba(190,110,255,0.16)", "rgba(190,110,255,0)"]];
  return bands.map((colors, i) => (
    <Animated.View key={i} pointerEvents="none"
      style={{ position: "absolute", left: -w * 0.3, top: h * (0.06 + i * 0.07), width: w * 1.6, height: h * 0.2,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
        transform: [{ rotate: `${-8 + i * 5}deg` }, { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.1 * (i + 1), w * 0.1] }) }] }}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
    </Animated.View>
  ));
}

export default function Sky({ cond, motion = true, veil }) {
  const { width: w, height: h } = useWindowDimensions();
  const s = useMemo(() => skyState(cond), [cond.code, cond.t, cond.cloud, cond.sunrise, cond.sunset, Math.round(cond.wind ?? 0)]);

  const field = useMemo(() => {
    const r = Math.random;
    return {
      stars: Array.from({ length: 70 }, () => ({ x: r(), y: r(), z: r(), p: r() })),
      clouds: Array.from({ length: 7 }, (_, i) => ({ x: r(), y: 0.04 + r() * 0.42, s: 0.6 + r() * 0.9, z: i / 7, puffs: Array.from({ length: 5 }, () => [r() - 0.5, r() * 0.3 - 0.15, 0.3 + r() * 0.3]) })),
      drops: Array.from({ length: 70 }, () => ({ x: r(), y: r(), l: r(), v: 0.7 + r() * 0.6 })),
      flakes: Array.from({ length: 55 }, () => ({ x: r(), y: r(), r: 1 + r() * 2.2, v: 0.6 + r() * 0.6, p: r() })),
    };
  }, []);

  // Crossfade between skies instead of cutting.
  const fade = useRef(new Animated.Value(1)).current;
  const prev = useRef(s);
  const from = prev.current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: motion ? 900 : 0, useNativeDriver: true }).start(() => { prev.current = s; });
  }, [s]);

  const arc = (p) => [w * (0.1 + p * 0.8), h * (0.5 - Math.sin(p * Math.PI) * 0.38)];
  const tone = s.alt > 0 ? mix([255, 255, 255], [150, 158, 175], s.overcast * 0.8 + s.storm * 0.3) : mix([90, 96, 130], [40, 44, 62], s.overcast);
  const sunR = Math.min(w, h) * 0.07;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[rgb(from.top), rgb(from.bottom)]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <LinearGradient colors={[rgb(s.top), rgb(s.bottom)]} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {s.stars > 0.03 && field.stars.map((st, i) => <Star key={i} s={st} w={w} h={h} opacity={s.stars} motion={motion} />)}
      {s.aurora && <Aurora w={w} h={h} motion={motion} />}

      {s.sun != null && (() => {
        const [x, y] = arc(s.sun);
        const a = 1 - s.overcast * 0.85;
        return (
          <>
            {[5, 3, 1.8].map((k, i) => (
              <View key={i} style={{ position: "absolute", left: x - sunR * k, top: y - sunR * k, width: sunR * k * 2, height: sunR * k * 2, borderRadius: sunR * k, backgroundColor: `rgba(255,220,160,${0.07 * a * (i + 1)})` }} />
            ))}
            <View style={{ position: "absolute", left: x - sunR, top: y - sunR, width: sunR * 2, height: sunR * 2, borderRadius: sunR, backgroundColor: `rgba(255,248,225,${a})` }} />
          </>
        );
      })()}
      {s.moon != null && (() => {
        const [x, y] = arc(s.moon);
        const r = sunR * 0.75;
        const a = 0.95 * (1 - s.overcast) + 0.05;
        return (
          <>
            <View style={{ position: "absolute", left: x - r * 4, top: y - r * 4, width: r * 8, height: r * 8, borderRadius: r * 4, backgroundColor: `rgba(220,225,255,${0.08 * a})` }} />
            <View style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: `rgba(240,240,255,${a})` }} />
            <View style={{ position: "absolute", left: x - r * 0.55, top: y - r * 1.2, width: r * 1.8, height: r * 1.8, borderRadius: r, backgroundColor: rgb(s.top, 0.92) }} />
          </>
        );
      })()}

      {field.clouds.slice(0, s.clouds).map((c, i) => (
        <Cloud key={i} c={c} w={w} h={h} tone={tone} alpha={0.16 + s.overcast * 0.14} wind={s.wind} motion={motion} />
      ))}

      {s.fog && [0.4, 0.55, 0.7, 0.85].map((y, i) => (
        <LinearGradient key={i} colors={s.alt > 0 ? ["rgba(220,224,232,0)", "rgba(220,224,232,0.4)", "rgba(220,224,232,0)"] : ["rgba(90,96,115,0)", "rgba(90,96,115,0.4)", "rgba(90,96,115,0)"]}
          style={{ position: "absolute", left: 0, right: 0, top: h * y - h * 0.12, height: h * 0.24 }} />
      ))}

      {s.rain > 0.05 && field.drops.slice(0, Math.round(field.drops.length * s.rain)).map((d, i) => (
        <Drop key={i} d={d} w={w} h={h} slant={-Math.min(25, s.wind * 0.4)} color={s.alt > 0 ? "rgba(220,235,255,0.5)" : "rgba(170,190,230,0.4)"} motion={motion} />
      ))}
      {s.snow > 0.05 && field.flakes.slice(0, Math.round(field.flakes.length * s.snow)).map((f, i) => (
        <Flake key={i} f={f} w={w} h={h} motion={motion} />
      ))}

      <Lightning enabled={s.storm > 0 && motion} />
      {veil && <LinearGradient colors={veil} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />}
    </View>
  );
}
