import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";

interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

export function Stepper({ label, value, onChange, min = 0, max = 20 }: StepperProps) {
  const { palette } = useTheme();
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      <View style={styles.controls}>
        <Pressable onPress={() => onChange(clamp(value - 1))} style={[styles.btn, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Ionicons name="remove" size={18} color={palette.text} />
        </Pressable>
        <Text style={[styles.value, { color: palette.text }]}>{value}</Text>
        <Pressable onPress={() => onChange(clamp(value + 1))} style={[styles.btn, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Ionicons name="add" size={18} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: fontSize.md, fontWeight: "600" },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  btn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { fontSize: fontSize.lg, fontWeight: "800", minWidth: 28, textAlign: "center" },
});
