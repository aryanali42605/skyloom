// The forecast panels under the hero: next 24 hours, seven tides, sun thread, air & light,
// wear & carry and sky twins. Same content as the web app's panels.
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { FONTS, useTheme } from "../theme";
import * as W from "../weather";
import { CountryBadge, Glass, Icon, T } from "./ui";

function Panel({ title, note, children }) {
  return (
    <Glass style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 10 }}>
        <T kind="eyebrow">{title}</T>
        {note ? <T kind="small" muted style={{ flexShrink: 1, textAlign: "right" }}>{note}</T> : null}
      </View>
      {children}
    </Glass>
  );
}

export function Hourly({ w, s, drift }) {
  const t = useTheme();
  const hrs = w.hourly;
  const WD = 760, HT = 150, padX = 18, top = 46, bottom = 104;
  const temps = hrs.map((h) => h.temp);
  const lo = Math.min(...temps), span = Math.max(1, Math.max(...temps) - lo);
  const pts = hrs.map((h, i) => [padX + (i * (WD - padX * 2)) / (hrs.length - 1), bottom - ((h.temp - lo) / span) * (bottom - top)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  const rainy = hrs.findIndex((h) => h.pop >= 50);
  const note = rainy === -1 ? "No real rain on the way" : rainy === 0 ? "Rain likely now" : `Rain likely in ~${rainy}h`;
  const dot = pts[Math.min(drift, pts.length - 1)];
  return (
    <Panel title="Next 24 hours" note={note}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={WD} height={HT}>
          <Defs>
            <SvgGradient id="hg" x1="0" y1="0" x2="1" y2="0">
              {hrs.map((h, i) => <Stop key={i} offset={i / (hrs.length - 1)} stopColor={W.tempColor(h.temp)} />)}
            </SvgGradient>
            <SvgGradient id="hf" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={t.aura} stopOpacity="0.35" />
              <Stop offset="1" stopColor={t.aura} stopOpacity="0" />
            </SvgGradient>
          </Defs>
          <Path d={`${d} L${pts[pts.length - 1][0]},${bottom + 20} L${pts[0][0]},${bottom + 20} Z`} fill="url(#hf)" />
          <Path d={d} stroke="url(#hg)" strokeWidth={3.5} fill="none" />
          {hrs.map((h, i) => {
            const [x, y] = pts[i];
            const lbl = i % 2 === 0;
            return (
              <G key={i}>
                {h.pop >= 20 && <Rect x={x - 6} y={HT - 18 - h.pop * 0.18} width={12} height={h.pop * 0.18} rx={3} fill={t.aura2} opacity={0.45} />}
                {lbl && <SvgText x={x} y={y - 12} fill={t.ink} fontSize={12} fontFamily={FONTS.bold} textAnchor="middle">{`${W.temp(h.temp, s)}°`}</SvgText>}
                {lbl && <SvgText x={x} y={18} fontSize={15} textAnchor="middle">{W.describe(h.code, h.isDay).icon}</SvgText>}
                {lbl && <SvgText x={x} y={HT - 2} fill={t.ink2} fontSize={11} fontFamily={FONTS.body} textAnchor="middle">{i === 0 ? "now" : W.hourLabel(h.t, s)}</SvgText>}
              </G>
            );
          })}
          <Circle cx={dot[0]} cy={dot[1]} r={6} fill="#fff" stroke={t.aura} strokeWidth={3} />
        </Svg>
      </ScrollView>
    </Panel>
  );
}

export function Daily({ w, s }) {
  const t = useTheme();
  const lo = Math.min(...w.daily.map((d) => d.min)), span = Math.max(1, Math.max(...w.daily.map((d) => d.max)) - lo);
  return (
    <Panel title="Seven tides">
      {w.daily.map((d, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
          <T style={{ width: 48 }}>{W.dayName(d.t, i)}</T>
          <T style={{ width: 24, fontSize: 17, textAlign: "center" }}>{W.describe(d.code).icon}</T>
          <T muted style={{ width: 34, textAlign: "right", color: t.ink3 }}>{W.temp(d.min, s)}°</T>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.line }}>
            <LinearGradient colors={[W.tempColor(d.min), W.tempColor(d.max)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 3, left: `${((d.min - lo) / span) * 100}%`, right: `${100 - ((d.max - lo) / span) * 100}%` }} />
          </View>
          <T kind="bold" style={{ width: 34 }}>{W.temp(d.max, s)}°</T>
        </View>
      ))}
    </Panel>
  );
}

