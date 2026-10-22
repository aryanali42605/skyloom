// Parse's React Native build calls require("crypto").randomUUID, which phones don't have.
// metro.config.js points "crypto" here; getRandomValues comes from react-native-get-random-values.
function randomUUID() {
  const b = new Uint8Array(16);
  global.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

module.exports = { randomUUID, getRandomValues: (a) => global.crypto.getRandomValues(a) };
