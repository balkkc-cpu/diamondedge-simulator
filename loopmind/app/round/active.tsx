import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Stepper } from "@/components/Stepper";
import { Segmented } from "@/components/Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { useRoundStore, summarizeRound } from "@/store/useRoundStore";
import { getCourseById } from "@/services/courses";

export default function ActiveRound() {
  const { palette } = useTheme();
  const router = useRouter();
  const activeRound = useRoundStore((s) => s.activeRound);
  const updateHoleScore = useRoundStore((s) => s.updateHoleScore);
  const finishRound = useRoundStore((s) => s.finishRound);
  const discardRound = useRoundStore((s) => s.discardRound);
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
  const isPar3 = hs.par === 3;

  const finish = () => {
    finishRound();
    router.replace("/round/summary");
  };

  return (
    <Screen
      title={activeRound.courseName}
      subtitle={`Through ${index} · ${summary.toPar >= 0 ? "+" : ""}${summary.toPar} to par`}
      footer={
        index === activeRound.holeScores.length - 1 ? (
          <Button label="Finish & Save Round" onPress={finish} />
        ) : (
          <Button label="Next Hole →" onPress={() => setIndex((i) => Math.min(activeRound.holeScores.length - 1, i + 1))} />
        )
      }
    >
      {/* Hole pager header */}
      <View style={styles.pager}>
        <Pressable disabled={index === 0} onPress={() => setIndex((i) => Math.max(0, i - 1))} style={styles.pagerBtn}>
          <Ionicons name="chevron-back" size={22} color={index === 0 ? palette.border : palette.text} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.holeNum, { color: palette.text }]}>Hole {hs.holeNumber}</Text>
          <Text style={[styles.holeMeta, { color: palette.muted }]}>Par {hs.par}{hole ? ` · ${hole.shape}` : ""}</Text>
        </View>
        <Pressable
          disabled={index === activeRound.holeScores.length - 1}
          onPress={() => setIndex((i) => Math.min(activeRound.holeScores.length - 1, i + 1))}
          style={styles.pagerBtn}
        >
          <Ionicons name="chevron-forward" size={22} color={index === activeRound.holeScores.length - 1 ? palette.border : palette.text} />
        </Pressable>
      </View>

      {hole ? (
        <Button
          label="Open rangefinder for this hole"
          variant="secondary"
          onPress={() => router.push(`/hole/${activeRound.courseId}/${hs.holeNumber}`)}
        />
      ) : null}

      <Card title="Score">
        <Stepper label="Strokes" value={hs.strokes} onChange={(v) => updateHoleScore(hs.holeNumber, { strokes: v })} min={1} />
        <Divider />
        <Stepper label="Putts" value={hs.putts} onChange={(v) => updateHoleScore(hs.holeNumber, { putts: v })} />
        <Divider />
        <Stepper label="Chips" value={hs.chips} onChange={(v) => updateHoleScore(hs.holeNumber, { chips: v })} />
        <Divider />
        <Stepper label="Penalties" value={hs.penalties} onChange={(v) => updateHoleScore(hs.holeNumber, { penalties: v })} />
      </Card>

      <Card title="Tee shot & green">
        {!isPar3 ? (
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text style={[styles.label, { color: palette.text }]}>Fairway</Text>
            <Segmented
              value={hs.fairwayHit ? "hit" : "miss"}
              onChange={(v) => updateHoleScore(hs.holeNumber, { fairwayHit: v === "hit" })}
              options={[
                { id: "hit", label: "Hit" },
                { id: "miss", label: "Missed" },
              ]}
            />
          </View>
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.label, { color: palette.text }]}>Green in regulation</Text>
          <Segmented
            value={hs.greenInRegulation ? "yes" : "no"}
            onChange={(v) => updateHoleScore(hs.holeNumber, { greenInRegulation: v === "yes" })}
            options={[
              { id: "yes", label: "GIR" },
              { id: "no", label: "Missed" },
            ]}
          />
        </View>
      </Card>

      <Pressable onPress={() => { discardRound(); router.replace("/(tabs)"); }} style={styles.discard}>
        <Text style={[styles.discardText, { color: palette.danger }]}>Discard round</Text>
      </Pressable>
    </Screen>
  );

  function Divider() {
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: spacing.sm }} />;
  }
}

const styles = StyleSheet.create({
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pagerBtn: { padding: spacing.sm },
  holeNum: { fontSize: fontSize.xl, fontWeight: "900" },
  holeMeta: { fontSize: fontSize.sm },
  label: { fontSize: fontSize.md, fontWeight: "700" },
  discard: { alignItems: "center", paddingVertical: spacing.md },
  discardText: { fontSize: fontSize.sm, fontWeight: "700" },
});
