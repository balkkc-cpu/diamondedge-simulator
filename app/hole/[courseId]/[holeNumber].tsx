import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { LiveRangefinder } from "@/components/LiveRangefinder";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { getCourseById } from "@/services/courses";

export default function HoleScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { courseId, holeNumber } = useLocalSearchParams<{ courseId: string; holeNumber: string }>();

  const course = getCourseById(courseId ?? "");
  const hole = course?.holes.find((h) => h.number === Number(holeNumber));

  if (!course || !hole) {
    return (
      <Screen title="Hole not found">
        <Text style={{ color: palette.muted }}>We couldn’t load this hole.</Text>
      </Screen>
    );
  }

  return (
    <Screen title={`Hole ${hole.number}`} subtitle={`${course.name} · Par ${hole.par}${hole.shape ? ` · ${hole.shape}` : ""}`}>
      <Stack.Screen options={{ title: `Hole ${hole.number}` }} />
      <LiveRangefinder course={course} hole={hole} />
      <Pressable onPress={() => router.push("/putting")} style={styles.puttLink}>
        <Ionicons name="golf-outline" size={16} color={palette.primary} />
        <Text style={[styles.puttLinkText, { color: palette.primary }]}>On the green? Open putting assistant</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  puttLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  puttLinkText: { fontSize: fontSize.sm, fontWeight: "700" },
});
