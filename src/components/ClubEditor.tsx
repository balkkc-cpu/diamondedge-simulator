import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, radius, spacing } from "@/theme/colors";
import { Club } from "@/types/models";
import { useProfileStore } from "@/store/useProfileStore";

/** Editable list of clubs: tune distances and toggle clubs in/out of the bag. */
export function ClubEditor() {
  const { palette } = useTheme();
  const clubs = useProfileStore((s) => s.profile.clubs);
  const setClubDistance = useProfileStore((s) => s.setClubDistance);
  const toggleClubInBag = useProfileStore((s) => s.toggleClubInBag);

  return (
    <View style={{ gap: spacing.sm }}>
      {clubs.map((club: Club) => (
        <View
          key={club.id}
          style={[styles.row, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          <Pressable
            onPress={() => toggleClubInBag(club.id)}
            style={[
              styles.dot,
              { borderColor: palette.primary, backgroundColor: club.inBag ? palette.primary : "transparent" },
            ]}
          />
          <Text style={[styles.name, { color: club.inBag ? palette.text : palette.muted }]}>{club.label}</Text>
          {club.id === "putter" ? (
            <Text style={[styles.putter, { color: palette.muted }]}>—</Text>
          ) : (
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                keyboardType="number-pad"
                value={club.distanceYards ? String(club.distanceYards) : ""}
                onChangeText={(t) => setClubDistance(club.id, Number(t.replace(/[^0-9]/g, "")) || 0)}
                editable={club.inBag}
                maxLength={3}
              />
              <Text style={[styles.unit, { color: palette.muted }]}>yds</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  name: { flex: 1, fontSize: fontSize.md, fontWeight: "600" },
  putter: { fontSize: fontSize.md, width: 70, textAlign: "right" },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  input: {
    width: 56,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  unit: { fontSize: fontSize.sm, width: 26 },
});
