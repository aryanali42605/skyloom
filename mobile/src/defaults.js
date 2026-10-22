// What a brand-new account starts with. Kept in step with ../defaults.js (the web app).
export const DEFAULT_SETTINGS = {
  temp: "C",          // "C" | "F"
  wind: "kmh",        // "kmh" | "mph" | "ms"
  clock: "24",        // "24" | "12"
  theme: "aurora",    // "aurora" (dark) | "paper" (light) | "auto" (follow the phone)
  motion: true,       // animate the living sky
  aura: true,         // tint the interface by the current temperature
  notify: false,      // daily digest push; needs permission, so it starts off
  notifyHour: 7,      // local hour the digest arrives
  alerts: true,       // storm / extreme heat / deep cold alerts
};

// Added once at sign-up so a new account immediately shows three very different skies.
export const STARTER_CITIES = [
  { name: "Tokyo", admin1: "Tokyo", country: "Japan", countryCode: "JP", lat: 35.6895, lon: 139.69171, tz: "Asia/Tokyo" },
  { name: "Reykjavík", admin1: "Capital Region", country: "Iceland", countryCode: "IS", lat: 64.13548, lon: -21.89541, tz: "Atlantic/Reykjavik" },
  { name: "Marrakesh", admin1: "Marrakesh-Safi", country: "Morocco", countryCode: "MA", lat: 31.63416, lon: -7.99994, tz: "Africa/Casablanca" },
];

export const REFRESH_MINUTES = 15;
