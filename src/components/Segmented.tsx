import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Stack vertically instead of a single row. */
  vertical?: boolean;
}

export function Segmented<T extends string>({ options, value, onChange, vertical }: SegmentedProps<T>) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: palette.surface, borderColor: palette.border, flexDirection: vertical ? "column" : "row" },
      ]}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[
              styles.item,
              { flex: vertical ? undefined : 1 },
              active && { backgroundColor: palette.primary },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? palette.onPrimary : palette.muted },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  item: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
});
