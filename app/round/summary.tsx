import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Stat } from "@/components/Stat";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { useRoundStore, summarizeRound } from "@/store/useRoundStore";
import { analyzeRounds } from "@/caddie/practice";

export default function RoundSummary() {
  const { palette } = useTheme();
  const router = useRouter();
  const rounds = useRoundStore((s) => s.rounds);
  const last = rounds[0];

  if (!last) {
    return (
      <Screen title="No rounds yet">
        <Button label="Back to Play" onPress={() => router.replace("/(tabs)")} />
      </Screen>
    );
  }

  const s = summarizeRound(last);
  const focus = analyzeRounds([last]).topWeakness;

  return (
    <Screen
      title="Nice round"
      subtitle={last.courseName}
      footer={<Button label="Back to Play" onPress={() => router.replace("/(tabs)")} />}
    >
      <Card accent>
        <Text style={styles.bigScore}>{s.totalStrokes}</Text>
        <Text style={styles.bigSub}>
          {s.toPar === 0 ? "Even par" : s.toPar > 0 ? `${s.toPar} over par` : `${Math.abs(s.toPar)} under par`}
        </Text>
      </Card>

      <Card title="The numbers">
        <View style={styles.row}>
          <Stat label="Putts" value={s.putts} accent />
          <Stat label="Fairways" value={`${s.fairwaysHit}/${s.fairwayChances}`} />
          <Stat label="GIR" value={`${s.gir}/${s.holes}`} />
          <Stat label="Penalties" value={s.penalties} />
        </View>
      </Card>

      <Card title="Caddie's takeaway">
        <Text style={[styles.takeaway, { color: palette.text }]}>{focus.message}</Text>
        <Button
          label="See practice plan"
          variant="secondary"
          onPress={() => router.replace("/(tabs)/practice")}
          style={{ marginTop: spacing.sm }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigScore: { color: "#FFFFFF", fontSize: 64, fontWeight: "900", textAlign: "center" },
  bigSub: { color: "#CFE9DC", fontSize: fontSize.md, fontWeight: "600", textAlign: "center" },
  row: { flexDirection: "row" },
  takeaway: { fontSize: fontSize.md, lineHeight: 22 },
});
