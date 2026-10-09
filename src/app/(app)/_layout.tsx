import { Redirect, Stack } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { Sidebar } from "@/components/sidebar";
import { useSession } from "@/auth/session";
import {
    AvailabilityState,
    Button,
    Card,
    Label,
    Loading,
    Screen,
} from "@/components/ui";
import { t } from "@/localization";
import { useTheme } from "@/theme";
import { configured } from "@/config/environment";
export default function AppLayout() {
    const { phase, bootstrap, refresh, logout, features, unavailableError } =
        useSession();
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    if (phase === "storageBlocked")
        return (
            <Screen>
                <Card>
                    <Label accessibilityRole="alert">
                        {t("storageCleanupFailed")}
                    </Label>
                    <Button label={t("retry")} onPress={() => void logout()} />
                </Card>
            </Screen>
        );
    if (phase === "signedOut" || phase === "locked")
        return <Redirect href="/(auth)/login" />;
    if ((phase === "checking" && !bootstrap) || phase === "loggingOut")
        return <Loading />;
    if (phase === "unavailable")
        return (
            <AvailabilityState
                error={unavailableError}
                configured={configured}
                apiDisabled={features["api.enabled"] === false}
                retry={() => void refresh()}
                logout={() => void logout()}
            />
        );
    return (
        <View style={{ flex: 1 }}>
            <View
                style={{
                    flex: 1,
                    flexDirection: "row",
                    opacity: phase === "checking" ? 0 : 1,
                }}
                pointerEvents={phase === "checking" ? "none" : "auto"}
                accessibilityElementsHidden={phase === "checking"}
                importantForAccessibility={
                    phase === "checking" ? "no-hide-descendants" : "auto"
                }
            >
                {width >= 600 && <Sidebar rail={width < 768} />}
                <View style={{ flex: 1 }}>
                    <Stack
                        screenOptions={{
                            headerStyle: { backgroundColor: colors.surface },
                            headerTintColor: colors.text.primary,
                            contentStyle: { backgroundColor: colors.canvas },
                        }}
                    >
                        <Stack.Screen
                            name="(tabs)"
                            options={{ headerShown: false }}
                        />
                    </Stack>
                </View>
            </View>
            {phase === "checking" && (
                <View
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: colors.canvas,
                    }}
                >
                    <Loading />
                </View>
            )}
        </View>
    );
}
