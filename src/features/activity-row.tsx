import { Pressable, View } from "react-native";
import {
  Activity,
  ShieldCheck,
  UserRound,
  FileChartColumn,
  Laptop,
  ChevronRight,
} from "lucide-react-native";
import type { z } from "zod";
import { auditSchema } from "@/api/runtime";
import { Label } from "@/components/ui";
import { date, t } from "@/localization";
import { useTheme } from "@/theme";

export function activityTitle(action: string) {
  const words = action.replaceAll(".", " ").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ActivityRow({
  event,
  timezone,
  onPress,
  compact = false,
  last = false,
}: {
  event: z.infer<typeof auditSchema>;
  timezone?: string;
  onPress: () => void;
  compact?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const actor = event.actor.name ?? t("system");
  const title = activityTitle(event.action);
  const exported = /export|report/.test(event.action),
    permission = /role|access|permission/.test(event.action),
    signedIn = /login|session|device/.test(event.action),
    person = /user|invite/.test(event.action);
  const Icon = exported
    ? FileChartColumn
    : permission
      ? ShieldCheck
      : signedIn
        ? Laptop
        : person
          ? UserRound
          : Activity;
  const tone = exported
    ? colors.accent.purple
    : signedIn
      ? colors.status.warningText
      : person
        ? colors.status.successText
        : colors.brand.primary;
  const soft = exported
    ? colors.accent.purpleSoft
    : signedIn
      ? colors.status.warningSoft
      : person
        ? colors.status.successSoft
        : colors.brand.primarySoft;
  const success = event.outcome === "success";
  const outcome = success
    ? "Succeeded"
    : event.outcome === "denied"
      ? "Denied"
      : ["error", "failed", "failure"].includes(event.outcome)
        ? "Failed"
        : event.outcome;
  let clock: string;
  try {
    clock = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(event.created_at));
  } catch {
    clock = date(event.created_at, timezone);
  }
  const result = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: success
            ? colors.status.successText
            : colors.status.dangerText,
        }}
      />
      <Label
        size="caption"
        style={{
          color: success ? colors.status.successText : colors.status.dangerText,
        }}
      >
        {outcome}
      </Label>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: compact ? "center" : "flex-start",
        gap: 10,
        minHeight: compact ? (last ? 66 : 67) : 111,
        borderWidth: compact ? 0 : 1,
        borderBottomWidth: compact ? (last ? 0 : 1) : 1,
        borderColor: colors.border,
        borderRadius: compact ? 0 : 20,
        backgroundColor: pressed
          ? colors.brand.primarySoft
          : compact
            ? "transparent"
            : colors.surface,
        paddingHorizontal: compact ? 0 : 12,
        paddingTop: 12,
        paddingBottom: compact ? 12 : 10,
        marginBottom: compact ? 0 : 8,
      })}
    >
      <View
        style={{
          width: compact ? 36 : 38,
          height: compact ? 36 : 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: soft,
        }}
      >
        <Icon size={compact ? 19 : 22} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Label size="bodyMedium" style={{ flexShrink: 1 }}>
            {title}
          </Label>
          <Label size="caption" tone="secondary">
            {clock}
          </Label>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Label
            size={compact ? "caption" : "captionMedium"}
            tone={compact ? "secondary" : "primary"}
          >
            {actor}
          </Label>
          {compact && result}
        </View>
        {!compact && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
            }}
          >
            {result}
            <ChevronRight size={13} color={colors.text.secondary} />
          </View>
        )}
      </View>
    </Pressable>
  );
}
