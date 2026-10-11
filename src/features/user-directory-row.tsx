import { Pressable, View, useWindowDimensions } from "react-native";
import { Square, SquareCheck } from "lucide-react-native";
import { Label } from "@/components/ui";
import { useTheme } from "@/theme";
import type { UserRecord } from "@/api/runtime";
import { t } from "@/localization";
import { userStatusLabel, userStatusTone } from "./user-status";
export function UserDirectoryRow({
  user,
  selectable,
  selected,
  selecting,
  busy,
  onToggle,
  onOpen,
  onActions,
  onSelect,
}: {
  user: UserRecord;
  selectable: boolean;
  selected: boolean;
  selecting: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onActions: () => void;
  onSelect: () => void;
}) {
  const { colors, dark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const narrow = fontScale >= 1.5;
  const small = width <= 330;
  const name = user.name ?? user.public_id;
  const statusLabel = userStatusLabel(user);
  const statusTone = userStatusTone(user);
  const statusColor =
    statusTone === "neutral"
      ? colors.text.secondary
      : colors.status[`${statusTone}Text`];
  const statusBackground =
    statusTone === "neutral"
      ? colors.surfaceMuted
      : colors.status[`${statusTone}Soft`];
  const roles = user.roles ?? [];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const badges = (
    <View
      style={{
        alignItems: narrow ? "flex-start" : "flex-end",
        flexDirection: narrow ? "row" : "column",
        flexWrap: "wrap",
        gap: 2,
        maxWidth: narrow ? undefined : 74,
      }}
    >
      {roles.map((role) => (
        <View
          key={role.id}
          style={{
            paddingVertical: 2,
            paddingHorizontal: 6,
            borderRadius: 6,
            backgroundColor:
              role.name === "Manager"
                ? colors.accent.purpleSoft
                : colors.brand.primarySoft,
          }}
        >
          <Label
            size="caption"
            style={{
              fontSize: small ? 8 : 9,
              lineHeight: 13,
              color:
                role.name === "Manager"
                  ? colors.accent.purple
                  : colors.brand.primary,
            }}
          >
            {role.name === "Administrator" ? "Admin" : role.name}
          </Label>
        </View>
      ))}
      {statusLabel && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            paddingVertical: 2,
            paddingHorizontal: 6,
            borderRadius: 6,
            backgroundColor: statusBackground,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: statusColor,
            }}
          />
          <Label
            size="caption"
            style={{
              color: statusColor,
              fontSize: small ? 8 : 9,
              lineHeight: 13,
            }}
          >
            {statusLabel}
          </Label>
        </View>
      )}
    </View>
  );
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        minHeight: small ? 58 : 61,
        paddingVertical: 7,
        paddingRight: 8,
        paddingLeft: selectable ? 4 : 14,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: selected ? "#AFCBFA" : dark ? colors.border : "#DCE5F0",
        boxShadow: selected ? "inset 3px 0px #155EEF" : undefined,
        borderRadius: 12,
        backgroundColor: selected
          ? dark
            ? colors.brand.primarySoft
            : "#F1F6FF"
          : colors.surface,
      }}
    >
      {selectable && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Select ${name}`}
          accessibilityState={{ checked: selected, disabled: busy }}
          disabled={busy}
          onPress={onToggle}
          style={{
            width: 48,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? (
            <SquareCheck size={20} color={colors.brand.primary} />
          ) : (
            <Square
              size={20}
              strokeWidth={1.7}
              color={colors.selectionOutline}
            />
          )}
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[name, user.email, statusLabel]
          .filter(Boolean)
          .join(", ")}
        accessibilityState={{ selected, disabled: selecting && busy }}
        disabled={selecting && busy}
        onPress={onOpen}
        onLongPress={selectable && !busy ? onSelect : undefined}
        accessibilityActions={[
          { name: "showActions", label: t("recordActions", { name }) },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "showActions" && !busy) onActions();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.brand.primarySoft,
          }}
        >
          <Label
            size="captionMedium"
            style={{
              color: colors.brand.primary,
              fontSize: 11,
              lineHeight: 16,
            }}
          >
            {initials}
          </Label>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Label
            size="bodyMedium"
            style={{
              fontFamily: "Inter_650DemiBold",
              fontSize: small ? 11 : 13,
              lineHeight: 17,
            }}
          >
            {name}
          </Label>
          {user.email !== undefined && (
            <Label
              size="caption"
              tone="secondary"
              numberOfLines={narrow ? undefined : 1}
              style={{
                fontSize: small ? 9 : 10,
                lineHeight: 14,
                color: dark ? colors.text.secondary : "#718198",
              }}
            >
              {user.email}
            </Label>
          )}
          {narrow && badges}
        </View>
        {!narrow && badges}
      </Pressable>
    </View>
  );
}
