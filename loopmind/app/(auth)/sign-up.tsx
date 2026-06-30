import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/Screen";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/colors";
import { useAuthStore } from "@/store/useAuthStore";

export default function SignUp() {
  const { palette } = useTheme();
  const signUp = useAuthStore((s) => s.signUp);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    const { error } = await signUp(email, password);
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.brand}>
          <Text style={[styles.logo, { color: palette.primary }]}>Create account</Text>
          <Text style={[styles.tag, { color: palette.muted }]}>
            Set up your bag once — smarter shots every round.
          </Text>
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
            placeholder="At least 6 characters"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
          <Button label="Get Started" onPress={onSubmit} loading={loading} />
          <View style={styles.row}>
            <Text style={{ color: palette.muted }}>Already have an account? </Text>
            <Link href="/(auth)/sign-in" style={{ color: palette.primary, fontWeight: "700" }}>
              Log in
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "center", gap: spacing.xxl },
  brand: { alignItems: "center", gap: spacing.xs },
  logo: { fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  tag: { fontSize: fontSize.md, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "center", marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, fontWeight: "600" },
});
