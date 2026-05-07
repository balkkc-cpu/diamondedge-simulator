/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  name: "DiamondEdge Simulator",
  slug: "diamondedge-simulator",
  version: "1.0.0",
  orientation: "portrait",
  android: { package: "com.diamondedge.simulator" },
  ios: { bundleIdentifier: "com.diamondedge.simulator" },
  extra: {
    // Override for local dev: EXPO_PUBLIC_WEB_URL=http://YOUR_LAN_IP:3000 npx expo start
    webAppUrl: process.env.EXPO_PUBLIC_WEB_URL || "https://diamond-edge-simulator.vercel.app"
  }
};
