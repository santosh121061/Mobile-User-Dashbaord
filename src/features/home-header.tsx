import { Pressable, View } from "react-native";
import { RootHeader } from "@/components/chrome";
import { Bell, RefreshCw } from "lucide-react-native";
import { IconButton } from "@/components/visuals";
import { router } from "expo-router";
import { useBootstrap } from "@/auth/session";
import { useUnread } from "./inbox";
import { number, t } from "@/localization";
import { useTheme } from "@/theme";

export function HomeHeader({
  onRefresh,
  refreshing,
}: {
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const snapshot = useBootstrap();
  const { colors } = useTheme();
  const unread = useUnread();
  const count = unread.unread;
  return (
    <RootHeader subtitle={`${t("welcome")} ${snapshot.account.name}`}>
      {onRefresh && (
        <IconButton
          label={t("refresh")}
          onPress={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={24} color={colors.brand.primary} />
        </IconButton>
      )}
      {snapshot.modules.notifications &&
        snapshot.features["notifications.in_app.enabled"] && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[
              t("notifications"),
              count ? t("unreadCount", { count: number(count) }) : "",
            ]
              .filter(Boolean)
              .join(", ")}
            onPress={() => router.push("/notifications")}
            style={({ pressed }) => ({
              minWidth: 48,
              minHeight: 48,
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed
                ? colors.brand.primarySoft
                : "transparent",
            })}
          >
            <Bell size={24} color={colors.text.secondary} />
            {!!count && (
              <View
                testID="home-unread-dot"
                style={{
                  position: "absolute",
                  top: 7,
                  right: 10,
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: colors.status.danger,
                }}
              />
            )}
          </Pressable>
        )}
    </RootHeader>
  );
}
