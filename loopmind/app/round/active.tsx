import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { Badge } from "@/components/Badge";
import { LiveRangefinder } from "@/components/LiveRangefinder";
import { HoleScoreCard } from "@/components/HoleScoreCard";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { useRoundStore, summarizeRound } from "@/store/useRoundStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { getCourseById } from "@/services/courses";

export default function ActiveRound() {
  const { palette } = useTheme();
  const router = useRouter();
  const activeRound = useRoundStore((s) => s.activeRound);
  const updateHoleScore = useRoundStore((s) => s.updateHoleScore);
  const finishRound = useRoundStore((s) => s.finishRound);
  const discardRound = useRoundStore((s) => s.discardRound);
  const advancedScoring = useSettingsStore((s) => s.advancedScoring);
  const setAdvancedScoring = useSettingsStore((s) => s.setAdvancedScoring);
  const [index, setIndex] = useState(0);

  if (!activeRound) {
    return (
      <Screen title="No active round">
        <Text style={{ color: palette.muted }}>Start a round from a course to track your score.</Text>
        <Button label="Find a course" onPress={() => router.replace("/(tabs)/courses")} />
      </Screen>
    );
  }

  const course = getCourseById(activeRound.courseId);
  const hs = activeRound.holeScores[index];
  const hole = course?.holes.find((h) => h.number === hs.holeNumber);
  const summary = summarizeRound(activeRound);
  const isLast = index === activeRound.holeScores.length - 1;

  const finish = () => {
    finishRound();
    router.replace("/round/summary");
  };

  return (
    <Screen
      title={activeRound.courseName}
      subtitle={`Through ${index} · ${summary.toPar >= 0 ? "+" : ""}${summary.toPar} to par`}
      footer={
        isLast ? (
          <Button label="Finish & Save Round" onPress={finish} />
        ) : (
          <Button label="Next Hole →" onPress={() => setIndex((i) => Math.min(activeRound.holeScores.length - 1, i + 1))} />
        )
      }
    >
      {/* Hole pager */}
      <View style={styles.pager}>
        <Pressable disabled={index === 0} onPress={() => setIndex((i) => Math.max(0, i - 1))} style={styles.pagerBtn}>
          <Ionicons name="chevron-back" size={22} color={index === 0 ? palette.border : palette.text} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.holeNum, { color: palette.text }]}>Hole {hs.holeNumber}</Text>
          <Text style={[styles.holeMeta, { color: palette.muted }]}>
            Par {hs.par}
            {hole ? ` · ${hole.shape ?? ""}` : ""}
          </Text>
        </View>
        <Pressable
          disabled={isLast}
          onPress={() => setIndex((i) => Math.min(activeRound.holeScores.length - 1, i + 1))}
          style={styles.pagerBtn}
        >
          <Ionicons name="chevron-forward" size={22} color={isLast ? palette.border : palette.text} />
        </Pressable>
      </View>

      {/* Scoring mode toggle */}
      <View style={styles.scoreModeRow}>
        <View style={styles.scoreModeLabel}>
          <Text style={[styles.section, { color: palette.text }]}>Scoring</Text>
          <Badge label={advancedScoring ? "ADVANCED" : "BASIC"} tone={advancedScoring ? "success" : "default"} />
        </View>
        <View style={{ width: 200 }}>
          <Segmented
            value={advancedScoring ? "adv" : "basic"}
            onChange={(v) => setAdvancedScoring(v === "adv")}
            options={[
              { id: "basic", label: "Basic" },
              { id: "adv", label: "Advanced" },
            ]}
          />
        </View>
      </View>

      {/* Score entry (basic strokes; advanced adds putts/fairway/GIR/penalties/chips) */}
      <HoleScoreCard score={hs} advanced={advancedScoring} onChange={(patch) => updateHoleScore(hs.holeNumber, patch)} />

      {/* Live tracking + map + AI caddie — same page */}
      {course && hole ? (
        <LiveRangefinder key={hole.number} course={course} hole={hole} teeId={activeRound.teeId} />
      ) : (
        <Text style={{ color: palette.muted }}>
          Live yardages and the caddie map aren’t available for this course’s hole layout. You can still track your score above.
        </Text>
      )}

      <Pressable onPress={() => router.push("/putting")} style={styles.puttLink}>
        <Ionicons name="golf-outline" size={16} color={palette.primary} />
        <Text style={[styles.puttLinkText, { color: palette.primary }]}>Open putting assistant</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          discardRound();
          router.replace("/(tabs)");
        }}
        style={styles.discard}
      >
        <Text style={[styles.discardText, { color: palette.danger }]}>Discard round</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pagerBtn: { padding: spacing.sm },
  holeNum: { fontSize: fontSize.xl, fontWeight: "900" },
  holeMeta: { fontSize: fontSize.sm },
  scoreModeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scoreModeLabel: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  section: { fontSize: fontSize.md, fontWeight: "700" },
  puttLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  puttLinkText: { fontSize: fontSize.sm, fontWeight: "700" },
  discard: { alignItems: "center", paddingVertical: spacing.md },
  discardText: { fontSize: fontSize.sm, fontWeight: "700" },
});
