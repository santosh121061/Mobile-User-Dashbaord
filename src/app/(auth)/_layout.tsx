import { Stack, Redirect } from "expo-router";
import { useSession } from "@/auth/session";
import {
    AvailabilityState,
    Loading,
    Screen,
    Card,
    Label,
    Button,
} from "@/components/ui";
import { configured } from "@/config/environment";
import { t } from "@/localization";
import { useIntent } from "@/auth/intents";
export default function AuthLayout() {
    const { phase, refresh, logout, features, unavailableError } = useSession();
    const intent = useIntent();
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
    if (phase === "ready" && (!intent || intent.kind === "record"))
        return <Redirect href={intent ? "/intent" : "/(app)/(tabs)"} />;
    if (phase === "checking" || phase === "loggingOut") return <Loading />;
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
    return <Stack screenOptions={{ headerShown: false }} />;
}
