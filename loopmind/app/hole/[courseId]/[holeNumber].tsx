import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { HoleMap } from "@/components/HoleMap";
import { RecommendationCard } from "@/components/RecommendationCard";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { getCourseById } from "@/services/courses";
import { useProfileStore } from "@/store/useProfileStore";
import { recommendShot } from "@/caddie/engine";
import { withExplanation } from "@/caddie/explain";
import { getCurrentPosition } from "@/services/location";
import { getWeather } from "@/services/weather";
import { CaddieRecommendation, LieType, Point, RiskTolerance, Weather } from "@/types/models";

const LIES: { id: LieType; label: string }[] = [
  { id: "tee", label: "Tee" },
  { id: "fairway", label: "Fairway" },
  { id: "rough", label: "Rough" },
  { id: "bunker", label: "Bunker" },
  { id: "recovery", label: "Recovery" },
];

export default function HoleScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { courseId, holeNumber } = useLocalSearchParams<{ courseId: string; holeNumber: string }>();

  const course = getCourseById(courseId ?? "");
  const hole = course?.holes.find((h) => h.number === Number(holeNumber));

  const profile = useProfileStore((s) => s.profile);

  const [teeId, setTeeId] = useState(hole?.tees[2]?.id ?? hole?.tees[0]?.id ?? "white");
  const tee = hole?.tees.find((t) => t.id === teeId) ?? hole?.tees[0];
  const holeLength = tee?.yards ?? 400;

  const [yardsLeft, setYardsLeft] = useState(holeLength);
  const [lie, setLie] = useState<LieType>("tee");
  const [risk, setRisk] = useState<RiskTolerance>("balanced");
  const [pin, setPin] = useState<"front" | "middle" | "back">("middle");
  const [weather, setWeather] = useState<Weather | undefined>(undefined);

  const [rec, setRec] = useState<CaddieRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset yards-left when the tee changes (you're back on the tee).
  useEffect(() => {
    setYardsLeft(holeLength);
    setLie("tee");
    setRec(null);
  }, [holeLength]);

  // Load (mock) weather once.
  useEffect(() => {
    getCurrentPosition().then(({ coordinate }) => getWeather(coordinate).then(setWeather));
  }, []);

  // Player position on the canvas, interpolated tee -> green by progress.
  const playerPosition: Point = useMemo(() => {
    if (!hole || !tee) return { x: 0.5, y: 0.9 };
    const progress = Math.min(1, Math.max(0, 1 - yardsLeft / holeLength));
    return {
      x: tee.position.x + (hole.green.center.x - tee.position.x) * progress,
      y: tee.position.y + (hole.green.center.y - tee.position.y) * progress,
    };
  }, [hole, tee, yardsLeft, holeLength]);

  if (!course || !hole || !tee) {
    return (
      <Screen title="Hole not found">
        <Text style={{ color: palette.muted }}>We couldn’t load this hole.</Text>
      </Screen>
    );
  }

  const distanceTraveled = holeLength - yardsLeft;
  // Forced water carry still ahead of the player (yards needed to clear).
  const forcedCarryYards = hole.hazards
    .filter((h) => h.kind === "water")
    .map((h) => h.carryYards - distanceTraveled)
    .filter((d) => d > 30)
    .reduce((max, d) => Math.max(max, d), 0);

  const frontYards = Math.max(1, yardsLeft - 16);
  const backYards = yardsLeft + 15;

  const getAdvice = async () => {
    setLoading(true);
    const base = recommendShot({
      targetYards: yardsLeft,
      lie,
      skillLevel: profile.skillLevel,
      dominantHand: profile.dominantHand,
      shotShape: profile.shotShape,
      riskTolerance: risk,
      clubs: profile.clubs,
      weather,
      hazards: hole.hazards,
      forcedCarryYards: forcedCarryYards || undefined,
      pinNote: pin,
    });
    const withText = await withExplanation(
      {
        targetYards: yardsLeft,
        lie,
        skillLevel: profile.skillLevel,
        dominantHand: profile.dominantHand,
        shotShape: profile.shotShape,
        riskTolerance: risk,
        clubs: profile.clubs,
        weather,
        pinNote: pin,
      },
      base,
    );
    setRec(withText);
    setLoading(false);
  };

  const step = (delta: number) => {
    setYardsLeft((y) => Math.max(5, Math.min(holeLength + 40, y + delta)));
    setRec(null);
  };

  return (
    <Screen
      title={`Hole ${hole.number}`}
      subtitle={`${course.name} · Par ${hole.par} · ${hole.shape}`}
      footer={
        <Button label={loading ? "Reading the shot…" : "Get Caddie Advice"} onPress={getAdvice} loading={loading} />
      }
    >
      <Stack.Screen options={{ title: `Hole ${hole.number}` }} />

      {/* Rangefinder readout */}
      <Card>
        <View style={styles.rangeRow}>
          <RangeStat label="Front" value={frontYards} muted />
          <View style={styles.middle}>
            <Text style={[styles.middleValue, { color: palette.primary }]}>{yardsLeft}</Text>
            <Text style={[styles.middleLabel, { color: palette.muted }]}>YDS TO MIDDLE</Text>
          </View>
          <RangeStat label="Back" value={backYards} muted />
        </View>
        <View style={styles.stepRow}>
          <StepButton icon="remove" onPress={() => step(-5)} />
          <Text style={[styles.stepHint, { color: palette.muted }]}>Adjust your number</Text>
          <StepButton icon="add" onPress={() => step(5)} />
        </View>
      </Card>

      {/* Hole map */}
      <HoleMap hole={hole} selectedTeeId={teeId} playerPosition={playerPosition} width={width - spacing.xl * 2} />

      {/* Tee selector */}
      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.section, { color: palette.text }]}>Tee box · {tee.yards} yds total</Text>
        <Segmented
          value={teeId}
          onChange={setTeeId}
          options={hole.tees.map((t) => ({ id: t.id, label: t.name.split(" ")[0] }))}
        />
      </View>

      {/* Hazards */}
      {hole.hazards.length > 0 ? (
        <Card title="Hazards & carries">
          {hole.hazards.map((h) => {
            const carryFromHere = h.carryYards - distanceTraveled;
            return (
              <View key={h.id} style={styles.hazardRow}>
                <Ionicons
                  name={h.kind === "water" ? "water" : h.kind === "bunker" ? "thunderstorm" : "warning"}
                  size={16}
                  color={h.kind === "water" ? palette.hazard : palette.warning}
                />
                <Text style={[styles.hazardLabel, { color: palette.text }]}>{h.label}</Text>
                <Text style={[styles.hazardYds, { color: palette.muted }]}>
                  {carryFromHere > 0 ? `${Math.round(carryFromHere)} to carry` : "behind you"}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* Shot setup */}
      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.section, { color: palette.text }]}>Lie</Text>
        <Segmented value={lie} onChange={setLie} options={LIES} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.section, { color: palette.text }]}>Pin position</Text>
        <Segmented
          value={pin}
          onChange={setPin}
          options={[
            { id: "front", label: "Front" },
            { id: "middle", label: "Middle" },
            { id: "back", label: "Back" },
          ]}
        />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.section, { color: palette.text }]}>Risk tolerance</Text>
        <Segmented
          value={risk}
          onChange={setRisk}
          options={[
            { id: "safe", label: "Safe" },
            { id: "balanced", label: "Balanced" },
            { id: "aggressive", label: "Aggressive" },
          ]}
        />
      </View>

      {weather ? (
        <Text style={[styles.weather, { color: palette.muted }]}>
          <Ionicons name="partly-sunny" size={13} color={palette.muted} /> {weather.temperatureF}°F · wind{" "}
          {weather.windSpeedMph} mph {weather.isMock ? "(sample)" : ""}
        </Text>
      ) : null}

      {/* Recommendation output */}
      {rec ? <RecommendationCard rec={rec} /> : null}

      <Pressable onPress={() => router.push("/putting")} style={styles.puttLink}>
        <Ionicons name="golf-outline" size={16} color={palette.primary} />
        <Text style={[styles.puttLinkText, { color: palette.primary }]}>On the green? Open putting assistant</Text>
      </Pressable>
    </Screen>
  );

  function RangeStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
    return (
      <View style={styles.rangeStat}>
        <Text style={[styles.rangeValue, { color: muted ? palette.muted : palette.text }]}>{value}</Text>
        <Text style={[styles.rangeLabel, { color: palette.muted }]}>{label}</Text>
      </View>
    );
  }

  function StepButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
    return (
      <Pressable onPress={onPress} style={[styles.stepBtn, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        <Ionicons name={icon} size={22} color={palette.text} />
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  rangeRow: { flexDirection: "row", alignItems: "center" },
  rangeStat: { flex: 1, alignItems: "center" },
  rangeValue: { fontSize: fontSize.xl, fontWeight: "800" },
  rangeLabel: { fontSize: fontSize.xs, textTransform: "uppercase", letterSpacing: 0.5 },
  middle: { flex: 1.4, alignItems: "center" },
  middleValue: { fontSize: 64, fontWeight: "900", letterSpacing: -2, lineHeight: 68 },
  middleLabel: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1 },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  stepHint: { fontSize: fontSize.sm },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { fontSize: fontSize.md, fontWeight: "700" },
  hazardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 3 },
  hazardLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: "600" },
  hazardYds: { fontSize: fontSize.sm },
  weather: { fontSize: fontSize.sm, textAlign: "center" },
  puttLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  puttLinkText: { fontSize: fontSize.sm, fontWeight: "700" },
});
