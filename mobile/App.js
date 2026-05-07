import React from "react";
import { SafeAreaView, StyleSheet, Text } from "react-native";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";

const WEB_APP_URL =
  Constants.expoConfig?.extra?.webAppUrl ||
  process.env.EXPO_PUBLIC_WEB_URL ||
  "https://diamond-edge-simulator.vercel.app";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>DiamondEdge Simulator</Text>
      <Text style={styles.sub} numberOfLines={1}>
        {WEB_APP_URL}
      </Text>
      <WebView source={{ uri: WEB_APP_URL }} style={styles.webview} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080C17" },
  header: { color: "#e2e8f0", paddingHorizontal: 12, paddingTop: 8, fontWeight: "800", fontSize: 16 },
  sub: { color: "#64748b", paddingHorizontal: 12, paddingBottom: 6, fontSize: 10 },
  webview: { flex: 1 }
});
