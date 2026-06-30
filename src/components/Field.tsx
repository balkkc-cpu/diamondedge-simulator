import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";

interface FieldProps extends TextInputProps {
  label?: string;
}

export function Field({ label, style, ...props }: FieldProps) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={[styles.label, { color: palette.muted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
  },
});
