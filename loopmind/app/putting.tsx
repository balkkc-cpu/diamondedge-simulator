import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Segmented } from "@/components/Segmented";
import { Stepper } from "@/components/Stepper";
import { Badge } from "@/components/Badge";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";

type Slope = "uphill" | "flat" | "downhill";
type Break = "left" | "straight" | "right";
type BreakAmount = "subtle" | "moderate" | "severe";

interface PuttPlan {
  speed: string;
  speedTag: "Lag putt" | "Firm" | "Die it in";
  startLine: string;
  note: string;
}

/**
 * Manual putting assistant. When real green-contour data is available, replace
 * `buildPuttPlan` with a read derived from the contour map + pin/ball lat/lng.
 */
function buildPuttPlan(feet: number, slope: Slope, brk: Break, amount: BreakAmount): PuttPlan {
  let speedTag: PuttPlan["speedTag"];
  let speed: string;
  if (feet > 35) {
    speedTag = "Lag putt";
    speed = "Speed first. Roll it into a 3-foot circle around the hole — never leave it short of the fringe of that circle.";
  } else if (slope === "downhill") {
    speedTag = "Die it in";
    speed = "Let gravity do the work. Aim to have it topple in the front edge — too much pace triples the break.";
  } else if (slope === "uphill") {
    speedTag = "Firm";
    speed = "Be firm and take some break out of it. A foot or two past is fine on this uphill putt.";
  } else {
    speedTag = "Firm";
    speed = "Smooth, rhythmic stroke to lag it just past the cup so it holds its line.";
  }

  const cupsByDistance = Math.min(4, Math.max(0.5, feet / 12));
  const amountMult = amount === "subtle" ? 0.5 : amount === "moderate" ? 1 : 1.6;
  const cups = Math.round(cupsByDistance * amountMult * 2) / 2;

  let startLine: string;
  if (brk === "straight") {
    startLine = "Dead straight — pick a spot an inch in front of the ball and roll it over that spot.";
  } else {
    const high = brk === "left" ? "right" : "left";
    void high;
    startLine = `Plays ${brk} to ${brk === "left" ? "right" : "left"}. Aim about ${cups} cup${cups === 1 ? "" : "s"} out on the ${brk === "left" ? "right" : "left"} (high) side and trust the speed.`;
  }

  const note =
    slope === "downhill" && brk !== "straight"
      ? "Downhill + break is the danger combo — favor the high side and the slowest speed that reaches the hole."
      : "Read it from behind the ball and from the low side, then commit to your line.";

  return { speed, speedTag, startLine, note };
}

export default function Putting() {
  const { palette } = useTheme();
  const [feet, setFeet] = useState(18);
  const [slope, setSlope] = useState<Slope>("flat");
  const [brk, setBrk] = useState<Break>("straight");
  const [amount, setAmount] = useState<BreakAmount>("moderate");

  const plan = buildPuttPlan(feet, slope, brk, amount);

  return (
    <Screen title="Putting assistant" subtitle="Tell me the read and I'll give you a start line and speed.">
      <Card>
        <Stepper label="Distance to hole (feet)" value={feet} onChange={setFeet} min={1} max={90} />
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.q, { color: palette.text }]}>Slope</Text>
        <Segmented<Slope>
          value={slope}
          onChange={setSlope}
          options={[
            { id: "uphill", label: "Uphill" },
            { id: "flat", label: "Flat" },
            { id: "downhill", label: "Downhill" },
          ]}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.q, { color: palette.text }]}>Break direction</Text>
        <Segmented<Break>
          value={brk}
          onChange={setBrk}
          options={[
            { id: "left", label: "L → R" },
            { id: "straight", label: "Straight" },
            { id: "right", label: "R → L" },
          ]}
        />
      </View>

      {brk !== "straight" ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.q, { color: palette.text }]}>How much break?</Text>
          <Segmented<BreakAmount>
            value={amount}
            onChange={setAmount}
            options={[
              { id: "subtle", label: "Subtle" },
              { id: "moderate", label: "Moderate" },
              { id: "severe", label: "Severe" },
            ]}
          />
        </View>
      ) : null}

      <Card accent>
        <Badge label={plan.speedTag.toUpperCase()} tone="success" />
        <Text style={styles.startLine}>{plan.startLine}</Text>
        <View style={styles.divider} />
        <Text style={styles.speed}>{plan.speed}</Text>
        <Text style={styles.note}>{plan.note}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  q: { fontSize: fontSize.md, fontWeight: "700" },
  startLine: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "800", lineHeight: 26, marginTop: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: spacing.sm },
  speed: { color: "#F1FAF4", fontSize: fontSize.md, lineHeight: 22 },
  note: { color: "#CFE9DC", fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.sm },
});
