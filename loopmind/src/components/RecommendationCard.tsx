import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { CaddieRecommendation } from "@/types/models";
import { Card } from "./Card";
import { Badge } from "./Badge";

export function RecommendationCard({ rec }: { rec: CaddieRecommendation }) {
  const { palette } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      {/* Headline play */}
      <Card accent>
        <View style={styles.headRow}>
          <Text style={styles.kicker}>THE PLAY</Text>
          <Badge label={rec.aiEnhanced ? "AI CADDIE" : "CADDIE"} tone="success" />
        </View>
        <Text style={styles.club}>{rec.primary.clubLabel}</Text>
        <Text style={styles.playsLike}>Plays like {rec.playsLikeYards} yds</Text>
        <Text style={styles.explanation}>{rec.explanation}</Text>
      </Card>

      {/* Target + miss */}
      <Card>
        <Line icon="locate" color={palette.primary} title="Target line" body={rec.targetLine} />
        <Divider />
        <Line icon="shield-checkmark" color={palette.success} title="Safe miss" body={rec.safeMiss} />
        <Divider />
        <Line icon="trophy" color={palette.warning} title="Expected result" body={rec.expectedResult} />
      </Card>

      {/* Options */}
      <Card title="Your options">
        <OptionRow tone={palette.success} label={rec.conservative.label} club={rec.conservative.clubLabel} desc={rec.conservative.description} />
        <OptionRow tone={palette.primary} label={rec.primary.label} club={rec.primary.clubLabel} desc={rec.primary.description} />
        <OptionRow tone={palette.danger} label={rec.aggressive.label} club={rec.aggressive.clubLabel} desc={rec.aggressive.description} />
      </Card>

      {rec.notes.length > 0 ? (
        <Card title="Conditions factored in">
          {rec.notes.map((n, i) => (
            <View key={i} style={styles.noteRow}>
              <Ionicons name="ellipse" size={6} color={palette.muted} />
              <Text style={[styles.noteText, { color: palette.muted }]}>{n}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );

  function Divider() {
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: spacing.sm }} />;
  }

  function Line({ icon, color, title, body }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; body: string }) {
    return (
      <View style={styles.line}>
        <Ionicons name={icon} size={18} color={color} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.lineTitle, { color: palette.text }]}>{title}</Text>
          <Text style={[styles.lineBody, { color: palette.muted }]}>{body}</Text>
        </View>
      </View>
    );
  }

  function OptionRow({ tone, label, club, desc }: { tone: string; label: string; club: string; desc: string }) {
    return (
      <View style={[styles.option, { borderColor: palette.border }]}>
        <View style={[styles.optionDot, { backgroundColor: tone }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionLabel, { color: palette.text }]}>
            {label} · <Text style={{ color: tone }}>{club}</Text>
          </Text>
          <Text style={[styles.optionDesc, { color: palette.muted }]}>{desc}</Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { color: "#CFE9DC", fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 1.5 },
  club: { color: "#FFFFFF", fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },
  playsLike: { color: "#CFE9DC", fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.sm },
  explanation: { color: "#F1FAF4", fontSize: fontSize.md, lineHeight: 22 },
  line: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  lineTitle: { fontSize: fontSize.sm, fontWeight: "800" },
  lineBody: { fontSize: fontSize.sm, lineHeight: 19, marginTop: 1 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionDot: { width: 10, height: 10, borderRadius: 5 },
  optionLabel: { fontSize: fontSize.sm, fontWeight: "700" },
  optionDesc: { fontSize: fontSize.xs, marginTop: 1, lineHeight: 16 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  noteText: { fontSize: fontSize.xs, flex: 1, lineHeight: 16 },
});
