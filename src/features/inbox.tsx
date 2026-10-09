import { z } from "zod";
import { router } from "expo-router";
import { useEffect } from "react";
import { api, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { useSession } from "@/auth/session";
import { Label, Row } from "@/components/ui";
import { number, t } from "@/localization";
import { View } from "react-native";
import { Bell, ChevronRight } from "lucide-react-native";
import { useTheme } from "@/theme";
export function useUnread() {
    const { bootstrap, phase } = useSession();
    const enabled =
        phase === "ready" &&
        !!bootstrap?.modules.notifications &&
        !!bootstrap.features["notifications.in_app.enabled"];
    const query = useRead(
        "notification-summary",
        null,
        async (signal) =>
            unwrap(
                await api.GET("/v1/notifications/summary", { signal }),
                envelope(z.object({ unread: z.number().int().nonnegative() })),
            ).data,
        enabled,
    );
    const refetch = query.refetch;
    useEffect(() => {
        if (!enabled) return;
        const timer = setInterval(() => {
            void refetch();
        }, 60000);
        return () => clearInterval(timer);
    }, [enabled, refetch]);
    return { ...query, unread: enabled ? query.data?.unread : undefined };
}
export function UnreadBadge() {
    const query = useUnread();
    return query.unread ? (
        <Label
            accessibilityLabel={t("unreadCount", {
                count: number(query.unread),
            })}
            accessibilityLiveRegion="polite"
            size="captionMedium"
        >
            {number(query.unread)}
        </Label>
    ) : null;
}
export function InboxDestination() {
    const query = useUnread();
    const { colors } = useTheme();
    const unread = query.unread
        ? t("unreadCount", { count: number(query.unread) })
        : "";
    return (
        <Row
            title={t("notifications")}
            leading={
                <View
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        backgroundColor: colors.brand.primarySoft,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Bell size={20} color={colors.brand.primary} />
                </View>
            }
            accessibilityLabel={[t("notifications"), unread]
                .filter(Boolean)
                .join(", ")}
            trailing={
                query.unread ? (
                    <Label
                        size="captionMedium"
                        style={{ color: colors.brand.primary }}
                    >
                        {number(query.unread)}
                    </Label>
                ) : (
                    <ChevronRight size={18} color={colors.text.tertiary} />
                )
            }
            onPress={() => router.push("/notifications")}
        />
    );
}
