import { Bell } from "lucide-react-native";
import { ToggleRow } from "@/components/details";
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
      <Label tone="secondary">{t("pushPrivacyHint")}</Label>
      <ToggleRow
        label={t("pushNotifications")}
        icon={Bell}
        value={enabled}
        disabled={push.busy || !push.preferences || (!enabled && !available)}
        onChange={(value) => void push.change(value)}
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
