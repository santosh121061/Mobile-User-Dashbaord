import { BackHeader } from "@/components/chrome";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, Stack, usePathname } from "expo-router";
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
import { CanvasTint } from "@/components/gradient";
export default function AppLayout() {
  const { phase, bootstrap, refresh, logout, features, unavailableError } =
    useSession();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const showRail =
    width >= 600 && ["/", "/users", "/activity", "/more"].includes(pathname);
  if (phase === "storageBlocked")
    return (
      <Screen>
        <Card>
          <Label accessibilityRole="alert">{t("storageCleanupFailed")}</Label>
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
        {showRail && <Sidebar rail />}
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              header: ({ options, route }) => (
                <View
                  style={{
                    paddingTop: insets.top,
                    paddingHorizontal: width < 600 ? 16 : 24,
                    backgroundColor: colors.canvas,
                    overflow: "hidden",
                  }}
                >
                  <CanvasTint />
                  <BackHeader
                    title={String(options.title ?? route.name)}
                    fallback="/"
                  />
                </View>
              ),
              headerStyle: { backgroundColor: colors.canvas },
              headerShadowVisible: false,
              headerTitleStyle: {
                fontFamily: "Inter_600SemiBold",
                fontSize: 22,
                color: colors.text.primary,
              },
              headerTintColor: colors.brand.primary,
              contentStyle: { backgroundColor: "transparent" },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
