import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { Badge } from "@/components/Badge";
import { ClubEditor } from "@/components/ClubEditor";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useRoundStore } from "@/store/useRoundStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { speak } from "@/services/speech";
import { SKILL_LEVELS } from "@/constants/skill";
import { DominantHand, ShotShape, SkillLevel } from "@/types/models";

export default function ProfileTab() {
  const { palette, preference, setPreference } = useTheme();
  const user = useAuthStore((s) => s.user);
  const offlineMode = useAuthStore((s) => s.offlineMode);
  const signOut = useAuthStore((s) => s.signOut);
  const profile = useProfileStore((s) => s.profile);
  const setSkill = useProfileStore((s) => s.setSkill);
  const setHand = useProfileStore((s) => s.setHand);
  const setShotShape = useProfileStore((s) => s.setShotShape);
  const roundsPlayed = useRoundStore((s) => s.rounds.length);
  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const autoAnnounce = useSettingsStore((s) => s.autoAnnounce);
  const announceLiveYardage = useSettingsStore((s) => s.announceLiveYardage);
  const setVoiceEnabled = useSettingsStore((s) => s.setVoiceEnabled);
  const setAutoAnnounce = useSettingsStore((s) => s.setAutoAnnounce);
  const setAnnounceLiveYardage = useSettingsStore((s) => s.setAnnounceLiveYardage);

  return (
    <Screen title="Profile" subtitle={user?.email}>
      <Card title="Account">
        <View style={styles.accountRow}>
          <Text style={[styles.email, { color: palette.text }]}>{user?.email}</Text>
          {offlineMode ? <Badge label="OFFLINE" tone="info" /> : <Badge label="CLOUD" tone="success" />}
        </View>
        <Text style={[styles.meta, { color: palette.muted }]}>{roundsPlayed} round{roundsPlayed === 1 ? "" : "s"} tracked</Text>
        <Button label="Sign Out" variant="secondary" onPress={signOut} style={{ marginTop: spacing.sm }} />
      </Card>

      <Card title="Appearance">
        <Segmented
          value={preference}
          onChange={setPreference}
          options={[
            { id: "system", label: "System" },
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
        />
      </Card>

      <Card title="Caddie voice">
        <ToggleRow
          label="Talking caddie"
          help="Speak recommendations and updates out loud."
          value={voiceEnabled}
          onChange={(v) => {
            setVoiceEnabled(v);
            if (v) speak("Voice on. I'm your caddie — let's play smart.");
          }}
        />
        <ToggleRow
          label="Auto-announce advice"
          help="Read each recommendation aloud automatically."
          value={autoAnnounce}
          onChange={setAutoAnnounce}
          disabled={!voiceEnabled}
        />
        <ToggleRow
          label="Live yardage callouts"
          help="Call out the number as you walk the hole."
          value={announceLiveYardage}
          onChange={setAnnounceLiveYardage}
          disabled={!voiceEnabled}
        />
        <Button
          label="Test the voice"
          variant="secondary"
          onPress={() => speak("You've got 152 to the middle. Smooth seven iron, aim at the center, and trust it.")}
          style={{ marginTop: spacing.xs }}
        />
      </Card>

      <Card title="Your game">
        <Text style={[styles.label, { color: palette.text }]}>Skill level</Text>
        <Segmented<SkillLevel>
          vertical
          value={profile.skillLevel}
          onChange={setSkill}
          options={SKILL_LEVELS.map((s) => ({ id: s.id, label: s.label }))}
        />
        <Text style={[styles.label, { color: palette.text, marginTop: spacing.md }]}>Dominant hand</Text>
        <Segmented<DominantHand>
          value={profile.dominantHand}
          onChange={setHand}
          options={[
            { id: "right", label: "Right" },
            { id: "left", label: "Left" },
          ]}
        />
        <Text style={[styles.label, { color: palette.text, marginTop: spacing.md }]}>Shot shape</Text>
        <Segmented<ShotShape>
          value={profile.shotShape}
          onChange={setShotShape}
          options={[
            { id: "draw", label: "Draw" },
            { id: "straight", label: "Straight" },
            { id: "fade", label: "Fade" },
          ]}
        />
      </Card>

      <Text style={[styles.section, { color: palette.text }]}>Club distances</Text>
      <ClubEditor />

      <Text style={[styles.disclaimer, { color: palette.muted }]}>
        LoopMind gives estimates to help you make confident decisions. GPS, course maps, elevation,
        and pin data may be approximate or unavailable — always use your own judgment on the course.
      </Text>
    </Screen>
  );

  function ToggleRow({
    label,
    help,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    help: string;
    value: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }) {
    return (
      <View style={[styles.toggleRow, { opacity: disabled ? 0.45 : 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
          <Text style={[styles.toggleHelp, { color: palette.muted }]}>{help}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: palette.primary, false: palette.border }}
          thumbColor="#ffffff"
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  email: { fontSize: fontSize.md, fontWeight: "700", flex: 1 },
  meta: { fontSize: fontSize.sm },
  label: { fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.xs },
  section: { fontSize: fontSize.lg, fontWeight: "800", marginTop: spacing.sm },
  disclaimer: { fontSize: fontSize.xs, lineHeight: 17, marginTop: spacing.md },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  toggleLabel: { fontSize: fontSize.md, fontWeight: "700" },
  toggleHelp: { fontSize: fontSize.xs, marginTop: 1, lineHeight: 16 },
});
