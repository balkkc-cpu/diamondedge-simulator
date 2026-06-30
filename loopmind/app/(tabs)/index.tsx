import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { personaForUser } from "@/caddie/persona";
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
  const persona = useMemo(() => personaForUser(email), [email]);

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

      <LinearGradient colors={["#0B3D2E", "#16A34A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroBadge}>
          <Ionicons name="person-circle" size={18} color="#CFE9DC" />
          <Text style={styles.heroBadgeText}>
            YOUR CADDIE · {persona.name.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.heroTitle}>“{persona.tagline}”</Text>
        <Text style={styles.heroBody}>
          Jump to a hole, set your number, and {persona.name} calls the smart play from the clubs in your bag.
        </Text>
        <Button label="Open Rangefinder" variant="secondary" onPress={quickCaddie} />
      </LinearGradient>

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
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  heroBadgeText: { color: "#CFE9DC", fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 1 },
  heroTitle: { color: "#FFFFFF", fontSize: fontSize.xl, fontWeight: "900", letterSpacing: -0.5 },
  heroBody: { color: "#E7F2EC", fontSize: fontSize.sm, lineHeight: 19, marginBottom: spacing.xs },
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
