// Flat ESLint config for Expo (SDK 56 / ESLint 9).
// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "node_modules/*"],
  },
];
