import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { Stepper } from "@/components/Stepper";
import { Segmented } from "@/components/Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { HoleScore } from "@/types/models";

interface Props {
  score: HoleScore;
  advanced: boolean;
  onChange: (patch: Partial<HoleScore>) => void;
}

function scoreLabel(strokes: number, par: number): string {
  const diff = strokes - par;
  if (strokes === 1) return "Ace!";
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double bogey";
  return `+${diff}`;
}

/** Per-hole score entry. Basic = strokes only; advanced adds the detail stats. */
export function HoleScoreCard({ score, advanced, onChange }: Props) {
  const { palette } = useTheme();
  const isPar3 = score.par === 3;

  return (
    <Card title="Score">
      <View style={styles.scoreHead}>
        <Text style={[styles.scoreLabel, { color: palette.muted }]}>{scoreLabel(score.strokes, score.par)}</Text>
      </View>
      <Stepper label="Strokes" value={score.strokes} onChange={(v) => onChange({ strokes: v })} min={1} max={15} />

      {advanced ? (
        <>
          <Divider palette={palette} />
          <Stepper label="Putts" value={score.putts} onChange={(v) => onChange({ putts: v })} max={10} />
          <Divider palette={palette} />
          <Stepper label="Chips / pitches" value={score.chips} onChange={(v) => onChange({ chips: v })} max={10} />
          <Divider palette={palette} />
          <Stepper label="Penalties" value={score.penalties} onChange={(v) => onChange({ penalties: v })} max={10} />
          <Divider palette={palette} />
          {!isPar3 ? (
            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <Text style={[styles.label, { color: palette.text }]}>Fairway</Text>
              <Segmented
                value={score.fairwayHit ? "hit" : "miss"}
                onChange={(v) => onChange({ fairwayHit: v === "hit" })}
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
              value={score.greenInRegulation ? "yes" : "no"}
              onChange={(v) => onChange({ greenInRegulation: v === "yes" })}
              options={[
                { id: "yes", label: "GIR" },
                { id: "no", label: "Missed" },
              ]}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}

function Divider({ palette }: { palette: { border: string } }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: spacing.sm }} />;
}

const styles = StyleSheet.create({
  scoreHead: { alignItems: "flex-end" },
  scoreLabel: { fontSize: fontSize.sm, fontWeight: "700" },
  label: { fontSize: fontSize.md, fontWeight: "700" },
});
