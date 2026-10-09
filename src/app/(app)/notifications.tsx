import { router } from "expo-router";
import { View } from "react-native";
import { api, check, unwrap } from "@/api/client";
import { usePages } from "@/api/hooks";
import { pageSchema, noticeSchema } from "@/api/runtime";
import { useBootstrap, useSession } from "@/auth/session";
import { Access } from "@/components/access";
import { Button, Card, ErrorState, Label, Screen } from "@/components/ui";
import { Records } from "@/components/records";
import { ExportButton } from "@/features/exports";
import { useFeatureWork } from "@/features/use-feature-work";
import { useUnread } from "@/features/inbox";
import { routeForIntent } from "@/utils/links";
import { date, number, t } from "@/localization";
import { useTheme } from "@/theme";
export default function Notifications() {
    const snapshot = useBootstrap();
    const session = useSession();
    const work = useFeatureWork();
    const { colors } = useTheme();
    const summary = useUnread();
    const enabled =
        !!snapshot.modules.notifications &&
        !!snapshot.features["notifications.in_app.enabled"];
    const query = usePages(
        "notifications",
        null,
        async (page, signal) =>
            unwrap(
                await api.GET("/v1/notifications", {
                    params: { query: { page } },
                    signal,
                }),
                pageSchema(noticeSchema),
            ),
        enabled,
    );
    const mark = (id: string, read: boolean) =>
        work.run(async (scope) => {
            check(
                await api.PATCH("/v1/notifications/{id}", {
                    params: { path: { id } },
                    body: { read },
                    signal: scope.signal,
                }),
            );
            scope.assertCurrent();
            await query.refetch();
            scope.assertCurrent();
            await summary.refetch();
        });
    const open = (path: string) =>
        work.run(async (scope) => {
            await session.refresh();
            scope.assertCurrent();
            router.push(routeForIntent(path) ?? "/unavailable");
        });
    return (
        <Access module="notifications">
            <Screen>
                <View
                    style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <Label size="h1" style={{ flexGrow: 1 }}>
                        {t("notifications")}
                    </Label>
                    {summary.unread !== undefined && (
                        <View
                            style={{
                                borderRadius: 9999,
                                paddingHorizontal: 12,
                                paddingVertical: 4,
                                backgroundColor: colors.brand.primarySoft,
                            }}
                        >
                            <Label
                                size="captionMedium"
                                accessibilityLiveRegion="polite"
                                style={{ color: colors.brand.primary }}
                            >
                                {t("unreadCount", {
                                    count: number(summary.unread),
                                })}
                            </Label>
                        </View>
                    )}
                </View>
                {!!summary.error && (
                    <ErrorState
                        error={summary.error}
                        retry={() => void summary.refetch()}
                    />
                )}
                <Button
                    label={t("readAll")}
                    variant="secondary"
                    loading={work.busy}
                    disabled={!enabled || !summary.unread}
                    onPress={() =>
                        void work.run(async (scope) => {
                            check(
                                await api.POST("/v1/notifications/read-all", {
                                    signal: scope.signal,
                                }),
                            );
                            scope.assertCurrent();
                            await query.refetch();
                            scope.assertCurrent();
                            await summary.refetch();
                        })
                    }
                />
                <ExportButton resource="notifications" />
                {!!work.error && <ErrorState error={work.error} />}
                <Records
                    rows={enabled ? query.rows : []}
                    pending={query.isPending}
                    error={query.error}
                    retry={() => void query.refetch()}
                    refreshing={query.isRefetching}
                    more={query.hasNextPage}
                    loadingMore={query.isFetchingNextPage}
                    next={() => void query.fetchNextPage()}
                    render={(notice) => (
                        <Card style={{ minHeight: 64, marginBottom: 12 }}>
                            <Label size="bodyMedium">
                                {notice.data.title ?? t("notifications")}
                            </Label>
                            {!!notice.data.message && (
                                <Label>{notice.data.message}</Label>
                            )}
                            <View
                                style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <Label size="caption" tone="secondary">
                                    {date(
                                        notice.created_at,
                                        snapshot.appearance.timezone,
                                    )}
                                </Label>
                                {!notice.read_at && (
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 4,
                                        }}
                                    >
                                        <View
                                            accessible={false}
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: 4,
                                                backgroundColor:
                                                    colors.brand.primary,
                                            }}
                                        />
                                        <Label
                                            size="captionMedium"
                                            style={{
                                                color: colors.brand.primary,
                                            }}
                                        >
                                            {t("unread")}
                                        </Label>
                                    </View>
                                )}
                            </View>
                            <View
                                style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    gap: 8,
                                }}
                            >
                                <Button
                                    label={t(
                                        notice.read_at
                                            ? "markUnread"
                                            : "markRead",
                                    )}
                                    variant="secondary"
                                    disabled={work.busy || !enabled}
                                    onPress={() =>
                                        void mark(notice.id, !notice.read_at)
                                    }
                                />
                                {!!notice.data.path && (
                                    <Button
                                        label={t("openDestination")}
                                        variant="secondary"
                                        disabled={work.busy || !enabled}
                                        onPress={() =>
                                            void open(notice.data.path!)
                                        }
                                    />
                                )}
                            </View>
                        </Card>
                    )}
                />
            </Screen>
        </Access>
    );
}
