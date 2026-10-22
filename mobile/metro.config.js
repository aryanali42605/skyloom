const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Parse imports Node's "crypto"; give it a tiny phone-friendly shim instead.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: path.resolve(__dirname, "src/shims/crypto.js"),
};

module.exports = config;
