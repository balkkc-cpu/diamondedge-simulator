import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Stat } from "@/components/Stat";
import { Badge } from "@/components/Badge";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useRoundStore, summarizeRound } from "@/store/useRoundStore";
import { skillLabel } from "@/constants/skill";
import { getMockCourses } from "@/data/mockCourses";

export default function PlayHome() {
  const { palette } = useTheme();
  const router = useRouter();
  const email = useAuthStore((s) => s.user?.email ?? "golfer");
  const skill = useProfileStore((s) => s.profile.skillLevel);
  const activeRound = useRoundStore((s) => s.activeRound);
  const rounds = useRoundStore((s) => s.rounds);

  const nearest = getMockCourses()[0];
  const lastRound = rounds[0];
  const lastSummary = useMemo(() => (lastRound ? summarizeRound(lastRound) : null), [lastRound]);

  const quickCaddie = () => {
    router.push(`/hole/${nearest.id}/1`);
  };

  return (
    <Screen title={`Hey, ${email.split("@")[0]}`} subtitle={`Playing as ${skillLabel(skill)}`}>
      {activeRound ? (
        <Card accent>
          <Badge label="ROUND IN PROGRESS" tone="success" />
          <Text style={styles.activeTitle}>{activeRound.courseName}</Text>
          <Button label="Resume Round" variant="secondary" onPress={() => router.push("/round/active")} />
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.cardKicker, { color: palette.muted }]}>QUICK CADDIE</Text>
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          Get an instant shot recommendation
        </Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Jump straight to a hole, set your distance and lie, and let LoopMind tell you the smart play.
        </Text>
        <Button label="Open Rangefinder" onPress={quickCaddie} />
      </Card>

      <View style={styles.tiles}>
        <Tile icon="map" label="Find a course" onPress={() => router.push("/(tabs)/courses")} />
        <Tile icon="golf" label="Start a round" onPress={() => router.push("/(tabs)/courses")} />
        <Tile icon="trail-sign" label="Putting" onPress={() => router.push("/putting")} />
        <Tile icon="barbell" label="Practice" onPress={() => router.push("/(tabs)/practice")} />
      </View>

      {lastSummary ? (
        <Card title="Last round">
          <Text style={[styles.cardTitle, { color: palette.text }]}>{lastRound.courseName}</Text>
          <View style={styles.statRow}>
            <Stat label="Score" value={lastSummary.totalStrokes} accent />
            <Stat label="To par" value={lastSummary.toPar >= 0 ? `+${lastSummary.toPar}` : lastSummary.toPar} />
            <Stat label="Putts" value={lastSummary.putts} />
            <Stat label="GIR" value={`${lastSummary.gir}/${lastSummary.holes}`} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );

  function Tile({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.tile, { backgroundColor: palette.card, borderColor: palette.border }]}
      >
        <Ionicons name={icon} size={26} color={palette.primary} />
        <Text style={[styles.tileLabel, { color: palette.text }]}>{label}</Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  activeTitle: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "800", marginVertical: spacing.xs },
  cardKicker: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "800" },
  cardBody: { fontSize: fontSize.sm, lineHeight: 19 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    width: "47%",
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tileLabel: { fontSize: fontSize.md, fontWeight: "700" },
  statRow: { flexDirection: "row", marginTop: spacing.sm },
});
