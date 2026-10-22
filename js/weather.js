// Weather data, place search and the little bits of "personality" (sentences, wear tips, twins).
// Data comes from Open-Meteo (forecast + geocoding, no key needed) and BigDataCloud (reverse geocoding).
(function () {
  const FORECAST = "https://api.open-meteo.com/v1/forecast";
  const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
  const REVERSE = "https://api.bigdatacloud.net/data/reverse-geocode-client";

  // WMO weather codes → label, icon and a coarse "kind" the sky engine understands.
  const CODES = {
    0: ["Clear sky", "☀️", "🌙", "clear"],
    1: ["Mostly clear", "🌤️", "🌙", "clear"],
    2: ["Partly cloudy", "⛅", "☁️", "partly"],
    3: ["Overcast", "☁️", "☁️", "cloudy"],
    45: ["Fog", "🌫️", "🌫️", "fog"],
    48: ["Freezing fog", "🌫️", "🌫️", "fog"],
    51: ["Light drizzle", "🌦️", "🌧️", "drizzle"],
    53: ["Drizzle", "🌦️", "🌧️", "drizzle"],
    55: ["Heavy drizzle", "🌧️", "🌧️", "drizzle"],
    56: ["Freezing drizzle", "🌧️", "🌧️", "drizzle"],
    57: ["Freezing drizzle", "🌧️", "🌧️", "drizzle"],
    61: ["Light rain", "🌦️", "🌧️", "rain"],
    63: ["Rain", "🌧️", "🌧️", "rain"],
    65: ["Heavy rain", "🌧️", "🌧️", "rain"],
    66: ["Freezing rain", "🌧️", "🌧️", "rain"],
    67: ["Freezing rain", "🌧️", "🌧️", "rain"],
    71: ["Light snow", "🌨️", "🌨️", "snow"],
    73: ["Snow", "🌨️", "🌨️", "snow"],
    75: ["Heavy snow", "❄️", "❄️", "snow"],
    77: ["Snow grains", "🌨️", "🌨️", "snow"],
    80: ["Rain showers", "🌦️", "🌧️", "rain"],
    81: ["Rain showers", "🌧️", "🌧️", "rain"],
    82: ["Violent showers", "⛈️", "⛈️", "rain"],
    85: ["Snow showers", "🌨️", "🌨️", "snow"],
    86: ["Heavy snow showers", "❄️", "❄️", "snow"],
    95: ["Thunderstorm", "⛈️", "⛈️", "storm"],
    96: ["Storm with hail", "⛈️", "⛈️", "storm"],
    99: ["Storm with heavy hail", "⛈️", "⛈️", "storm"],
  };

  function describe(code, isDay = true) {
    const c = CODES[code] || CODES[3];
    return { label: c[0], icon: isDay ? c[1] : c[2], kind: c[3] };
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  // ---------- Local-time helpers ----------
  // Open-Meteo returns local wall-clock strings ("2026-10-21T14:00") plus the UTC offset.
  // We keep everything as "shifted" epochs whose UTC fields equal the city's wall clock.
  const parseLocal = (s) => {
    const [d, t = "00:00"] = s.split("T");
    const [y, m, day] = d.split("-").map(Number);
    const [h, min] = t.split(":").map(Number);
    return Date.UTC(y, m - 1, day, h, min);
  };
  const cityNow = (offsetSec) => Date.now() + offsetSec * 1000;

  async function forecast(city) {
    const params = new URLSearchParams({
      latitude: city.lat,
      longitude: city.lon,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index,pressure_msl,visibility",
      hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,weather_code,is_day,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max",
      timezone: "auto",
      forecast_days: "8",
    });
    const j = await getJSON(`${FORECAST}?${params}`);
    const offset = j.utc_offset_seconds;
    const now = cityNow(offset);
    const H = j.hourly;
    let start = H.time.findIndex((t) => parseLocal(t) > now) - 1;
    if (start < 0) start = 0;
    const hourly = [];
    for (let i = start; i < Math.min(start + 24, H.time.length); i++) {
      hourly.push({
        t: parseLocal(H.time[i]),
        temp: H.temperature_2m[i],
        feels: H.apparent_temperature[i],
        hum: H.relative_humidity_2m[i],
        pop: H.precipitation_probability[i] ?? 0,
        code: H.weather_code[i],
        isDay: !!H.is_day[i],
        cloud: H.cloud_cover[i],
        wind: H.wind_speed_10m[i],
        windDir: H.wind_direction_10m[i],
        uv: H.uv_index[i] ?? 0,
      });
    }
    const D = j.daily;
    const daily = D.time.slice(0, 7).map((d, i) => ({
      t: parseLocal(d),
      code: D.weather_code[i],
      max: D.temperature_2m_max[i],
      min: D.temperature_2m_min[i],
      sunrise: parseLocal(D.sunrise[i]),
      sunset: parseLocal(D.sunset[i]),
      pop: D.precipitation_probability_max[i] ?? 0,
      uv: D.uv_index_max[i] ?? 0,
    }));
    const C = j.current;
    return {
      fetchedAt: Date.now(),
      tz: j.timezone,
      offset,
      current: {
        t: parseLocal(C.time),
        temp: C.temperature_2m,
        feels: C.apparent_temperature,
        hum: C.relative_humidity_2m,
        code: C.weather_code,
        isDay: !!C.is_day,
        cloud: C.cloud_cover,
        precip: C.precipitation,
        wind: C.wind_speed_10m,
        windDir: C.wind_direction_10m,
        uv: C.uv_index ?? 0,
        pressure: C.pressure_msl,
        visibility: C.visibility,
      },
      hourly,
      daily,
    };
  }

  async function search(q) {
    if (!q || q.trim().length < 2) return [];
    const j = await getJSON(`${GEOCODE}?${new URLSearchParams({ name: q.trim(), count: "10", language: "en", format: "json" })}`);
    return (j.results || []).map((r) => ({
      name: r.name,
      admin1: r.admin1 || "",
      country: r.country || "",
      countryCode: r.country_code || "",
      lat: r.latitude,
      lon: r.longitude,
      tz: r.timezone || "",
      population: r.population || 0,
    }));
  }

  async function reverse(lat, lon) {
    const j = await getJSON(`${REVERSE}?${new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: "en" })}`);
    return {
      name: j.city || j.locality || j.principalSubdivision || "My location",
      admin1: j.principalSubdivision || "",
      country: j.countryName || "",
      countryCode: j.countryCode || "",
      lat: +(+lat).toFixed(4),
      lon: +(+lon).toFixed(4),
      tz: "",
    };
  }

  // Country badge (flag emoji don't render on Windows, so a styled code reads the same everywhere).
  const flag = (cc) => `<span class="cc">${cc && /^[a-z]{2}$/i.test(cc) ? cc.toUpperCase() : "··"}</span>`;

  // ---------- Units ----------
  const temp = (c, s) => Math.round(s.temp === "F" ? c * 9 / 5 + 32 : c);
  const wind = (kmh, s) =>
    s.wind === "mph" ? `${Math.round(kmh * 0.621371)} mph` : s.wind === "ms" ? `${(kmh / 3.6).toFixed(1)} m/s` : `${Math.round(kmh)} km/h`;
  // shifted epoch → wall clock string
  const clock = (t, s) => {
    const d = new Date(t);
    let h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    if (s.clock === "12") {
      const ap = h >= 12 ? "pm" : "am";
      h = h % 12 || 12;
      return `${h}:${m}${ap}`;
    }
    return `${String(h).padStart(2, "0")}:${m}`;
  };
  const hourLabel = (t, s) => {
    const h = new Date(t).getUTCHours();
    return s.clock === "12" ? `${h % 12 || 12}${h >= 12 ? "p" : "a"}` : String(h).padStart(2, "0");
  };
  const dayName = (t, i) => (i === 0 ? "Today" : new Date(t).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }));
  const compassName = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];

  // Temperature → colour: deep blue at -20°C through ice, lavender and rose to ember at 40°C.
  const TEMP_STOPS = [[-20, [70, 110, 255]], [0, [120, 196, 255]], [10, [150, 150, 255]], [18, [196, 140, 255]], [24, [255, 150, 205]], [30, [255, 176, 100]], [40, [255, 80, 70]]];
  function tempColor(c, alpha = 1) {
    let [t0, a] = TEMP_STOPS[0];
    let rgb = a;
    for (const [t1, b] of TEMP_STOPS.slice(1)) {
      if (c <= t1) {
        const k = Math.max(0, Math.min(1, (c - t0) / (t1 - t0)));
        rgb = a.map((v, i) => Math.round(v + (b[i] - v) * k));
        break;
      }
      [t0, a, rgb] = [t1, b, b];
    }
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  // Card gradients for each kind of sky, by day and night.
  const SKY_SWATCH = {
    clear: [["#3f8cff", "#ffcf7a"], ["#0b1240", "#4a2f8a"]],
    partly: [["#4f86c9", "#d8c7a3"], ["#141a45", "#3d3a70"]],
    cloudy: [["#5d6b86", "#a8b3c7"], ["#1d2236", "#3e4560"]],
    fog: [["#8a93a3", "#cfd3da"], ["#2a2f3d", "#545a69"]],
    drizzle: [["#3d5776", "#7e95b0"], ["#141d33", "#2f4060"]],
    rain: [["#263a5a", "#5a7898"], ["#0e1529", "#26385a"]],
    snow: [["#8eaacd", "#e6eefc"], ["#1f2a48", "#5f7095"]],
    storm: [["#26214a", "#6a4b9c"], ["#0d0a20", "#3a2566"]],
  };
  const swatch = (kind, isDay) => (SKY_SWATCH[kind] || SKY_SWATCH.cloudy)[isDay ? 0 : 1];

  // ---------- Personality ----------
  function seeded(seed) {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (arr) => arr[Math.abs(h) % arr.length];
  }

  function sentence(city, w) {
    const c = w.current;
    const { kind } = describe(c.code, c.isDay);
    const hour = new Date(cityNow(w.offset)).getUTCHours();
    const pick = seeded(`${city.name}${hour}${kind}`);
    const part = hour < 5 ? "small hours" : hour < 11 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
    const feel =
      c.feels <= -10 ? "bone-deep cold" : c.feels <= 0 ? "a frosty bite" : c.feels <= 10 ? "a crisp edge" :
      c.feels <= 18 ? "soft, cool air" : c.feels <= 25 ? "easy warmth" : c.feels <= 32 ? "a heavy warmth" : "a furnace glow";
    const lines = {
      clear: c.isDay
        ? [`${city.name} is wearing an open sky this ${part}, with ${feel}.`, `Not a cloud to argue with. Just light and ${feel}.`, `The sun has the whole stage in ${city.name} right now.`]
        : [`Stars are out over ${city.name}, and the air carries ${feel}.`, `A clear ${part}: the sky has opened its jewellery box.`, `${city.name} sleeps under a cloudless dome.`],
      partly: [`Clouds drift by like slow thoughts over ${city.name}.`, `A patchwork ${part}: light, shade, light again.`, `Half sky, half cloud, and ${feel}.`],
      cloudy: [`A soft grey blanket is pulled over ${city.name}.`, `The sky is keeping its secrets this ${part}.`, `Overcast and calm, with ${feel}.`],
      fog: [`${city.name} has vanished into a quiet fog.`, `The world ends a few streets away this ${part}.`, `Fog is rewriting the skyline, line by line.`],
      drizzle: [`A fine mist of rain is drawing on the windows.`, `Drizzle: the sky can't quite commit.`, `Barely-there rain over ${city.name}, with ${feel}.`],
      rain: [`Rain is playing the rooftops of ${city.name}.`, `The streets are turning into mirrors.`, `A good ${part} for a window seat and a warm cup.`],
      snow: [`Snow is muffling ${city.name} into a whisper.`, `The sky is falling, gently, in pieces.`, `Every flake over ${city.name} is a tiny original.`],
      storm: [`Thunder is rolling over ${city.name}. Best watched from inside.`, `The sky is arguing loudly this ${part}.`, `Lightning is sketching over ${city.name}.`],
    };
    return pick(lines[kind] || lines.cloudy);
  }

  function wear(w) {
    const c = w.current;
    const next = w.hourly.slice(0, 12);
    const maxPop = Math.max(0, ...next.map((h) => h.pop));
    const maxUv = Math.max(c.uv, ...next.map((h) => h.uv));
    const minFeels = Math.min(c.feels, ...next.map((h) => h.feels));
    const maxWind = Math.max(c.wind, ...next.map((h) => h.wind));
    const kinds = next.map((h) => describe(h.code).kind);
    const out = [];
    if (minFeels <= -5) out.push("🧤 Gloves, hat, the works");
    else if (minFeels <= 5) out.push("🧥 Heavy coat");
    else if (minFeels <= 13) out.push("🧶 A warm layer");
    else if (minFeels <= 20) out.push("👕 Light jacket in reserve");
    else out.push("🩳 Dress light");
    if (kinds.includes("snow")) out.push("🥾 Boots with grip");
    if (maxPop >= 60) out.push("☔ Real umbrella");
    else if (maxPop >= 30) out.push("🌂 Pocket umbrella, just in case");
    if (kinds.includes("storm")) out.push("⚡ Stay indoors when it rumbles");
    if (maxUv >= 6) out.push("🧴 Sunscreen, seriously");
    else if (maxUv >= 3) out.push("🕶️ Sunglasses");
    if (maxWind >= 40) out.push("🌬️ Windproof shell");
    if (c.hum >= 85 && c.temp >= 24) out.push("💧 Water bottle; it's sticky");
    if (!c.isDay && kinds[0] === "clear") out.push("🔭 Look up tonight");
    return out;
  }

  // How alike two skies feel, 0–100.
  function similarity(a, b) {
    const ka = describe(a.code).kind, kb = describe(b.code).kind;
    const wet = (k) => ["drizzle", "rain", "storm"].includes(k);
    let s = 100;
    s -= Math.abs(a.feels - b.feels) * 3.2;
    s -= Math.abs(a.hum - b.hum) * 0.25;
    s -= Math.abs(a.wind - b.wind) * 0.35;
    s -= ka === kb ? 0 : wet(ka) === wet(kb) ? 10 : 24;
    s -= a.isDay === b.isDay ? 0 : 6;
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  window.Weather = {
    describe, forecast, search, reverse, flag, temp, wind, clock, hourLabel, dayName, compassName,
    tempColor, swatch, sentence, wear, similarity, cityNow, parseLocal,
  };
})();
