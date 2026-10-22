// Small shared building blocks: glass cards, text styles, icons, segmented control, drift slider.
import { useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { FONTS, useTheme } from "../theme";

export function Glass({ style, strong, children }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: strong ? t.glassStrong : t.glass, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 16 }, style]}>{children}</View>;
}

export function T({ style, kind = "body", muted, children, ...rest }) {
  const t = useTheme();
  const base = {
    body: { fontFamily: FONTS.body, fontSize: 15 },
    semi: { fontFamily: FONTS.semi, fontSize: 15 },
    bold: { fontFamily: FONTS.bold, fontSize: 15 },
    serif: { fontFamily: FONTS.serif, fontSize: 30 },
    italic: { fontFamily: FONTS.serifItalic, fontSize: 20 },
    eyebrow: { fontFamily: FONTS.semi, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: t.ink3 },
    small: { fontFamily: FONTS.body, fontSize: 12.5 },
  }[kind];
  return <Text style={[{ color: muted ? t.ink2 : t.ink }, base, style]} {...rest}>{children}</Text>;
}

const ICONS = {
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  search: "M20 20l-3.5-3.5",
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3",
  arrow: "M12 3v18M6 9l6-6 6 6",
  gear: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

export function Icon({ name, size = 20, color, rotate = 0 }) {
  const t = useTheme();
  const c = color || t.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ transform: [{ rotate: `${rotate}deg` }] }}>
      {name === "gear" && <Circle cx="12" cy="12" r="3" />}
      {name === "search" && <Circle cx="11" cy="11" r="7" />}
      {name === "locate" && <Circle cx="12" cy="12" r="6" />}
      <Path d={ICONS[name]} />
    </Svg>
  );
}

export function IconButton({ name, onPress, label }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: t.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={name} />
    </Pressable>
  );
}

export function Button({ title, onPress, kind = "primary", disabled, icon }) {
  const t = useTheme();
  const styles = {
    primary: { backgroundColor: t.aura, borderColor: "transparent" },
    ghost: { backgroundColor: t.glass, borderColor: t.lineStrong },
    danger: { backgroundColor: "transparent", borderColor: t.danger },
  }[kind];
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [{ flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 13, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, styles]}>
      {icon && <Icon name={icon} size={18} color={kind === "primary" ? "#fff" : t.ink} />}
      <T kind="bold" style={{ color: kind === "primary" ? "#fff" : kind === "danger" ? t.danger : t.ink }}>{title}</T>
    </Pressable>
  );
}

export function Seg({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.line, borderRadius: 999, padding: 4 }}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={{ flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: "center", backgroundColor: v === value ? t.glassStrong : "transparent" }}>
          <T kind="semi" style={{ fontSize: 14, color: v === value ? t.ink : t.ink2 }}>{label}</T>
        </Pressable>
      ))}
    </View>
  );
}

// A 0…max slider built on PanResponder (core React Native has no slider).
export function DriftSlider({ value, max = 23, onChange, colors }) {
  const t = useTheme();
  const [width, setWidth] = useState(1);
  const ref = useRef({ width: 1, x0: 0 });
  ref.current.width = width;
  const pick = (x) => onChange(Math.round(Math.max(0, Math.min(1, x / ref.current.width)) * max));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { ref.current.x0 = e.nativeEvent.locationX; pick(ref.current.x0); },
      onPanResponderMove: (_, g) => pick(ref.current.x0 + g.dx),
    })
  ).current;
  const x = (value / max) * width;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 36, justifyContent: "center" }} {...pan.panHandlers}>
      <View style={{ height: 6, borderRadius: 3, flexDirection: "row", overflow: "hidden" }} pointerEvents="none">
        {colors.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
      </View>
      <View pointerEvents="none" style={{ position: "absolute", left: x - 13, width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff", borderWidth: 5, borderColor: t.aura, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 }} />
    </View>
  );
}

export function CountryBadge({ code, color }) {
  const t = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: color || t.ink2, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1, marginRight: 6 }}>
      <T kind="bold" style={{ fontSize: 9.5, letterSpacing: 0.6, color: color || t.ink2 }}>{code}</T>
    </View>
  );
}
