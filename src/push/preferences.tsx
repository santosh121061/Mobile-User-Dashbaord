import { Switch } from "react-native";
import { Button, Card, Label } from "@/components/ui";
import { useSession } from "@/auth/session";
import { t } from "@/localization";
import { usePush } from "./provider";

export function PushPreferences() {
    const push = usePush();
    const session = useSession();
    if (!push) return null;
    const enabled = push.preferences?.enabled ?? false;
    const available =
        push.supported &&
        push.preferences?.provider.status === "ready" &&
        !!session.bootstrap?.modules.notifications;
    return (
        <Card>
            <Label size="title">{t("pushNotifications")}</Label>
            <Label tone="secondary">{t("pushPrivacyHint")}</Label>
            <Switch
                style={{ minHeight: 48 }}
                accessibilityLabel={t("pushNotifications")}
                value={enabled}
                disabled={
                    push.busy || !push.preferences || (!enabled && !available)
                }
                onValueChange={(value) => void push.change(value)}
            />
            <Label
                accessibilityLiveRegion="polite"
                accessibilityRole={push.error ? "alert" : undefined}
                tone="secondary"
            >
                {push.registered
                    ? t("pushRegistered")
                    : push.error
                      ? push.error
                      : available
                        ? t("pushInactive")
                        : t("pushUnavailable")}
            </Label>
            <Button
                label={t("retry")}
                variant="secondary"
                loading={push.busy}
                onPress={push.retry}
            />
        </Card>
    );
}
