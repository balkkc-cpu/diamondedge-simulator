import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { useRoundStore } from "@/store/useRoundStore";
import { analyzeRounds } from "@/caddie/practice";

export default function PracticeTab() {
  const { palette } = useTheme();
  const rounds = useRoundStore((s) => s.rounds);
  const analysis = useMemo(() => analyzeRounds(rounds), [rounds]);

  const maxLost = Math.max(0.5, ...analysis.breakdown.map((b) => b.lostStrokes));

  return (
    <Screen title="Practice" subtitle="Spend your range time where it actually saves shots.">
      <Card accent>
        <Text style={styles.focusKicker}>YOUR #1 FOCUS</Text>
        <Text style={styles.focusText}>{analysis.topWeakness.message}</Text>
      </Card>

      {analysis.hasData ? (
        <Card title="Where you're losing strokes">
          {analysis.breakdown.map((b) => (
            <View key={b.area} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: palette.text }]}>{b.label}</Text>
              <View style={[styles.barTrack, { backgroundColor: palette.surface }]}>
                <View
                  style={[
                    styles.barFill,
                    { backgroundColor: palette.primary, width: `${Math.min(100, (b.lostStrokes / maxLost) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.barValue, { color: palette.muted }]}>{b.lostStrokes}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Text style={[styles.section, { color: palette.text }]}>This week’s plan</Text>
      {analysis.plan.map((item) => (
        <Card key={item.area}>
          <View style={styles.planHead}>
            <Text style={[styles.planTitle, { color: palette.text }]}>{item.title}</Text>
            <Badge label={`${item.minutesPerWeek} min/wk`} tone="info" />
          </View>
          <Text style={[styles.planDrill, { color: palette.muted }]}>{item.drill}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  focusKicker: { color: "#CFE9DC", fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 1.5 },
  focusText: { color: "#F1FAF4", fontSize: fontSize.md, lineHeight: 22, marginTop: spacing.xs },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 5 },
  barLabel: { width: 110, fontSize: fontSize.sm, fontWeight: "600" },
  barTrack: { flex: 1, height: 10, borderRadius: radius.pill, overflow: "hidden" },
  barFill: { height: 10, borderRadius: radius.pill },
  barValue: { width: 28, fontSize: fontSize.sm, textAlign: "right" },
  section: { fontSize: fontSize.lg, fontWeight: "800", marginTop: spacing.sm },
  planHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planTitle: { fontSize: fontSize.md, fontWeight: "800", flex: 1 },
  planDrill: { fontSize: fontSize.sm, lineHeight: 19 },
});
