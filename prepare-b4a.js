// Builds b4a-deploy/ in the layout Back4App Cloud Code expects:
//   cloud/   → Cloud Code (main.js, package.json)
//   public/  → the web app, served by Back4App Web Hosting
// Run it again whenever you change the app: `node prepare-b4a.js`
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "b4a-deploy");
const CLOUD = ["main.js", "package.json"]; // never back4app-env.txt
const PUBLIC = ["index.html", "styles.css", "config.js", "defaults.js", "sw.js", "manifest.webmanifest", "icon.svg", "js"];

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of CLOUD) fs.cpSync(path.join(ROOT, "cloud", f), path.join(OUT, "cloud", f));
for (const f of PUBLIC) fs.cpSync(path.join(ROOT, f), path.join(OUT, "public", f), { recursive: true });

// Back4App's file uploader garbles UTF-8 (emoji, °, —), so every uploaded text file is made
// plain ASCII using each language's own escapes. The browser shows exactly the same characters.
const ESCAPE = {
  ".js": (c) => Array.from({ length: c.length }, (_, i) => "\\u" + c.charCodeAt(i).toString(16).padStart(4, "0")).join(""),
  ".html": (c) => `&#x${c.codePointAt(0).toString(16)};`,
  ".css": (c) => `\\${c.codePointAt(0).toString(16)} `,
  ".json": (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
};
ESCAPE[".webmanifest"] = ESCAPE[".json"];
(function asciify(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { asciify(p); continue; }
    const esc = ESCAPE[path.extname(p)];
    if (!esc) continue;
    const src = fs.readFileSync(p, "utf8");
    const out = path.extname(p) === ".json" || path.extname(p) === ".webmanifest"
      ? src.replace(/[^\x00-\x7f]/g, esc)
      : src.replace(/[^\x00-\x7f]/gu, esc);
    fs.writeFileSync(p, out);
  }
})(OUT);

const cfg = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
if (cfg.includes("YOUR_BACK4APP")) console.warn("⚠  config.js still has placeholder Back4App keys; the hosted app will run in local mode.");
console.log(`Ready: ${path.relative(ROOT, OUT)}/cloud and ${path.relative(ROOT, OUT)}/public`);
