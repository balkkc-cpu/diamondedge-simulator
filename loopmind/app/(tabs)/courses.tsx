import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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
  const [loading, setLoading] = useState(true);
  const [real, setReal] = useState<Course[]>([]);
  const [samples, setSamples] = useState<Course[]>([]);
  const [usedMockLocation, setUsedMockLocation] = useState(false);
  const [osmError, setOsmError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getNearbyCourses().then((res) => {
      if (cancelled) return;
      setReal(res.real);
      setSamples(res.samples);
      setUsedMockLocation(res.usedMockLocation);
      setOsmError(res.osmError);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const searching = query.trim().length > 0;
  const searchResults = searching ? searchCourses(query) : [];

  const renderCourse = (course: Course) => (
    <Pressable
      key={course.id}
      onPress={() => router.push(`/course/${course.id}`)}
      style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}
    >
      <View style={styles.iconBox}>
        <Ionicons name={course.source === "osm" ? "flag" : "flag-outline"} size={22} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: palette.text }]}>{course.name}</Text>
        <Text style={[styles.meta, { color: palette.muted }]}>
          {[course.city, course.state].filter(Boolean).join(", ") || (course.source === "osm" ? "OpenStreetMap" : "Sample")}
          {course.holes.length ? ` · ${course.holes.length} holes` : ""}
        </Text>
      </View>
      {course.distanceMiles !== undefined ? (
        <Text style={[styles.distance, { color: palette.primary }]}>{course.distanceMiles} mi</Text>
      ) : null}
    </Pressable>
  );

  return (
    <Screen title="Courses" subtitle="Real courses detected near you by GPS.">
      <Field
        placeholder="Search course, city, or state"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {searching ? (
        <View style={{ gap: spacing.md }}>
          {searchResults.map(renderCourse)}
          {searchResults.length === 0 ? (
            <Text style={[styles.notice, { color: palette.muted }]}>No courses match “{query}”.</Text>
          ) : null}
        </View>
      ) : (
        <>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.primary} />
              <Text style={[styles.notice, { color: palette.muted }]}>Finding courses near you…</Text>
            </View>
          ) : null}

          {!loading && real.length > 0 ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Near you</Text>
                <Badge label="LIVE · OPENSTREETMAP" tone="success" />
              </View>
              <View style={{ gap: spacing.md }}>{real.map(renderCourse)}</View>
            </>
          ) : null}

          {!loading && real.length === 0 ? (
            <View style={styles.noticeRow}>
              <Badge label="NO LIVE COURSES" tone="warning" />
              <Text style={[styles.notice, { color: palette.muted }]}>
                {osmError
                  ? "Couldn't reach the live course database right now — showing sample courses below."
                  : usedMockLocation
                    ? "Location isn't available here, so we can't detect nearby courses. On your phone (with GPS allowed) real courses appear here. Sample courses below."
                    : "No mapped courses found nearby. Sample courses below."}
              </Text>
            </View>
          ) : null}

          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Sample courses</Text>
            <Badge label="DEMO" tone="info" />
          </View>
          <View style={{ gap: spacing.md }}>{samples.map(renderCourse)}</View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  noticeRow: { gap: spacing.xs },
  notice: { fontSize: fontSize.xs, lineHeight: 17 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800" },
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
