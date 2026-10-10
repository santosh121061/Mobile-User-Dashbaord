import { Pressable, View, useWindowDimensions } from "react-native";
import { Square, SquareCheck } from "lucide-react-native";
import { Label } from "@/components/ui";
import { useTheme } from "@/theme";
import type { UserRecord } from "@/api/runtime";
import { t } from "@/localization";
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
  const narrow = width < 360 || fontScale >= 1.5;
  const name = user.name ?? user.public_id;
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
        gap: 4,
        maxWidth: narrow ? undefined : 92,
      }}
    >
      {roles.map((role) => (
        <View
          key={role.id}
          style={{
            paddingVertical: 3,
            paddingHorizontal: 7,
            borderRadius: 9,
            backgroundColor:
              role.name === "Manager"
                ? colors.accent.purpleSoft
                : colors.brand.primarySoft,
          }}
        >
          <Label
            size="caption"
            style={{
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
      {(user.archived || user.status) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingVertical: 3,
            paddingHorizontal: 7,
            borderRadius: 9,
            backgroundColor: user.archived
              ? colors.surfaceMuted
              : user.status === "enabled"
                ? colors.status.successSoft
                : colors.status.dangerSoft,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: user.archived
                ? colors.text.secondary
                : user.status === "enabled"
                  ? colors.status.successText
                  : colors.status.dangerText,
            }}
          />
          <Label
            size="caption"
            style={{
              color: user.archived
                ? colors.text.secondary
                : user.status === "enabled"
                  ? colors.status.successText
                  : colors.status.dangerText,
            }}
          >
            {t(user.archived ? "archived" : user.status!)}
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
        minHeight: 77,
        paddingVertical: 10,
        paddingRight: 10,
        paddingLeft: selectable ? 4 : 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: selected ? "#D0E4FF" : colors.border + "9E",
        boxShadow: dark
          ? "0px 3px 18px rgba(0,0,0,0.062745)"
          : "0px 3px 16px rgba(49,88,148,0.023529)",
        borderRadius: 18,
        backgroundColor: selected ? colors.brand.primarySoft : colors.surface,
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
            <Square size={20} strokeWidth={1.7} color={colors.selectionOutline} />
          )}
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          name,
          user.email,
          user.archived ? t("archived") : user.status && t(user.status),
        ]
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
          minHeight: 54,
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.brand.primarySoft,
          }}
        >
          <Label size="captionMedium" style={{ color: colors.brand.primary }}>
            {initials}
          </Label>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Label size="bodyMedium">{name}</Label>
          {user.email !== undefined && (
            <Label
              size="caption"
              tone="secondary"
              numberOfLines={narrow ? undefined : 1}
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
