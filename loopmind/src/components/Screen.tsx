import React from "react";
import { ScrollView, StyleSheet, Text, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";

interface ScreenProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  /** Content rendered at the bottom, outside the scroll area (e.g. CTA). */
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
}

export function Screen({ children, title, subtitle, scroll = true, footer, contentStyle }: ScreenProps) {
  const { palette } = useTheme();
  const Body = scroll ? ScrollView : View;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={["top", "left", "right"]}>
      {title ? (
        <View style={[styles.header, { paddingHorizontal: spacing.xl }]}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
        </View>
      ) : null}
      <Body
        style={styles.body}
        contentContainerStyle={[
          { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Body>
      {footer ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: palette.background, borderTopColor: palette.border },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
  header: { paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, marginTop: 2 },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
