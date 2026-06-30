import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { getCourseById } from "@/services/courses";
import { useRoundStore } from "@/store/useRoundStore";

export default function CourseDetail() {
  const { palette } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = getCourseById(id ?? "");
  const startRound = useRoundStore((s) => s.startRound);

  const teeOptions = (course?.holes[0]?.tees ?? []).map((t) => ({ id: t.id, label: t.name.split(" ")[0] }));
  const [teeId, setTeeId] = useState(teeOptions[2]?.id ?? teeOptions[0]?.id ?? "white");

  if (!course) {
    return (
      <Screen title="Course not found">
        <Text style={{ color: palette.muted }}>This course is no longer available.</Text>
      </Screen>
    );
  }

  const begin = () => {
    startRound(course, teeId);
    router.push("/round/active");
  };

  return (
    <Screen
      title={course.name}
      subtitle={`${course.city}, ${course.state} · Par ${course.par}`}
      footer={<Button label="Start Round From Here" onPress={begin} />}
    >
      <Stack.Screen options={{ title: course.name }} />

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.label, { color: palette.text }]}>Tee box</Text>
        <Segmented value={teeId} onChange={setTeeId} options={teeOptions} />
      </View>

      <View style={{ gap: spacing.sm }}>
        {course.holes.map((hole) => {
          const tee = hole.tees.find((t) => t.id === teeId) ?? hole.tees[0];
          return (
            <Pressable
              key={hole.number}
              onPress={() => router.push(`/hole/${course.id}/${hole.number}`)}
              style={[styles.row, { backgroundColor: palette.card, borderColor: palette.border }]}
            >
              <View style={[styles.numBox, { backgroundColor: palette.surface }]}>
                <Text style={[styles.num, { color: palette.primary }]}>{hole.number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.holeTitle, { color: palette.text }]}>
                  Par {hole.par} · {tee.yards} yds
                </Text>
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {hole.shape} · Hcp {hole.handicapIndex}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={palette.muted} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.md, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  numBox: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  num: { fontSize: fontSize.md, fontWeight: "800" },
  holeTitle: { fontSize: fontSize.md, fontWeight: "700" },
  meta: { fontSize: fontSize.xs, marginTop: 2 },
});
