// Skyloom defaults — what a brand-new account starts with.
// Every value here can be changed by the user in Settings; this file is just the first impression.
window.SKYLOOM_DEFAULTS = {
  settings: {
    temp: "C",          // "C" | "F"
    wind: "kmh",        // "kmh" | "mph" | "ms"
    clock: "24",        // "24" | "12"
    theme: "aurora",    // "aurora" (dark) | "paper" (light) | "auto" (follow the OS)
    motion: true,       // animate the living sky (always off when the OS asks for reduced motion)
    aura: true,         // tint the interface by the current temperature
    notify: false,      // daily digest push; needs the user's permission, so it starts off
    notifyHour: 7,      // local hour the digest arrives
    alerts: true,       // storm / extreme heat / deep cold alerts with the digest job
  },
  // Three very different skies so a new account immediately shows what Skyloom can do.
  // They are added once, at sign-up; the user can remove them or add their own location anytime.
  starterCities: [
    { name: "Tokyo", admin1: "Tokyo", country: "Japan", countryCode: "JP", lat: 35.6895, lon: 139.69171, tz: "Asia/Tokyo" },
    { name: "Reykjavík", admin1: "Capital Region", country: "Iceland", countryCode: "IS", lat: 64.13548, lon: -21.89541, tz: "Atlantic/Reykjavik" },
    { name: "Marrakesh", admin1: "Marrakesh-Safi", country: "Morocco", countryCode: "MA", lat: 31.63416, lon: -7.99994, tz: "Africa/Casablanca" },
  ],
  refreshMinutes: 15,
};
