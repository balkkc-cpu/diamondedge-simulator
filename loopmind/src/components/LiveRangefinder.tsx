import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { Badge } from "@/components/Badge";
import { HoleMap } from "@/components/HoleMap";
import { RecommendationCard } from "@/components/RecommendationCard";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { useProfileStore } from "@/store/useProfileStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { recommendShot } from "@/caddie/engine";
import { withExplanation } from "@/caddie/explain";
import { getCurrentPosition } from "@/services/location";
import { getWeather } from "@/services/weather";
import { lerpGeo, projectToCanvas, yardsBetween } from "@/services/geo";
import { speak, stopSpeaking } from "@/services/speech";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { CaddieRecommendation, Course, GeoPoint, Hole, LieType, Point, RiskTolerance, Weather } from "@/types/models";

const LIES: { id: LieType; label: string }[] = [
  { id: "tee", label: "Tee" },
  { id: "fairway", label: "Fairway" },
  { id: "rough", label: "Rough" },
  { id: "bunker", label: "Bunker" },
  { id: "recovery", label: "Recovery" },
];

interface Props {
  course: Course;
  hole: Hole;
  /** Initial tee box (e.g. from the active round). */
  teeId?: string;
}

/**
 * The live rangefinder + AI caddie for a single hole: GPS tracking, satellite
 * map, front/middle/back yardages, shot setup and the recommendation. Used both
 * standalone (Quick Caddie) and embedded in the unified round page.
 *
 * Live position is computed from real GPS projected onto the hole's tee→green
 * axis, so the player marker and yardages reflect where you actually are.
 */
