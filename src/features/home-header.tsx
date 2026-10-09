import { Pressable, View, useWindowDimensions } from "react-native";
import { Brand } from "@/components/brand";
import { Bell, RefreshCw } from "lucide-react-native";
import { IconButton } from "@/components/visuals";
import { router } from "expo-router";
import { api, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { profileSchema } from "@/api/contracts";
import { useBootstrap } from "@/auth/session";
import { Label } from "@/components/ui";
import { AvatarView } from "./avatar";
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
    const { width } = useWindowDimensions();
    const unread = useUnread();
    const profile = useRead(
        "home-avatar-profile",
        null,
        async (signal) =>
            unwrap(
                await api.GET("/v1/profile", { signal }),
                envelope(profileSchema),
            ).data,
        !!snapshot.features["users.avatar.enabled"],
    );
    const count = unread.unread;
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                minHeight: 56,
            }}
        >
            <AvatarView
                name={snapshot.account.name}
                available={!!profile.data?.avatar_available}
                version={profile.dataUpdatedAt}
                size={40}
            />
            <View style={{ flex: 1, minWidth: 120, gap: 4 }}>
                {width < 600 && (
                    <Brand wordmarkWidth={152} wordmarkHeight={22} />
                )}
                <Label size="caption" tone="secondary">
                    {t("welcome")}
                </Label>
                <Label size="title" style={{ fontFamily: "Inter_600SemiBold" }}>
                    {snapshot.account.name}
                </Label>
            </View>
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
                            count
                                ? t("unreadCount", { count: number(count) })
                                : "",
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
                                ? colors.surfaceMuted
                                : colors.surface,
                        })}
                    >
                        <Bell size={24} color={colors.text.primary} />
                        {!!count && (
                            <View
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    right: 0,
                                    minWidth: 16,
                                    minHeight: 16,
                                    paddingHorizontal: 4,
                                    paddingVertical: 2,
                                    alignItems: "center",
                                    borderRadius: 16,
                                    backgroundColor: colors.status.danger,
                                }}
                            >
                                <Label
                                    accessible={false}
                                    size="captionMedium"
                                    style={{
                                        color: colors.status.dangerButtonText,
                                    }}
                                >
                                    {count > 99 ? "99+" : number(count)}
                                </Label>
                            </View>
                        )}
                    </Pressable>
                )}
        </View>
    );
}
