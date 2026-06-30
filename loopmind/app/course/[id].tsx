import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { ensureCourseLayout, getCourseById } from "@/services/courses";
import { useRoundStore } from "@/store/useRoundStore";
import { Course } from "@/types/models";

export default function CourseDetail() {
  const { palette } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const startRound = useRoundStore((s) => s.startRound);

  const initial = getCourseById(id ?? "");
  const [course, setCourse] = useState<Course | undefined>(initial);
  const [loadingLayout, setLoadingLayout] = useState(
    () => !!initial && initial.holes.length === 0 && initial.source === "osm",
  );
  const [layoutError, setLayoutError] = useState<string | null>(null);

  // OSM courses arrive without holes — fetch the layout on demand. All state
  // updates happen inside async callbacks (never synchronously in the effect).
  useEffect(() => {
    if (!id) return;
    const current = getCourseById(id);
    if (current && current.holes.length === 0 && current.source === "osm") {
      ensureCourseLayout(id)
        .then((updated) => {
          setCourse(updated);
          if (updated && updated.holes.length === 0) {
            setLayoutError("This course doesn't have a mapped hole layout in OpenStreetMap yet.");
          }
        })
        .catch(() => setLayoutError("Couldn't load this course's layout."))
        .finally(() => setLoadingLayout(false));
    }
  }, [id]);

  const teeOptions = (course?.holes[0]?.tees ?? []).map((t) => ({ id: t.id, label: t.name.split(" ")[0] }));
  const [teeId, setTeeId] = useState("");
  const selectedTeeId = teeId || teeOptions[Math.min(2, teeOptions.length - 1)]?.id || "";

  if (!course) {
    return (
      <Screen title="Course not found">
        <Text style={{ color: palette.muted }}>This course is no longer available.</Text>
      </Screen>
    );
  }

  if (loadingLayout) {
    return (
      <Screen title={course.name} subtitle="Loading hole layout from OpenStreetMap…">
        <Stack.Screen options={{ title: course.name }} />
        <View style={{ alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.md }}>
          <ActivityIndicator color={palette.primary} size="large" />
          <Text style={{ color: palette.muted }}>Fetching real greens, tees and hazards…</Text>
        </View>
      </Screen>
    );
  }

  if (course.holes.length === 0) {
    return (
      <Screen title={course.name} subtitle={[course.city, course.state].filter(Boolean).join(", ")}>
        <Stack.Screen options={{ title: course.name }} />
        <Text style={{ color: palette.muted, lineHeight: 20 }}>
          {layoutError ?? "No hole layout is available for this course yet."} You can still use the
          rangefinder manually from any sample course.
        </Text>
        <Button label="Back to courses" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const begin = () => {
    startRound(course, selectedTeeId);
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
        <Segmented value={selectedTeeId} onChange={setTeeId} options={teeOptions} />
      </View>

      <View style={{ gap: spacing.sm }}>
        {course.holes.map((hole) => {
          const tee = hole.tees.find((t) => t.id === selectedTeeId) ?? hole.tees[0];
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
