import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/Screen";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { useAuthStore } from "@/store/useAuthStore";
import { isSupabaseConfigured } from "@/lib/env";

export default function SignIn() {
  const { palette } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.brand}>
          <Text style={[styles.logo, { color: palette.primary }]}>LoopMind</Text>
          <Text style={[styles.tag, { color: palette.muted }]}>Your AI caddie for every shot.</Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <Field
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
          <Button label="Log In" onPress={onSubmit} loading={loading} />
          <View style={styles.row}>
            <Text style={{ color: palette.muted }}>New here? </Text>
            <Link href="/(auth)/sign-up" style={{ color: palette.primary, fontWeight: "700" }}>
              Create an account
            </Link>
          </View>
        </View>

        {!isSupabaseConfigured ? (
          <View style={styles.note}>
            <Badge label="OFFLINE MODE" tone="info" />
            <Text style={[styles.noteText, { color: palette.muted }]}>
              No Supabase keys set — accounts are stored locally on this device so you can try the
              app immediately. Add Supabase keys in .env for real cloud auth.
            </Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "center", gap: spacing.xxl },
  brand: { alignItems: "center", gap: spacing.xs },
  logo: { fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  tag: { fontSize: fontSize.md },
  row: { flexDirection: "row", justifyContent: "center", marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, fontWeight: "600" },
  note: { gap: spacing.xs, alignItems: "center", paddingHorizontal: spacing.md },
  noteText: { fontSize: fontSize.xs, textAlign: "center", lineHeight: 17 },
});
