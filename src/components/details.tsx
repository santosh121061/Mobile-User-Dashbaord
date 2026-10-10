import { Pressable, View } from "react-native";
import { Mail, UserRound, Phone, type LucideIcon } from "lucide-react-native";
import { useTheme } from "@/theme";
import { Label } from "./ui";

export function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const { dark } = useTheme();
  const Icon = /email/i.test(label)
    ? Mail
    : /phone/i.test(label)
      ? Phone
      : /name/i.test(label)
        ? UserRound
        : undefined;
  return (
    <View style={{ gap: 6 }}>
      <Label size="caption" tone="secondary">
        {label}
      </Label>
      <View
        style={{
          minHeight: 46,
          paddingHorizontal: 11,
          paddingVertical: 10,
          gap: 11,
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: dark ? "#344A6B" : "#D9E5F4",
          backgroundColor: dark ? "#1B2A44" : "#F5F8FF",
        }}
      >
        {Icon && <Icon size={19} color="#8199BC" />}
        <Label selectable style={{ flex: 1 }}>
          {value}
        </Label>
      </View>
    </View>
  );
}

export function KeyRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        paddingVertical: 15,
        borderBottomWidth: last ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <Label
        size="secondary"
        tone="secondary"
        style={{ flexBasis: "40%", flexShrink: 1 }}
      >
        {label}
      </Label>
      <Label
        size="bodyMedium"
        selectable
        style={{
          maxWidth: "65%",
          flexShrink: 1,
          textAlign: "right",
          fontFamily: "Inter_500Medium",
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        {value}
      </Label>
    </View>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  disabled,
  onChange,
  icon: Icon,
  accessibilityLabel,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  icon?: LucideIcon;
  accessibilityLabel?: string;
}) {
  const { colors, dark } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 69,
        paddingVertical: 13,
      }}
    >
      {Icon && (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.brand.primarySoft,
          }}
        >
          <Icon size={22} color={colors.brand.primary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Label size="bodyMedium">{label}</Label>
        {hint && (
          <Label size="caption" tone="secondary">
            {hint}
          </Label>
        )}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{
          checked: value,
          disabled: !!disabled,
          selected: value,
        }}
        disabled={disabled}
        onPress={() => onChange(!value)}
        style={{
          width: 48,
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <View
          style={{
            width: 42,
            height: 26,
            borderRadius: 13,
            padding: 3,
            backgroundColor: value
              ? dark
                ? "#2BBE8F"
                : "#10BC83"
              : colors.controlBorder,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              alignSelf: value ? "flex-end" : "flex-start",
              backgroundColor: "#FFFFFF",
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}

export function permissionLabel(key: string) {
  const [resource, action] = key.split(".");
  const names: Record<string, string> = {
    users: "users",
    roles: "roles",
    audit: "activity",
    api: "API keys",
    access: "access",
    settings: "settings",
    notifications: "notifications",
    account: "account",
    dashboard: "dashboard",
  };
  const actions: Record<string, string> = {
    view: "View",
    create: "Create",
    update: "Edit",
    manage: "Manage",
    export: "Export",
    delete: "Delete",
    status: "Change status of",
    roles: "Assign roles to",
    archive: "Archive",
    restore: "Restore",
    reset: "Send password reset to",
    sessions: "Revoke sessions for",
    bulk: "Bulk update",
    owners: "Manage owners and",
    password: "Change password for",
  };
  return actions[action ?? ""] && names[resource ?? ""]
    ? `${actions[action!]} ${names[resource!]}`
    : key.replaceAll(".", " ").replaceAll("_", " ");
}
