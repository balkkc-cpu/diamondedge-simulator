import React from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ClubEditor } from "@/components/ClubEditor";
import { fontSize, spacing } from "@/theme/colors";
import { useProfileStore } from "@/store/useProfileStore";

export default function ClubsStep() {
  const router = useRouter();
  const skill = useProfileStore((s) => s.profile.skillLevel);
  const usesDefaults = useProfileStore((s) => s.profile.usesDefaultDistances);
  const applyDefaults = useProfileStore((s) => s.applyDefaultDistances);
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);

  const finish = () => {
    completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <Screen
      title="Your club distances"
      subtitle="Tap a club to add/remove it. Tune the yardages so the caddie nails the number."
      footer={<Button label="Finish Setup" onPress={finish} />}
    >
      <Card accent>
        <Text style={styles.dunnoTitle}>Don’t know your distances?</Text>
        <Text style={styles.dunnoText}>
          No problem. We’ll load sensible averages for your level and you can fine-tune them as you
          learn your game.
        </Text>
        <Button
          label={usesDefaults ? "Defaults loaded ✓" : "Use beginner-friendly defaults"}
          variant="secondary"
          onPress={() => applyDefaults(skill)}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <ClubEditor />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dunnoTitle: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "800" },
  dunnoText: { color: "#E7F2EC", fontSize: fontSize.sm, lineHeight: 19 },
});
