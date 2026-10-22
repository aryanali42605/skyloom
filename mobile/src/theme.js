// Theme tokens, matching the web app's Aurora (dark) and Paper (light) themes.
import { createContext, useContext } from "react";

export const THEMES = {
  aurora: {
    dark: true,
    bg: "#070a1c",
    ink: "#f3f1ff",
    ink2: "rgba(243,241,255,0.72)",
    ink3: "rgba(243,241,255,0.48)",
    glass: "rgba(18,22,52,0.55)",
    glassStrong: "rgba(14,17,42,0.92)",
    line: "rgba(255,255,255,0.12)",
    lineStrong: "rgba(255,255,255,0.22)",
    aura: "#8f7bff",
    aura2: "#4fd1ff",
    danger: "#ff6b8a",
    veil: ["rgba(7,10,28,0)", "rgba(7,10,28,0.55)", "rgba(7,10,28,0.92)"],
  },
  paper: {
    dark: false,
    bg: "#f4efe6",
    ink: "#1d1a2b",
    ink2: "rgba(29,26,43,0.74)",
    ink3: "rgba(29,26,43,0.5)",
    glass: "rgba(255,252,245,0.62)",
    glassStrong: "rgba(255,252,245,0.96)",
    line: "rgba(29,26,43,0.12)",
    lineStrong: "rgba(29,26,43,0.22)",
    aura: "#6b4dff",
    aura2: "#0090c8",
    danger: "#d0304f",
    veil: ["rgba(244,239,230,0)", "rgba(244,239,230,0.5)", "rgba(244,239,230,0.94)"],
  },
};

export const FONTS = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  body: "Manrope_400Regular",
  semi: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

export const ThemeContext = createContext(THEMES.aurora);
export const useTheme = () => useContext(ThemeContext);
