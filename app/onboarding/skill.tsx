import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { SKILL_LEVELS } from "@/constants/skill";
import { useProfileStore } from "@/store/useProfileStore";

export default function SkillStep() {
  const { palette } = useTheme();
  const router = useRouter();
  const skill = useProfileStore((s) => s.profile.skillLevel);
  const setSkill = useProfileStore((s) => s.setSkill);

  return (
    <Screen
      title="What's your level?"
      subtitle="This shapes every recommendation the caddie gives you."
      footer={<Button label="Continue" onPress={() => router.push("/onboarding/hand")} />}
    >
      <View style={{ gap: spacing.md }}>
        {SKILL_LEVELS.map((s) => {
          const active = s.id === skill;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSkill(s.id)}
              style={[
                styles.card,
                {
                  backgroundColor: active ? palette.primary : palette.card,
                  borderColor: active ? palette.primary : palette.border,
                },
              ]}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.label, { color: active ? palette.onPrimary : palette.text }]}>{s.label}</Text>
                <Text style={[styles.hcp, { color: active ? palette.onPrimary : palette.muted }]}>{s.handicap}</Text>
              </View>
              <Text style={[styles.blurb, { color: active ? palette.onPrimary : palette.muted }]}>{s.blurb}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: fontSize.lg, fontWeight: "800" },
  hcp: { fontSize: fontSize.sm, fontWeight: "700" },
  blurb: { fontSize: fontSize.sm, lineHeight: 19 },
});
