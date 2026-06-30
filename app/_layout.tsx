import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfileStore } from "@/store/useProfileStore";

function useAuthRouting() {
  const segments = useSegments();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authHydrated = useAuthStore((s) => s.hasHydrated);
  const onboardingComplete = useProfileStore((s) => s.profile.onboardingComplete);
  const profileHydrated = useProfileStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!authHydrated || !profileHydrated) return;
    const root = segments[0];
    const inAuth = root === "(auth)";
    const inOnboarding = root === "onboarding";
    const atIndex = root === undefined; // the "/" entry route

    if (!user && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (user && !onboardingComplete && !inOnboarding) {
      router.replace("/onboarding/skill");
    } else if (user && onboardingComplete && (inAuth || inOnboarding || atIndex)) {
      router.replace("/(tabs)");
    }
  }, [user, onboardingComplete, segments, authHydrated, profileHydrated, router]);

  return authHydrated && profileHydrated;
}

function RootNavigator() {
  const { palette, mode } = useTheme();
  const ready = useAuthRouting();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.background }}>
        <ActivityIndicator color={palette.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: "Course" }} />
        <Stack.Screen name="hole/[courseId]/[holeNumber]" options={{ title: "Hole" }} />
        <Stack.Screen name="putting" options={{ title: "Putting Assistant", presentation: "modal" }} />
        <Stack.Screen name="round/active" options={{ title: "Round", headerBackVisible: false }} />
        <Stack.Screen name="round/summary" options={{ title: "Round Summary", headerBackVisible: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
