import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import {
  Stack,
  ThemeProvider as NavigationThemeProvider,
  DefaultTheme,
  DarkTheme,
} from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenCapture from "expo-screen-capture";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/auth/session";
import { ConfirmationProvider } from "@/auth/confirmation";
import { ThemeProvider, useTheme } from "@/theme";
import { queryClient } from "@/api/query";
import { Loading } from "@/components/ui";
import { ModuleRegistryProvider } from "@/modules/registry";
import { PushProvider } from "@/push/provider";
import { BrandDocument } from "@/components/brand-document";
import { CanvasTint } from "@/components/gradient";
void SplashScreen.preventAutoHideAsync();
function Navigation() {
  const { colors, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: "transparent",
      card: colors.surface,
      text: colors.text.primary,
      primary: colors.brand.primary,
      border: colors.border,
    },
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <CanvasTint />
      <BrandDocument />
      <StatusBar style={dark ? "light" : "dark"} />
      <NavigationThemeProvider value={navigationTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text.primary,
            contentStyle: { backgroundColor: "transparent" },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="unavailable" options={{ headerShown: false }} />
        </Stack>
      </NavigationThemeProvider>
    </View>
  );
}
export default function Root() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require("../../assets/fonts/Inter-Regular.ttf"),
    Inter_500Medium: require("../../assets/fonts/Inter-Medium.ttf"),
    Inter_600SemiBold: require("../../assets/fonts/Inter-SemiBold.ttf"),
    Inter_700Bold: require("../../assets/fonts/Inter-Bold.ttf"),
    Inter_400Regular15: require("../../assets/fonts/Inter-Regular-Optical15.ttf"),
    Inter_600SemiBold15: require("../../assets/fonts/Inter-SemiBold-Optical15.ttf"),
    Inter_600SemiBold18: require("../../assets/fonts/Inter-SemiBold-Optical18.ttf"),
    Inter_600SemiBold22: require("../../assets/fonts/Inter-SemiBold-Optical22.ttf"),
    Inter_700Bold22: require("../../assets/fonts/Inter-Bold-Optical22.ttf"),
    Inter_700Bold26: require("../../assets/fonts/Inter-Bold-Optical26.ttf"),
    Inter_700Bold30: require("../../assets/fonts/Inter-Bold-Optical30.ttf"),
  });
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  useEffect(() => {
    if (Platform.OS === "android")
      void ScreenCapture.preventScreenCaptureAsync("private").catch(() => {});
    if (Platform.OS === "ios")
      void ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    return () => {
      if (Platform.OS === "android")
        void ScreenCapture.allowScreenCaptureAsync("private").catch(() => {});
    };
  }, []);
  if (!fontsLoaded && !fontError) return <Loading />;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider>
            <ConfirmationProvider>
              <ModuleRegistryProvider>
                <PushProvider>
                  <Navigation />
                </PushProvider>
              </ModuleRegistryProvider>
            </ConfirmationProvider>
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
