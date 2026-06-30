import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Field } from "@/components/Field";
import { Badge } from "@/components/Badge";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { Course } from "@/types/models";
import { getNearbyCourses, searchCourses } from "@/services/courses";

export default function CoursesTab() {
  const { palette } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [usedMock, setUsedMock] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    getNearbyCourses().then(({ courses, usedMock }) => {
      setCourses(courses);
      setUsedMock(usedMock);
    });
  }, []);

  const visible = query.trim() ? searchCourses(query) : courses;

  return (
    <Screen title="Courses" subtitle="Detected near you — or search by name.">
      <Field
        placeholder="Search course, city, or state"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {usedMock ? (
        <View style={styles.noticeRow}>
          <Badge label="SAMPLE COURSES" tone="info" />
          <Text style={[styles.notice, { color: palette.muted }]}>
            Live GPS course data isn’t connected yet — showing built-in sample courses.
          </Text>
        </View>
      ) : null}

      <View style={{ gap: spacing.md }}>
        {visible.map((course) => (
          <Pressable
            key={course.id}
            onPress={() => router.push(`/course/${course.id}`)}
            style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}
          >
            <View style={styles.iconBox}>
              <Ionicons name="flag" size={22} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: palette.text }]}>{course.name}</Text>
              <Text style={[styles.meta, { color: palette.muted }]}>
                {course.city}, {course.state} · Par {course.par} · {course.holes.length} holes
              </Text>
            </View>
            {course.distanceMiles !== undefined ? (
              <Text style={[styles.distance, { color: palette.primary }]}>{course.distanceMiles} mi</Text>
            ) : null}
          </Pressable>
        ))}
        {visible.length === 0 ? (
          <Text style={[styles.notice, { color: palette.muted }]}>No courses match “{query}”.</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeRow: { gap: spacing.xs },
  notice: { fontSize: fontSize.xs, lineHeight: 17 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  iconBox: { width: 40, alignItems: "center" },
  name: { fontSize: fontSize.md, fontWeight: "800" },
  meta: { fontSize: fontSize.sm, marginTop: 2 },
  distance: { fontSize: fontSize.sm, fontWeight: "700" },
});
