import { Stack } from "expo-router";
import { useTheme } from "@/theme/ThemeProvider";

export default function OnboardingLayout() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.text,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="skill" options={{ title: "Your Game", headerBackVisible: false }} />
      <Stack.Screen name="hand" options={{ title: "How You Swing" }} />
      <Stack.Screen name="clubs" options={{ title: "Your Distances" }} />
    </Stack>
  );
}
