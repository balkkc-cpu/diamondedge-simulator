import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Entry route. The auth gate in `_layout.tsx` redirects away from here to the
 * correct destination (sign-in / onboarding / tabs) once stores have hydrated.
 */
export default function Index() {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.background }}>
      <ActivityIndicator color={palette.primary} size="large" />
    </View>
  );
}
