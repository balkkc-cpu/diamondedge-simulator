import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { useProfileStore } from "@/store/useProfileStore";
import { DominantHand, ShotShape } from "@/types/models";

export default function HandStep() {
  const { palette } = useTheme();
  const router = useRouter();
  const hand = useProfileStore((s) => s.profile.dominantHand);
  const shape = useProfileStore((s) => s.profile.shotShape);
  const setHand = useProfileStore((s) => s.setHand);
  const setShotShape = useProfileStore((s) => s.setShotShape);

  return (
    <Screen
      title="How you swing"
      subtitle="Helps the caddie pick aim points and shot shapes."
      footer={<Button label="Continue" onPress={() => router.push("/onboarding/clubs")} />}
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.q, { color: palette.text }]}>Dominant hand</Text>
        <Segmented<DominantHand>
          value={hand}
          onChange={setHand}
          options={[
            { id: "right", label: "Right-handed" },
            { id: "left", label: "Left-handed" },
          ]}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.q, { color: palette.text }]}>Typical shot shape</Text>
        <Segmented<ShotShape>
          value={shape}
          onChange={setShotShape}
          options={[
            { id: "draw", label: "Draw" },
            { id: "straight", label: "Straight" },
            { id: "fade", label: "Fade" },
          ]}
        />
        <Text style={[styles.help, { color: palette.muted }]}>
          Not sure? Leave it on Straight — you can change this anytime in your profile.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  q: { fontSize: fontSize.md, fontWeight: "700" },
  help: { fontSize: fontSize.xs, lineHeight: 17 },
});