export function LiveRangefinder({ course, hole, teeId: initialTeeId }: Props) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();

  const profile = useProfileStore((s) => s.profile);
  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const autoAnnounce = useSettingsStore((s) => s.autoAnnounce);
  const announceLiveYardage = useSettingsStore((s) => s.announceLiveYardage);

  const bagCount = profile.clubs.filter((c) => c.inBag && c.id !== "putter" && c.distanceYards > 0).length;

  const [teeId, setTeeId] = useState(initialTeeId ?? hole.tees[2]?.id ?? hole.tees[0]?.id ?? "white");
  const tee = hole.tees.find((t) => t.id === teeId) ?? hole.tees[0];
  const holeLength = tee?.yards ?? 400;

  const [manualYards, setManualYards] = useState(holeLength);
  const [lie, setLie] = useState<LieType>("tee");
  const [risk, setRisk] = useState<RiskTolerance>("balanced");
  const [pin, setPin] = useState<"front" | "middle" | "back">("middle");
  const [weather, setWeather] = useState<Weather | undefined>(undefined);
  const [rec, setRec] = useState<CaddieRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  const [liveMode, setLiveMode] = useState(false);
  const live = useLiveLocation();
  const simTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAnnouncedRef = useRef<{ yards: number; at: number }>({ yards: 0, at: 0 });

  const teeGeo = tee?.geo;
  const greenGeo = hole.green.centerGeo;
  const hasGeo = Boolean(teeGeo && greenGeo);

  // Reset to the tee when the hole/tee changes.
  useEffect(() => {
    setManualYards(holeLength);
    setLie("tee");
    setRec(null);
  }, [holeLength, hole.number]);

  useEffect(() => {
    getCurrentPosition().then(({ coordinate }) => getWeather(coordinate).then(setWeather));
  }, []);

  useEffect(() => {
    return () => {
      if (simTimer.current) clearInterval(simTimer.current);
      stopSpeaking();
      live.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveCoord = live.coordinate;
  const yardsLeft = liveMode && liveCoord && greenGeo ? yardsBetween(liveCoord, greenGeo) : manualYards;

  // Live yardage callouts (throttled).
  useEffect(() => {
    if (!liveMode || !liveCoord || !greenGeo) return;
    if (!voiceEnabled || !announceLiveYardage) return;
    const now = Date.now();
    const last = lastAnnouncedRef.current;
    if (Math.abs(yardsLeft - last.yards) >= 6 && now - last.at > 3500) {
      lastAnnouncedRef.current = { yards: yardsLeft, at: now };
      speak(`${yardsLeft} to the middle`);
    }
  }, [yardsLeft, liveMode, liveCoord, greenGeo, voiceEnabled, announceLiveYardage]);

  // Accurate normalized player position (real GPS projected onto the hole axis).
  const playerPosition: Point = useMemo(() => {
    if (liveMode && liveCoord && teeGeo && greenGeo) {
      return projectToCanvas(teeGeo, greenGeo, liveCoord);
    }
    const progress = Math.min(1, Math.max(0, 1 - manualYards / holeLength));
    return {
      x: tee.position.x + (hole.green.center.x - tee.position.x) * progress,
      y: tee.position.y + (hole.green.center.y - tee.position.y) * progress,
    };
  }, [liveMode, liveCoord, teeGeo, greenGeo, manualYards, holeLength, tee, hole.green.center]);

  const playerGeo: GeoPoint | null = liveMode ? liveCoord : null;

  const distanceTraveled = holeLength - yardsLeft;
  const forcedCarryYards = hole.hazards
    .filter((h) => h.kind === "water")
    .map((h) => h.carryYards - distanceTraveled)
    .filter((d) => d > 30)
    .reduce((max, d) => Math.max(max, d), 0);

  // Accurate front/back from green geometry in live mode; otherwise offsets.
  const frontYards =
    liveMode && liveCoord && hole.green.frontGeo
      ? yardsBetween(liveCoord, hole.green.frontGeo)
      : Math.max(1, yardsLeft - 16);
  const backYards =
    liveMode && liveCoord && hole.green.backGeo
      ? yardsBetween(liveCoord, hole.green.backGeo)
      : yardsLeft + 15;

  const buildInput = () => ({
    targetYards: yardsLeft,
    lie,
    skillLevel: profile.skillLevel,
    dominantHand: profile.dominantHand,
    shotShape: profile.shotShape,
    riskTolerance: risk,
    clubs: profile.clubs, // engine only uses clubs flagged in the bag
    weather,
    hazards: hole.hazards,
    forcedCarryYards: forcedCarryYards || undefined,
    pinNote: pin,
  });

  const getAdvice = async () => {
    setLoading(true);
    const base = recommendShot(buildInput());
    const withText = await withExplanation(buildInput(), base);
    setRec(withText);
    setLoading(false);
    if (voiceEnabled && autoAnnounce) speak(withText.explanation);
  };

  const step = (delta: number) => {
    setManualYards((y) => Math.max(5, Math.min(holeLength + 40, y + delta)));
    setRec(null);
  };

  const startLiveGps = async () => {
    setLiveMode(true);
    await live.start();
    if (voiceEnabled) speak("Live tracking on. I'll keep you updated as you walk.");
  };

  const stopLive = () => {
    if (simTimer.current) {
      clearInterval(simTimer.current);
      simTimer.current = null;
    }
    live.stop();
    setLiveMode(false);
    stopSpeaking();
  };

  const simulateWalk = () => {
    if (!teeGeo || !greenGeo) return;
    if (simTimer.current) clearInterval(simTimer.current);
    setLiveMode(true);
    let t = 0;
    live.pushSimulated(lerpGeo(teeGeo, greenGeo, t));
    if (voiceEnabled) speak("Simulating your walk down the hole.");
    simTimer.current = setInterval(() => {
      t += 0.04;
      if (t >= 0.94) {
        t = 0.94;
        if (simTimer.current) clearInterval(simTimer.current);
        simTimer.current = null;
      }
      live.pushSimulated(lerpGeo(teeGeo, greenGeo, t));
    }, 900);
  };

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Live tracking control bar */}
      <Card>
        <View style={styles.liveRow}>
          <View style={styles.liveStatus}>
            <View style={[styles.dot, { backgroundColor: liveMode ? palette.success : palette.muted }]} />
            <Text style={[styles.liveText, { color: palette.text }]}>
              {liveMode ? "Live GPS tracking" : "Manual yardage"}
            </Text>
            {liveMode && live.accuracyM ? <Badge label={`±${Math.round(live.accuracyM)}m`} tone="info" /> : null}
          </View>
          {liveMode ? (
            <Pressable onPress={stopLive} hitSlop={8}>
              <Text style={[styles.liveAction, { color: palette.danger }]}>Stop</Text>
            </Pressable>
          ) : null}
        </View>
        {!liveMode ? (
          <View style={styles.liveButtons}>
            <Button label="Start live GPS" onPress={startLiveGps} style={{ flex: 1 }} />
            {hasGeo ? <Button label="Simulate walk" variant="secondary" onPress={simulateWalk} style={{ flex: 1 }} /> : null}
          </View>
        ) : null}
        {live.error ? <Text style={[styles.err, { color: palette.warning }]}>{live.error}</Text> : null}
      </Card>

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
        {!liveMode ? (
          <View style={styles.stepRow}>
            <StepButton icon="remove" onPress={() => step(-5)} />
            <Text style={[styles.stepHint, { color: palette.muted }]}>Adjust your number</Text>
            <StepButton icon="add" onPress={() => step(5)} />
          </View>
        ) : (
          <Text style={[styles.stepHint, { color: palette.muted, textAlign: "center", marginTop: spacing.sm }]}>
            Updating automatically from your position
          </Text>
        )}
      </Card>

      <HoleMap hole={hole} selectedTeeId={teeId} playerPosition={playerPosition} playerGeo={playerGeo} width={width - spacing.xl * 2} />

      {/* Tee selector */}
      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.section, { color: palette.text }]}>Tee box · {tee.yards} yds total</Text>
        <Segmented value={teeId} onChange={setTeeId} options={hole.tees.map((t) => ({ id: t.id, label: t.name.split(" ")[0] }))} />
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
          <Ionicons name="partly-sunny" size={13} color={palette.muted} /> {weather.temperatureF}°F · wind {weather.windSpeedMph} mph{" "}
          {weather.isMock ? "(sample)" : ""}
        </Text>
      ) : null}

      <Button label={loading ? "Reading the shot…" : "Get Caddie Advice"} onPress={getAdvice} loading={loading} />
      <Text style={[styles.bagNote, { color: palette.muted }]}>
        <Ionicons name="golf-outline" size={12} color={palette.muted} /> Recommending only from the {bagCount} club
        {bagCount === 1 ? "" : "s"} in your bag. Edit your bag in Profile.
      </Text>

      {rec ? (
        <>
          <RecommendationCard rec={rec} />
          <Button
            label={voiceEnabled ? "🔊 Hear advice again" : "Enable voice in Profile"}
            variant="secondary"
            onPress={() => voiceEnabled && speak(rec.explanation)}
          />
        </>
      ) : null}
    </View>
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
  liveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveStatus: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  liveText: { fontSize: fontSize.sm, fontWeight: "700" },
  liveAction: { fontSize: fontSize.sm, fontWeight: "700" },
  liveButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  err: { fontSize: fontSize.xs, marginTop: spacing.sm },
  rangeRow: { flexDirection: "row", alignItems: "center" },
  rangeStat: { flex: 1, alignItems: "center" },
  rangeValue: { fontSize: fontSize.xl, fontWeight: "800" },
  rangeLabel: { fontSize: fontSize.xs, textTransform: "uppercase", letterSpacing: 0.5 },
  middle: { flex: 1.4, alignItems: "center" },
  middleValue: { fontSize: 64, fontWeight: "900", letterSpacing: -2, lineHeight: 68 },
  middleLabel: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 1 },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  stepHint: { fontSize: fontSize.sm },
  stepBtn: { width: 48, height: 48, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  section: { fontSize: fontSize.md, fontWeight: "700" },
  hazardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 3 },
  hazardLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: "600" },
  hazardYds: { fontSize: fontSize.sm },
  weather: { fontSize: fontSize.sm, textAlign: "center" },
  bagNote: { fontSize: fontSize.xs, textAlign: "center", lineHeight: 16 },
});
