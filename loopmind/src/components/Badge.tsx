import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";

interface BadgeProps {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

export function Badge({ label, tone = "default" }: BadgeProps) {
  const { palette } = useTheme();
  const color = {
    default: palette.muted,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    info: palette.hazard,
  }[tone];

  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}22` }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  text: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.3 },
});
