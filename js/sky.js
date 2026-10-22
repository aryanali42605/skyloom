// The living sky: a full-screen canvas painted from the real conditions and the city's local time.
// Sky colour follows the sun's height, then clouds, rain, snow, fog, lightning, stars and a
// night-time aurora are layered on top. Everything eases toward the new state, so drifting
// through the forecast or switching cities morphs the sky instead of cutting.
(function () {
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Sky gradients [top, horizon] keyed by sun altitude (-1 deep night … 1 high noon).
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
    const l = STOPS[STOPS.length - 1];
    return [l.top, l.bottom];
  }

  const GREY_DAY = hex("#6f7a8f"), GREY_NIGHT = hex("#141824"), STORM = hex("#211c3a");

  class Sky {
    constructor(canvas) {
      this.c = canvas;
      this.x = canvas.getContext("2d");
      this.target = { alt: -0.4, cloud: 20, rain: 0, snow: 0, fog: 0, storm: 0, wind: 8, aurora: 0.6 };
      this.s = { ...this.target };
      this.motion = true;
      this.t = 0;
      this.flash = 0;
      this.resize();
      addEventListener("resize", () => this.resize());
      this.seed();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.w = innerWidth;
      this.h = innerHeight;
      this.c.width = this.w * dpr;
      this.c.height = this.h * dpr;
      this.x.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.seed();
    }

    seed() {
      const r = Math.random;
      const area = (this.w * this.h) / 9000;
      this.stars = Array.from({ length: Math.round(area * 1.4) }, () => ({ x: r(), y: r() * 0.75, z: r(), p: r() * 6.28 }));
      this.clouds = Array.from({ length: 14 }, (_, i) => ({ x: r() * 1.4 - 0.2, y: 0.05 + r() * 0.5, s: 0.6 + r() * 1.1, z: i / 14, puffs: Array.from({ length: 6 }, () => [r() - 0.5, r() * 0.35 - 0.17, 0.35 + r() * 0.4]) }));
      this.drops = Array.from({ length: 420 }, () => ({ x: r(), y: r(), l: 0.6 + r() * 0.8, v: 0.7 + r() * 0.6 }));
      this.flakes = Array.from({ length: 260 }, () => ({ x: r(), y: r(), r: 0.8 + r() * 2.4, v: 0.25 + r() * 0.5, p: r() * 6.28 }));
    }

    // conditions: { code, isDay, cloud, wind, t (shifted epoch), sunrise, sunset }
    set(cond) {
      const W = window.Weather;
      const kind = W.describe(cond.code).kind;
      const code = cond.code;
      const hour = new Date(cond.t).getUTCHours() + new Date(cond.t).getUTCMinutes() / 60;
      const rise = cond.sunrise ? new Date(cond.sunrise).getUTCHours() + new Date(cond.sunrise).getUTCMinutes() / 60 : 6.5;
      const set = cond.sunset ? new Date(cond.sunset).getUTCHours() + new Date(cond.sunset).getUTCMinutes() / 60 : 18.5;
      // Sun altitude: sine over the daylight window, a matching dip at night.
      let alt;
      if (hour >= rise && hour <= set) alt = Math.sin(((hour - rise) / (set - rise)) * Math.PI);
      else {
        const nightLen = 24 - (set - rise);
        const into = hour > set ? hour - set : hour + 24 - set;
        alt = -Math.sin((into / nightLen) * Math.PI);
      }
      this.sunPos = hour >= rise && hour <= set ? (hour - rise) / (set - rise) : null;
      this.moonPos = this.sunPos === null ? ((hour > set ? hour - set : hour + 24 - set) / (24 - (set - rise))) : null;
      const heavy = [65, 67, 75, 82, 86, 99].includes(code);
      this.target = {
        alt,
        cloud: kind === "clear" ? Math.min(cond.cloud ?? 10, 25) : cond.cloud ?? 70,
        rain: kind === "drizzle" ? 0.25 : kind === "rain" ? (heavy ? 1 : 0.6) : kind === "storm" ? 1 : 0,
        snow: kind === "snow" ? (heavy ? 1 : 0.55) : 0,
        fog: kind === "fog" ? 1 : 0,
        storm: kind === "storm" ? 1 : 0,
        wind: cond.wind ?? 8,
        aurora: alt < -0.1 && (kind === "clear" || kind === "partly") ? 1 : 0,
      };
      if (!this.motion) { this.s = { ...this.target }; this.draw(); }
    }

    setMotion(on) {
      this.motion = on && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!this.motion) { this.s = { ...this.target }; this.draw(); }
    }

    loop(ts) {
      requestAnimationFrame(this.loop);
      if (!this.motion || document.hidden) return;
      const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
      this.last = ts;
      this.t += dt;
      for (const k in this.target) this.s[k] = lerp(this.s[k], this.target[k], 1 - Math.pow(0.02, dt));
      this.draw(dt);
    }

    draw(dt = 0) {
      const { x, w, h, s } = this;
      const overcast = clamp((s.cloud - 30) / 70);
      let [top, bottom] = skyAt(s.alt);
      const grey = s.alt > 0 ? GREY_DAY : GREY_NIGHT;
      top = mix(top, grey, overcast * 0.75);
      bottom = mix(bottom, grey, overcast * 0.7);
      top = mix(top, STORM, s.storm * 0.6);
      bottom = mix(bottom, STORM, s.storm * 0.4);

      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgb(top));
      g.addColorStop(1, rgb(bottom));
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);

      const night = clamp(-s.alt * 2.2);
      const clearness = 1 - overcast;

      // Stars
      if (night > 0.02 && clearness > 0.05) {
        for (const st of this.stars) {
          const tw = 0.55 + 0.45 * Math.sin(this.t * (1 + st.z * 2) + st.p);
          x.fillStyle = `rgba(255,255,255,${night * clearness * tw * (0.35 + st.z * 0.65)})`;
          x.fillRect(st.x * w, st.y * h, 1 + st.z, 1 + st.z);
        }
      }

      // Aurora ribbons
      if (s.aurora > 0.02) {
        x.save();
        x.globalCompositeOperation = "lighter";
        for (let band = 0; band < 3; band++) {
          const hue = [150, 190, 280][band];
          x.beginPath();
          for (let i = 0; i <= 40; i++) {
            const px = (i / 40) * w;
            const py = h * (0.18 + band * 0.07) + Math.sin(i * 0.35 + this.t * 0.25 + band) * h * 0.05 + Math.sin(i * 0.11 - this.t * 0.15) * h * 0.04;
            i ? x.lineTo(px, py) : x.moveTo(px, py);
          }
          const ag = x.createLinearGradient(0, h * 0.05, 0, h * 0.5);
          ag.addColorStop(0, `hsla(${hue},90%,60%,0)`);
          ag.addColorStop(0.5, `hsla(${hue},90%,60%,${0.16 * s.aurora * clearness})`);
          ag.addColorStop(1, `hsla(${hue},90%,60%,0)`);
          x.strokeStyle = ag;
          x.lineWidth = h * 0.12;
          x.filter = "blur(18px)";
          x.stroke();
        }
        x.restore();
      }

      // Sun or moon on its arc
      const arc = (p) => [w * (0.1 + p * 0.8), h * (0.62 - Math.sin(p * Math.PI) * 0.48)];
      if (this.sunPos != null) {
        const [sx, sy] = arc(this.sunPos);
        const glow = x.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.45);
        glow.addColorStop(0, `rgba(255,236,190,${0.75 * (1 - overcast * 0.8)})`);
        glow.addColorStop(0.12, `rgba(255,200,140,${0.25 * (1 - overcast * 0.8)})`);
        glow.addColorStop(1, "rgba(255,200,140,0)");
        x.fillStyle = glow;
        x.fillRect(0, 0, w, h);
        x.fillStyle = `rgba(255,248,225,${1 - overcast * 0.85})`;
        x.beginPath(); x.arc(sx, sy, Math.min(w, h) * 0.045, 0, 6.28); x.fill();
      } else if (this.moonPos != null) {
        const [mx, my] = arc(this.moonPos);
        const r = Math.min(w, h) * 0.035;
        const glow = x.createRadialGradient(mx, my, 0, mx, my, r * 8);
        glow.addColorStop(0, `rgba(220,225,255,${0.35 * clearness})`);
        glow.addColorStop(1, "rgba(220,225,255,0)");
        x.fillStyle = glow; x.fillRect(0, 0, w, h);
        x.fillStyle = `rgba(240,240,255,${0.95 * clearness + 0.05})`;
        x.beginPath(); x.arc(mx, my, r, 0, 6.28); x.fill();
        x.fillStyle = rgb(top, 0.9);
        x.beginPath(); x.arc(mx + r * 0.45, my - r * 0.2, r * 0.9, 0, 6.28); x.fill();
      }

      // Clouds
      const count = Math.round((s.cloud / 100) * this.clouds.length);
      const tone = s.alt > 0 ? mix([255, 255, 255], [150, 158, 175], overcast * 0.8 + s.storm * 0.3) : mix([90, 96, 130], [40, 44, 62], overcast);
      for (let i = 0; i < count; i++) {
        const cl = this.clouds[i];
        cl.x += dt * (0.004 + s.wind * 0.0006) * (0.5 + cl.z);
        if (cl.x > 1.3) cl.x = -0.3;
        const cx = cl.x * w, cy = cl.y * h, size = cl.s * Math.min(w, h) * 0.22;
        for (const [ox, oy, r] of cl.puffs) {
          const px = cx + ox * size * 2, py = cy + oy * size, pr = r * size;
          const cg = x.createRadialGradient(px, py, 0, px, py, pr);
          cg.addColorStop(0, rgb(tone, 0.28 + overcast * 0.2));
          cg.addColorStop(1, rgb(tone, 0));
          x.fillStyle = cg;
          x.beginPath(); x.arc(px, py, pr, 0, 6.28); x.fill();
        }
      }

      // Rain
      if (s.rain > 0.02) {
        const n = Math.round(this.drops.length * s.rain);
        const slant = s.wind * 0.012;
        x.strokeStyle = s.alt > 0 ? "rgba(220,235,255,.45)" : "rgba(170,190,230,.35)";
        x.lineWidth = 1;
        x.beginPath();
        for (let i = 0; i < n; i++) {
          const d = this.drops[i];
          d.y += dt * d.v * 1.6;
          d.x += dt * slant * 0.2;
          if (d.y > 1) { d.y = -0.05; d.x = Math.random(); }
          const px = d.x * w, py = d.y * h, len = d.l * 22;
          x.moveTo(px, py); x.lineTo(px - slant * len, py + len);
        }
        x.stroke();
      }

      // Snow
      if (s.snow > 0.02) {
        const n = Math.round(this.flakes.length * s.snow);
        x.fillStyle = "rgba(255,255,255,.85)";
        for (let i = 0; i < n; i++) {
          const f = this.flakes[i];
          f.y += dt * f.v * 0.18;
          f.p += dt;
          if (f.y > 1) { f.y = -0.02; f.x = Math.random(); }
          const px = (f.x + Math.sin(f.p) * 0.01 + s.wind * 0.0004 * f.y) * w;
          x.beginPath(); x.arc(px % w, f.y * h, f.r, 0, 6.28); x.fill();
        }
      }

      // Fog banks
      if (s.fog > 0.02) {
        for (let i = 0; i < 4; i++) {
          const fy = h * (0.45 + i * 0.14);
          const fg = x.createLinearGradient(0, fy - h * 0.15, 0, fy + h * 0.15);
          const shade = s.alt > 0 ? "220,224,232" : "90,96,115";
          fg.addColorStop(0, `rgba(${shade},0)`);
          fg.addColorStop(0.5, `rgba(${shade},${0.35 * s.fog})`);
          fg.addColorStop(1, `rgba(${shade},0)`);
          x.fillStyle = fg;
          x.fillRect(0, fy - h * 0.15, w, h * 0.3);
        }
      }

      // Lightning
      if (s.storm > 0.3 && this.motion) {
        if (Math.random() < dt * 0.25) this.flash = 1;
        if (this.flash > 0.01) {
          x.fillStyle = `rgba(230,225,255,${this.flash * 0.45})`;
          x.fillRect(0, 0, w, h);
          this.flash *= Math.pow(0.001, dt);
        }
      }
    }
  }

  window.Sky = Sky;
})();
