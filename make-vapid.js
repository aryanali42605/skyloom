// Turns cloud/back4app-env.txt into cloud/vapid.js, the private key file Cloud Code reads.
// Upload cloud/vapid.js only to Back4App's cloud folder; it is git-ignored and must stay private.
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "cloud", "back4app-env.txt"), "utf8");
const keys = Object.fromEntries(
  env.split(/\r?\n/).filter((l) => /^VAPID_\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
fs.writeFileSync(
  path.join(__dirname, "cloud", "vapid.js"),
  `// PRIVATE: VAPID keys for Skyloom's web push. Do not commit or share.\nmodule.exports = ${JSON.stringify(keys, null, 2)};\n`
);
console.log("Wrote cloud/vapid.js with", Object.keys(keys).join(", "));
