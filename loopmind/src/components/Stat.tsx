import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize } from "@/theme/colors";

interface StatProps {
  label: string;
  value: string | number;
  accent?: boolean;
}

export function Stat({ label, value, accent }: StatProps) {
  const { palette } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.value, { color: accent ? palette.primary : palette.text }]}>{value}</Text>
      <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", flex: 1 },
  value: { fontSize: fontSize.xl, fontWeight: "800" },
  label: { fontSize: fontSize.xs, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
});
