// Skyloom app: wires the views, the living sky, the backend and push together.
(function () {
  const W = window.Weather;
  const D = window.SKYLOOM_DEFAULTS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const state = { user: null, settings: { ...D.settings }, cities: [], weather: {}, activeId: null, drift: 0 };
  const sky = new Sky($("#sky"));

  const remember = {
    get(k) { try { return localStorage.getItem(`skyloom.${k}`); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(`skyloom.${k}`, v); } catch {} },
  };

  // ---------------- Toast ----------------
  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // Before login the sky shows the viewer's own local time.
  function ambientSky() {
    const t = Date.now() - new Date().getTimezoneOffset() * 60000;
    sky.set({ code: 1, cloud: 15, wind: 8, t });
  }

  // ---------------- Auth ----------------
  let authMode = "login";
  function setAuthMode(mode) {
    authMode = mode;
    $$("[data-auth-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.authTab === mode);
      b.setAttribute("aria-selected", b.dataset.authTab === mode);
    });
    $$("[data-only]").forEach((el) => (el.hidden = el.dataset.only !== mode));
    $("#auth-submit").textContent = mode === "login" ? "Log in" : "Create my account";
    $("#auth-form [name=password]").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("#auth-error").hidden = true;
  }

  function showAuth() {
    $("#main").hidden = true;
    $("#auth").hidden = false;
    $("#demo-box").hidden = Backend.mode !== "local";
    ambientSky();
  }

  $$("[data-auth-tab]").forEach((b) => b.addEventListener("click", () => setAuthMode(b.dataset.authTab)));

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get("email") || "").trim();
    const password = String(f.get("password") || "");
    const err = $("#auth-error");
    err.hidden = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Enter a valid email."; err.hidden = false; return; }
    if (password.length < 6) { err.textContent = "Passwords need at least 6 characters."; err.hidden = false; return; }
    const btn = $("#auth-submit");
    btn.disabled = true;
    try {
      if (authMode === "signup") {
        state.user = await Backend.signUp({ name: String(f.get("name") || "").trim(), email, password });
        for (const [i, c] of D.starterCities.entries()) await Backend.addCity(c, i);
        toast(`Welcome${state.user.name ? `, ${state.user.name}` : ""}! We started your loom with three very different skies.`, 4500);
      } else {
        state.user = await Backend.logIn({ email, password });
      }
      e.target.reset();
      await enterMain();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#forgot").addEventListener("click", async () => {
    const email = $("#auth-form [name=email]").value.trim();
    if (!email) { toast("Type your email above first."); return; }
    try { await Backend.resetPassword(email); toast("Check your inbox for a reset link."); } catch (ex) { toast(ex.message, 4500); }
  });

  // ---------------- Main ----------------
  async function enterMain() {
    state.settings = { ...state.user.settings };
    applySettings();
    $("#auth").hidden = true;
    $("#main").hidden = false;
    state.cities = await Backend.listCities();
    const last = remember.get("active");
    state.activeId = state.cities.some((c) => c.id === last) ? last : state.cities[0]?.id ?? null;
    renderAll();
    await loadAllWeather();
  }

  async function loadWeather(city) {
    try {
      state.weather[city.id] = await W.forecast(city);
    } catch (e) {
      console.warn("Weather failed for", city.name, e);
    }
  }

  async function loadAllWeather() {
    const active = state.cities.find((c) => c.id === state.activeId);
    if (active) { await loadWeather(active); renderAll(); }
    await Promise.all(state.cities.filter((c) => c !== active).map(loadWeather));
    renderAll();
  }

  const activeCity = () => state.cities.find((c) => c.id === state.activeId);

  function renderAll() {
    const empty = state.cities.length === 0;
    $("#empty").hidden = !empty;
    $("#hero").hidden = empty;
    $(".panels").hidden = empty;
    renderLoom();
    if (!empty) renderCity();
    else ambientSky();
  }

  // Conditions at the drift position: "now" or one of the next 23 hours.
  function at(w, i) {
    if (i === 0) return { ...w.current, pop: w.hourly[0]?.pop ?? 0 };
    return w.hourly[Math.min(i, w.hourly.length - 1)];
  }
  function dayOf(w, t) {
    const day = Math.floor(t / 86400000);
    return w.daily.find((d) => Math.floor(d.t / 86400000) === day) || w.daily[0];
  }

  function renderCity() {
    const city = activeCity();
    if (!city) return;
    const w = state.weather[city.id];
    const s = state.settings;
    $("#city-name").textContent = city.name;
    const where = [city.admin1, city.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
    if (!w) {
      $("#city-meta").innerHTML = `${W.flag(city.countryCode)} ${esc(where)} · loading the sky…`;
      $("#temp-now").textContent = "--";
      $("#cond").textContent = "";
      $("#sentence").textContent = "";
      return;
    }
    const now = W.cityNow(w.offset);
    $("#city-meta").innerHTML = `${W.flag(city.countryCode)} ${esc(where)} · ${W.clock(now, s)} local`;
    $("#temp-unit").textContent = `°${s.temp}`;
    $("#sentence").textContent = W.sentence(city, w);
    renderDrift();
    renderHourly(w);
    renderDaily(w);
    renderSun(w);
    renderDetails(w);
    $("#wear").innerHTML = W.wear(w).map((x) => `<li>${esc(x)}</li>`).join("");
    renderTwins(city, w);
  }

  function renderDrift() {
    const city = activeCity();
    const w = city && state.weather[city.id];
    if (!w) return;
    const s = state.settings;
    const c = at(w, state.drift);
    const d = W.describe(c.code, c.isDay);
    $("#temp-now").textContent = W.temp(c.temp, s);
    $("#cond").textContent = `${d.icon} ${d.label} · feels ${W.temp(c.feels, s)}°`;
    $("#drift-label").textContent = state.drift === 0 ? "Now" : `+${state.drift}h · ${W.clock(c.t, s)}`;
    const day = dayOf(w, c.t);
    sky.set({ code: c.code, isDay: c.isDay, cloud: c.cloud, wind: c.wind, t: state.drift === 0 ? W.cityNow(w.offset) : c.t, sunrise: day.sunrise, sunset: day.sunset });
    if (s.aura) {
      document.documentElement.style.setProperty("--aura", W.tempColor(c.temp));
      document.documentElement.style.setProperty("--aura-2", W.tempColor(c.temp + 12));
    }
    $$("#hourly .now-dot").forEach((el) => el.setAttribute("opacity", +el.dataset.i === state.drift ? 1 : 0));
  }

  $("#drift").addEventListener("input", (e) => {
    state.drift = +e.target.value;
    renderDrift();
  });

  function renderHourly(w) {
    const s = state.settings;
    const hrs = w.hourly;
    const W_ = 760, H_ = 150, padX = 18, top = 46, bottom = 104;
    const temps = hrs.map((h) => h.temp);
    const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(1, hi - lo);
    const pts = hrs.map((h, i) => [padX + (i * (W_ - padX * 2)) / (hrs.length - 1), bottom - ((h.temp - lo) / span) * (bottom - top)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }
    const stops = hrs.map((h, i) => `<stop offset="${(i / (hrs.length - 1)) * 100}%" stop-color="${W.tempColor(h.temp)}"/>`).join("");
    const cells = hrs.map((h, i) => {
      const [x, y] = pts[i];
      const lbl = i % 2 === 0;
      return `
        ${h.pop >= 20 ? `<rect x="${x - 6}" y="${H_ - 18 - h.pop * 0.18}" width="12" height="${h.pop * 0.18}" rx="3" fill="var(--aura-2)" opacity=".45"/>` : ""}
        ${lbl ? `<text class="t" x="${x}" y="${y - 12}" text-anchor="middle">${W.temp(h.temp, s)}°</text>` : ""}
        ${lbl ? `<text x="${x}" y="18" text-anchor="middle" font-size="15">${W.describe(h.code, h.isDay).icon}</text>` : ""}
        ${lbl ? `<text x="${x}" y="${H_ - 2}" text-anchor="middle">${i === 0 ? "now" : W.hourLabel(h.t, s)}</text>` : ""}
        <circle class="now-dot" data-i="${i}" cx="${x}" cy="${y}" r="6" opacity="${i === state.drift ? 1 : 0}"/>`;
    }).join("");
    $("#hourly").innerHTML = `
      <svg viewBox="0 0 ${W_} ${H_}" preserveAspectRatio="none" role="img" aria-label="Temperature over the next 24 hours">
        <defs><linearGradient id="hg" x1="0" x2="1">${stops}</linearGradient>
        <linearGradient id="hf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--aura)" stop-opacity=".35"/><stop offset="1" stop-color="var(--aura)" stop-opacity="0"/></linearGradient></defs>
        <path d="${d} L${pts[pts.length - 1][0]},${bottom + 20} L${pts[0][0]},${bottom + 20} Z" fill="url(#hf)" stroke="none"/>
        <path d="${d}" stroke="url(#hg)" stroke-width="3.5" fill="none"/>
        ${cells}
      </svg>`;
    const rainy = hrs.findIndex((h) => h.pop >= 50);
    $("#hourly-note").textContent = rainy === -1 ? "No real rain on the way" : rainy === 0 ? "Rain likely now" : `Rain likely in ~${rainy}h`;
  }

  function renderDaily(w) {
    const s = state.settings;
    const lo = Math.min(...w.daily.map((d) => d.min)), hi = Math.max(...w.daily.map((d) => d.max)), span = Math.max(1, hi - lo);
    $("#daily").innerHTML = w.daily.map((d, i) => `
      <li>
        <span>${W.dayName(d.t, i)}</span>
        <span class="ico" title="${esc(W.describe(d.code).label)}">${W.describe(d.code).icon}</span>
        <span class="lo">${W.temp(d.min, s)}°</span>
        <span class="tide"><i style="left:${((d.min - lo) / span) * 100}%;right:${100 - ((d.max - lo) / span) * 100}%;background:linear-gradient(90deg,${W.tempColor(d.min)},${W.tempColor(d.max)})"></i></span>
        <span class="hi">${W.temp(d.max, s)}°</span>
      </li>`).join("");
  }

  function renderSun(w) {
    const s = state.settings;
    const d = w.daily[0];
    const now = W.cityNow(w.offset);
    const p = Math.max(0, Math.min(1, (now - d.sunrise) / (d.sunset - d.sunrise)));
    const up = now >= d.sunrise && now <= d.sunset;
    const cx = 110, cy = 92, r = 80;
    const ang = Math.PI * (1 - p);
    const sx = cx + r * Math.cos(ang), sy = cy - r * Math.sin(ang);
    const len = (d.sunset - d.sunrise) / 3600000;
    const msg = up ? `${Math.floor(((d.sunset - now) / 3600000))}h ${Math.round((((d.sunset - now) / 60000) % 60))}m of light left` : now < d.sunrise ? "The sun is still below the horizon" : "The sun has set";
    $("#sunarc").innerHTML = `
      <svg viewBox="0 0 220 130" role="img" aria-label="Sunrise and sunset">
        <defs><linearGradient id="sa" x1="0" x2="1"><stop offset="0" stop-color="#ffb27a"/><stop offset=".5" stop-color="#ffe7a8"/><stop offset="1" stop-color="#ff7ab6"/></linearGradient></defs>
        <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" stroke="var(--line-strong)" stroke-dasharray="3 5"/>
        <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${sx},${sy}" stroke="url(#sa)" stroke-width="3"/>
        <line x1="10" x2="210" y1="${cy}" y2="${cy}" stroke="var(--line-strong)"/>
        ${up ? `<circle cx="${sx}" cy="${sy}" r="9" fill="#ffd27a" stroke="none"/><circle cx="${sx}" cy="${sy}" r="16" fill="#ffd27a" opacity=".2" stroke="none"/>` : ""}
        <text x="${cx - r}" y="${cy + 18}" text-anchor="middle">↑ ${W.clock(d.sunrise, s)}</text>
        <text x="${cx + r}" y="${cy + 18}" text-anchor="middle">↓ ${W.clock(d.sunset, s)}</text>
        <text x="${cx}" y="${cy - 26}" text-anchor="middle" style="font-weight:700;fill:var(--ink)">${Math.floor(len)}h ${Math.round((len % 1) * 60)}m</text>
        <text x="${cx}" y="${cy - 10}" text-anchor="middle">of daylight</text>
      </svg>
      <p class="muted small center" style="margin:4px 0 0">${msg}</p>`;
  }

  function renderDetails(w) {
    const s = state.settings;
    const c = w.current;
    const uvWord = c.uv < 3 ? "low" : c.uv < 6 ? "moderate" : c.uv < 8 ? "high" : "very high";
    const items = [
      ["Feels like", `${W.temp(c.feels, s)}°`],
      ["Humidity", `${c.hum}%`],
      ["Wind", `<svg class="compass" viewBox="0 0 24 24" style="transform:rotate(${c.windDir + 180}deg)"><path d="M12 3v18M6 9l6-6 6 6"/></svg>${W.wind(c.wind, s)} ${W.compassName(c.windDir)}`],
      ["UV index", `${Math.round(c.uv)} <span class="muted small">${uvWord}</span>`],
      ["Cloud cover", `${c.cloud}%`],
      ["Pressure", `${Math.round(c.pressure)} hPa`],
      ["Visibility", c.visibility != null ? `${(c.visibility / 1000).toFixed(c.visibility < 10000 ? 1 : 0)} km` : "—"],
      ["Rain now", `${c.precip} mm`],
    ];
    $("#details").innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  }

  function renderTwins(city, w) {
    const s = state.settings;
    const others = state.cities.filter((c) => c.id !== city.id && state.weather[c.id]);
    if (!others.length) {
      $("#twins").innerHTML = `<p class="muted">Add more cities and Skyloom will find which ones are secretly sharing the same weather.</p>`;
      return;
    }
    const ranked = others
      .map((c) => ({ c, w: state.weather[c.id], score: W.similarity(w.current, state.weather[c.id].current) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    $("#twins").innerHTML = ranked.map(({ c, w: ow, score }) => {
      const d = W.describe(ow.current.code, ow.current.isDay);
      const verdict = score >= 80 ? "Sky twins" : score >= 60 ? "Close cousins" : score >= 35 ? "Distant relatives" : "Total opposites";
      return `<button class="twin" data-go="${c.id}">
        <span class="match">${score}% ALIKE · ${verdict.toUpperCase()}</span>
        <strong>${W.flag(c.countryCode)} ${esc(c.name)}</strong>
        <span class="muted small">${d.icon} ${W.temp(ow.current.temp, s)}° · ${esc(d.label)} · ${W.clock(W.cityNow(ow.offset), s)}</span>
      </button>`;
    }).join("");
  }

  $("#twins").addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) selectCity(b.dataset.go);
  });

  // ---------------- Loom ----------------
  function renderLoom() {
    const s = state.settings;
    const threads = state.cities.map((c) => {
      const w = state.weather[c.id];
      let bg = "linear-gradient(135deg,#2a2f4a,#4a4f6a)", temp = "··", time = "";
      if (w) {
        const [a, b] = W.swatch(W.describe(w.current.code).kind, w.current.isDay);
        bg = `radial-gradient(circle at 85% 15%, ${W.tempColor(w.current.temp, 0.75)}, transparent 55%), linear-gradient(135deg, ${a}, ${b})`;
        temp = `${W.temp(w.current.temp, s)}°`;
        time = `${W.describe(w.current.code, w.current.isDay).icon} ${W.clock(W.cityNow(w.offset), s)}`;
      }
      return `<div class="thread ${c.id === state.activeId ? "active" : ""}" style="background:${bg}" data-id="${c.id}" role="button" tabindex="0" aria-label="${esc(c.name)}">
        <span class="t-name">${W.flag(c.countryCode)} ${esc(c.name)}</span>
        <span class="t-row"><span class="t-temp">${temp}</span><span class="t-time">${time}</span></span>
        <button class="t-x" data-remove="${c.id}" aria-label="Remove ${esc(c.name)}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
    });
    threads.push(`<button class="thread add" data-open="add"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 5v14M5 12h14"/></svg><span class="small">Add city</span></button>`);
    $("#loom").innerHTML = threads.join("");
  }

  function selectCity(id) {
    state.activeId = id;
    state.drift = 0;
    $("#drift").value = 0;
    remember.set("active", id);
    renderLoom();
    renderCity();
    window.scrollTo({ top: 0, behavior: "smooth" });
    $(`.thread[data-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  $("#loom").addEventListener("click", async (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      e.stopPropagation();
      const city = state.cities.find((c) => c.id === rm.dataset.remove);
      if (!city || !confirm(`Remove ${city.name} from your loom?`)) return;
      try {
        await Backend.removeCity(city.id);
        state.cities = state.cities.filter((c) => c.id !== city.id);
        delete state.weather[city.id];
        if (state.activeId === city.id) state.activeId = state.cities[0]?.id ?? null;
        renderAll();
        toast(`${city.name} removed.`);
      } catch (ex) { toast(ex.message); }
      return;
    }
    const t = e.target.closest(".thread[data-id]");
    if (t) selectCity(t.dataset.id);
  });
  $("#loom").addEventListener("keydown", (e) => {
    const t = e.target.closest(".thread[data-id]");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectCity(t.dataset.id); }
  });

  // ---------------- Add city ----------------
  const addSheet = $("#add-sheet");
  let searchTimer, lastResults = [];

  function openSheet(sheet) {
    sheet.showModal();
    if (sheet === addSheet) { $("#city-q").value = ""; $("#results").innerHTML = ""; setTimeout(() => $("#city-q").focus(), 50); }
  }
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) openSheet(o.dataset.open === "add" ? addSheet : settingsSheet);
    const c = e.target.closest("[data-close]");
    if (c) c.closest("dialog").close();
  });
  $$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  $("#open-add").addEventListener("click", () => openSheet(addSheet));

  $("#city-q").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(async () => {
      if (q.trim().length < 2) { $("#results").innerHTML = ""; return; }
      try {
        lastResults = await W.search(q);
        $("#results").innerHTML = lastResults.length
          ? lastResults.map((r, i) => `<li><button data-pick="${i}">
              <span><span class="flag">${W.flag(r.countryCode)}</span> <strong>${esc(r.name)}</strong><br><span class="r-sub">${esc([r.admin1, r.country].filter(Boolean).join(", "))}${r.population ? ` · ${r.population.toLocaleString()} people` : ""}</span></span>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5v14M5 12h14"/></svg>
            </button></li>`).join("")
          : `<li class="muted center">No places match "${esc(q)}". Try another spelling.</li>`;
      } catch { $("#results").innerHTML = `<li class="muted center">Search is unavailable right now.</li>`; }
    }, 280);
  });

  async function addCity(place) {
    const dupe = state.cities.find((c) => Math.abs(c.lat - place.lat) < 0.05 && Math.abs(c.lon - place.lon) < 0.05);
    if (dupe) { addSheet.close(); selectCity(dupe.id); toast(`${dupe.name} is already in your loom.`); return; }
    try {
      const order = state.cities.reduce((m, c) => Math.max(m, c.order || 0), -1) + 1;
      const city = await Backend.addCity(place, order);
      state.cities.push(city);
      addSheet.close();
      selectCity(city.id);
      toast(`${city.name} woven into your loom.`);
      await loadWeather(city);
      renderAll();
    } catch (ex) { toast(ex.message); }
  }

  $("#results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (b) addCity(lastResults[+b.dataset.pick]);
  });

  $("#use-location").addEventListener("click", () => {
    if (!navigator.geolocation) { toast("Location isn't available in this browser."); return; }
    const btn = $("#use-location");
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try { await addCity(await W.reverse(pos.coords.latitude, pos.coords.longitude)); }
        catch { toast("Couldn't work out where you are."); }
        btn.disabled = false;
      },
      () => { toast("Location permission was declined."); btn.disabled = false; },
      { timeout: 10000, maximumAge: 600000 }
    );
  });

  // ---------------- Settings ----------------
  const settingsSheet = $("#settings-sheet");
  $("#open-settings").addEventListener("click", () => { syncSettingsForm(); openSheet(settingsSheet); });

  $("#notify-hour").innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("");

  function syncSettingsForm() {
    const s = state.settings;
    $$(".seg[data-setting]").forEach((seg) => $$("button", seg).forEach((b) => b.classList.toggle("on", b.dataset.v === s[seg.dataset.setting])));
    $$("[data-setting-check]").forEach((c) => (c.checked = !!s[c.dataset.settingCheck]));
    $("#notify-toggle").checked = !!s.notify && Notification?.permission === "granted";
    $("#notify-hour").value = s.notifyHour;
    $("#acct-email").textContent = state.user?.email || "—";
    $("#acct-backend").textContent = Backend.mode === "back4app" ? "Back4App" : "This browser only";
    $("#push-status").textContent = !Push.supported
      ? "This browser can't receive push notifications."
      : Push.live()
        ? "Digests are sent by Back4App Cloud Code at your chosen hour, in each city's own timezone."
        : "Push is in preview mode until Back4App keys and a VAPID key are added to config.js.";
  }

  function applySettings() {
    const s = state.settings;
    document.documentElement.dataset.theme = s.theme;
    sky.setMotion(s.motion);
    if (!s.aura) { document.documentElement.style.removeProperty("--aura"); document.documentElement.style.removeProperty("--aura-2"); }
  }

  let saveTimer;
  function saveSettings() {
    applySettings();
    renderAll();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await Backend.saveSettings(state.settings);
        if (state.settings.notify) await Push.updatePrefs(pushPrefs());
      } catch (ex) { toast(`Couldn't save settings: ${ex.message}`); }
    }, 400);
  }

  const pushPrefs = () => ({
    notify: state.settings.notify,
    notifyHour: +state.settings.notifyHour,
    alerts: state.settings.alerts,
    temp: state.settings.temp,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  $$(".seg[data-setting]").forEach((seg) =>
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      state.settings[seg.dataset.setting] = b.dataset.v;
      syncSettingsForm();
      saveSettings();
    })
  );
  $$("[data-setting-check]").forEach((c) =>
    c.addEventListener("change", () => { state.settings[c.dataset.settingCheck] = c.checked; saveSettings(); })
  );
  $("#notify-hour").addEventListener("change", (e) => { state.settings.notifyHour = +e.target.value; saveSettings(); });

  $("#notify-toggle").addEventListener("change", async (e) => {
    const on = e.target.checked;
    try {
      if (on) {
        state.settings.notify = true;
        const r = await Push.enable(pushPrefs());
        toast(r.simulated ? "Digest on (preview mode on this device)." : `Daily digest on. See you at ${String(state.settings.notifyHour).padStart(2, "0")}:00.`);
      } else {
        state.settings.notify = false;
        await Push.disable();
        toast("Daily digest off.");
      }
      saveSettings();
    } catch (ex) {
      e.target.checked = false;
      state.settings.notify = false;
      toast(ex.message, 5000);
    }
  });

  function localDigest() {
    const s = state.settings;
    const lines = state.cities.filter((c) => state.weather[c.id]).slice(0, 6).map((c) => {
      const w = state.weather[c.id];
      const d = W.describe(w.current.code, w.current.isDay);
      return `${d.icon} ${c.name} ${W.temp(w.current.temp, s)}°`;
    });
    const stormy = state.cities.find((c) => state.weather[c.id]?.hourly.slice(0, 12).some((h) => h.code >= 95));
    return {
      title: stormy ? `⚡ Storm watch for ${stormy.name}` : "Skyloom · your skies right now",
      body: lines.join("  ·  ") || "Add a city to get your first digest.",
    };
  }

  $("#test-push").addEventListener("click", async () => {
    try { toast(await Push.test(localDigest()), 5000); } catch (ex) { toast(ex.message, 5000); }
  });

  $("#sign-out").addEventListener("click", async () => {
    await Backend.logOut();
    settingsSheet.close();
    Object.assign(state, { user: null, cities: [], weather: {}, activeId: null, drift: 0 });
    document.documentElement.style.removeProperty("--aura");
    document.documentElement.style.removeProperty("--aura-2");
    setAuthMode("login");
    showAuth();
  });

  // ---------------- Lifecycle ----------------
  setInterval(() => { if (state.user && !document.hidden) loadAllWeather(); }, D.refreshMinutes * 60000);
  setInterval(() => { if (state.user && !document.hidden) { renderLoom(); if (state.drift === 0) renderDrift(); } }, 60000);

  (async function boot() {
    setAuthMode("login");
    Push.register();
    try { state.user = await Backend.current(); } catch { state.user = null; }
    if (state.user) await enterMain();
    else showAuth();
  })();
})();
