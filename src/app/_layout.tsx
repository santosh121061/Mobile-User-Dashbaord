import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
    useFonts,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
} from "@expo-google-fonts/inter";
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
void SplashScreen.preventAutoHideAsync();
function Navigation() {
    const { colors, dark } = useTheme();
    return (
        <>
            <BrandDocument />
            <StatusBar style={dark ? "light" : "dark"} />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: colors.surface },
                    headerTintColor: colors.text.primary,
                    contentStyle: { backgroundColor: colors.canvas },
                }}
            >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
            </Stack>
        </>
    );
}
export default function Root() {
    const [fontsLoaded, fontError] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
    });
    useEffect(() => {
        if (fontsLoaded || fontError) void SplashScreen.hideAsync();
    }, [fontsLoaded, fontError]);
    useEffect(() => {
        if (Platform.OS === "android")
            void ScreenCapture.preventScreenCaptureAsync("private").catch(
                () => {},
            );
        if (Platform.OS === "ios")
            void ScreenCapture.enableAppSwitcherProtectionAsync().catch(
                () => {},
            );
        return () => {
            if (Platform.OS === "android")
                void ScreenCapture.allowScreenCaptureAsync("private").catch(
                    () => {},
                );
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
