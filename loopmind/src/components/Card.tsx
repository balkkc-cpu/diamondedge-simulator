import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";

interface CardProps {
  children: React.ReactNode;
  title?: string;
  accent?: boolean;
  style?: ViewStyle;
}

export function Card({ children, title, accent, style }: CardProps) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: accent ? palette.accent : palette.card,
          borderColor: accent ? palette.accent : palette.border,
        },
        style,
      ]}
    >
      {title ? (
        <Text
          style={[
            styles.title,
            { color: accent ? "#FFFFFF" : palette.muted },
          ]}
        >
          {title.toUpperCase()}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1 },
});