export function SunArc({ w, s }) {
  const t = useTheme();
  const d = w.daily[0];
  const now = W.cityNow(w.offset);
  const p = Math.max(0, Math.min(1, (now - d.sunrise) / (d.sunset - d.sunrise)));
  const up = now >= d.sunrise && now <= d.sunset;
  const cx = 110, cy = 92, r = 80, ang = Math.PI * (1 - p);
  const sx = cx + r * Math.cos(ang), sy = cy - r * Math.sin(ang);
  const len = (d.sunset - d.sunrise) / 3600000;
  const left = (d.sunset - now) / 60000;
  const msg = up ? `${Math.floor(left / 60)}h ${Math.round(left % 60)}m of light left` : now < d.sunrise ? "The sun is still below the horizon" : "The sun has set";
  return (
    <Panel title="Sun thread">
      <Svg width="100%" height={150} viewBox="0 0 220 130">
        <Defs>
          <SvgGradient id="sa" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffb27a" /><Stop offset="0.5" stopColor="#ffe7a8" /><Stop offset="1" stopColor="#ff7ab6" />
          </SvgGradient>
        </Defs>
        <Path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} stroke={t.lineStrong} strokeDasharray="3 5" fill="none" />
        <Path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${sx},${sy}`} stroke="url(#sa)" strokeWidth={3} fill="none" />
        <Line x1={10} x2={210} y1={cy} y2={cy} stroke={t.lineStrong} />
        {up && <Circle cx={sx} cy={sy} r={16} fill="#ffd27a" opacity={0.2} />}
        {up && <Circle cx={sx} cy={sy} r={9} fill="#ffd27a" />}
        <SvgText x={cx - r} y={cy + 18} fill={t.ink2} fontSize={11} fontFamily={FONTS.body} textAnchor="middle">{`↑ ${W.clock(d.sunrise, s)}`}</SvgText>
        <SvgText x={cx + r} y={cy + 18} fill={t.ink2} fontSize={11} fontFamily={FONTS.body} textAnchor="middle">{`↓ ${W.clock(d.sunset, s)}`}</SvgText>
        <SvgText x={cx} y={cy - 26} fill={t.ink} fontSize={13} fontFamily={FONTS.bold} textAnchor="middle">{`${Math.floor(len)}h ${Math.round((len % 1) * 60)}m`}</SvgText>
        <SvgText x={cx} y={cy - 10} fill={t.ink2} fontSize={11} fontFamily={FONTS.body} textAnchor="middle">of daylight</SvgText>
      </Svg>
      <T kind="small" muted style={{ textAlign: "center" }}>{msg}</T>
    </Panel>
  );
}

export function Details({ w, s }) {
  const t = useTheme();
  const c = w.current;
  const uvWord = c.uv < 3 ? "low" : c.uv < 6 ? "moderate" : c.uv < 8 ? "high" : "very high";
  const items = [
    ["Feels like", `${W.temp(c.feels, s)}°`],
    ["Humidity", `${c.hum}%`],
    ["Wind", `${W.wind(c.wind, s)} ${W.compassName(c.windDir)}`, true],
    ["UV index", `${Math.round(c.uv)} ${uvWord}`],
    ["Cloud cover", `${c.cloud}%`],
    ["Pressure", `${Math.round(c.pressure)} hPa`],
    ["Visibility", c.visibility != null ? `${(c.visibility / 1000).toFixed(c.visibility < 10000 ? 1 : 0)} km` : "—"],
    ["Rain now", `${c.precip} mm`],
  ];
  return (
    <Panel title="Air & light">
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
        {items.map(([k, v, compass]) => (
          <View key={k} style={{ width: "50%" }}>
            <T kind="small" style={{ color: t.ink3 }}>{k}</T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {compass && <Icon name="arrow" size={16} rotate={c.windDir + 180} />}
              <T kind="bold" style={{ fontSize: 17 }}>{v}</T>
            </View>
          </View>
        ))}
      </View>
    </Panel>
  );
}

export function Wear({ w }) {
  const t = useTheme();
  return (
    <Panel title="Wear & carry">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {W.wear(w).map((x) => (
          <View key={x} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.glassStrong, borderWidth: 1, borderColor: t.line }}>
            <T style={{ fontSize: 13.5 }}>{x}</T>
          </View>
        ))}
      </View>
    </Panel>
  );
}

export function Twins({ city, w, cities, weather, s, onPick }) {
  const t = useTheme();
  const others = cities.filter((c) => c.id !== city.id && weather[c.id]);
  const ranked = others
    .map((c) => ({ c, w: weather[c.id], score: W.similarity(w.current, weather[c.id].current) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return (
    <Panel title="Sky twins" note="Which of your cities feel alike right now">
      {!ranked.length && <T muted>Add more cities and Skyloom will find which ones are secretly sharing the same weather.</T>}
      <View style={{ gap: 10 }}>
        {ranked.map(({ c, w: ow, score }) => {
          const d = W.describe(ow.current.code, ow.current.isDay);
          const verdict = score >= 80 ? "Sky twins" : score >= 60 ? "Close cousins" : score >= 35 ? "Distant relatives" : "Total opposites";
          return (
            <Pressable key={c.id} onPress={() => onPick(c.id)} style={{ padding: 12, borderRadius: 16, backgroundColor: t.glassStrong, borderWidth: 1, borderColor: t.line }}>
              <T kind="bold" style={{ fontSize: 11, color: t.aura2, letterSpacing: 0.6 }}>{`${score}% ALIKE · ${verdict.toUpperCase()}`}</T>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                <CountryBadge code={W.countryCode(c.countryCode)} color={t.ink} />
                <T kind="bold">{c.name}</T>
              </View>
              <T kind="small" muted>{`${d.icon} ${W.temp(ow.current.temp, s)}° · ${d.label} · ${W.clock(W.cityNow(ow.offset), s)}`}</T>
            </Pressable>
          );
        })}
      </View>
    </Panel>
  );
}
