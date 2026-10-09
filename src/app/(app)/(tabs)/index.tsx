import { router } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { z } from "zod";
import { useBootstrap, useSession } from "@/auth/session";
import { api, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { auditSchema, envelope, dictionary } from "@/api/runtime";
import { Button, Card, ErrorState, Label, Screen, Chip } from "@/components/ui";
import { useState } from "react";
import { t, number } from "@/localization";
import { kpiColumns } from "@/utils/layout";
import { useTheme } from "@/theme";
import { queryClient, queryKey } from "@/api/query";
import { HomeHeader } from "@/features/home-header";
import { AccountTrend } from "@/features/account-trend";
import { ActivityRow } from "@/features/activity-row";
import {
    Users,
    UserCheck,
    UserX,
    BadgeCheck,
    UserPlus,
    Shield,
    FileText,
    ChartNoAxesColumn,
} from "lucide-react-native";
import {
    HomeSkeleton,
    QuickAction,
    SearchLauncher,
} from "@/components/visuals";
import { useFeatureWork } from "@/features/use-feature-work";
import {
    permittedExportResources,
    searchableResources,
} from "@/modules/registry";
export const summarySchema = z.object({
    metrics: dictionary(z.number()),
    new_users: z.array(
        z.object({ date: z.string(), label: z.string(), count: z.number() }),
    ),
    recent: z.array(auditSchema),
    timezone: z.string(),
    period: z.number(),
});
export default function Home() {
    const snapshot = useBootstrap();
    return (
        <HomeScreen
            key={[
                snapshot.account.id,
                snapshot.access_revision,
                snapshot.configuration_revision,
            ].join(":")}
        />
    );
}
function HomeScreen() {
    const snapshot = useBootstrap();
    const session = useSession();
    const work = useFeatureWork();
    const { colors } = useTheme();
    const { width, fontScale } = useWindowDimensions();
    const [period, setPeriod] = useState<7 | 30>(7);
    const sources = searchableResources(snapshot);
    const refresh = () =>
        work.run(async (scope) => {
            await session.refresh();
            scope.assertCurrent();
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: queryKey(snapshot, "dashboard").slice(0, 5),
                    exact: false,
                }),
                queryClient.invalidateQueries({
                    queryKey: queryKey(snapshot, "notification-summary"),
                    exact: false,
                }),
                queryClient.invalidateQueries({
                    queryKey: queryKey(snapshot, "home-avatar-profile"),
                    exact: false,
                }),
            ]);
            scope.assertCurrent();
        });
    const query = useRead(
        "dashboard",
        period,
        async (signal) =>
            unwrap(
                await api.GET("/v1/dashboard", {
                    params: { query: { period: period === 7 ? "7" : "30" } },
                    signal,
                }),
                envelope(summarySchema),
            ).data,
        !!snapshot.modules.dashboard,
    );
    if (!snapshot.modules.dashboard)
        return (
            <Screen
                scroll
                contentStyle={{ gap: width < 600 ? 12 : 16 }}
                refreshing={work.busy}
                onRefresh={width < 600 ? () => void refresh() : undefined}
            >
                <HomeHeader
                    onRefresh={width >= 600 ? () => void refresh() : undefined}
                    refreshing={work.busy}
                />
                {!!sources.length && (
                    <SearchLauncher
                        label={t("searchResources", {
                            resources: sources
                                .map((source) => t(source.label))
                                .join(", "),
                        })}
                        onPress={() => router.push("/search")}
                    />
                )}

                <Card>
                    <Label size="title">{t("accountHome")}</Label>
                    <Label>{t("accountHint")}</Label>
                    <Button
                        label={t("profile")}
                        onPress={() => router.push("/profile")}
                    />
                </Card>
                <HomeQuickActions />
                {!!work.error && (
                    <ErrorState
                        error={work.error}
                        retry={() => void refresh()}
                    />
                )}
            </Screen>
        );
    const columns =
        width < 600 && fontScale >= 1.5 ? 1 : kpiColumns(width, fontScale);
    const cardWidth: `${number}%` = `${100 / columns - (columns === 1 ? 0 : columns === 4 ? 2 : 3)}%`;
    const cardGap = width < 600 ? 12 : 16;
    const metrics = (
        [
            ["Total accounts", "totalAccounts"],
            ["Enabled", "enabled"],
            ["Disabled", "disabled"],
            ["Verified email", "verifiedEmail"],
        ] as const
    ).filter(([key]) =>
        query.data
            ? query.data.metrics[key] !== undefined
            : snapshot.modules.users &&
              (!["Enabled", "Disabled"].includes(key) ||
                  snapshot.fields.status?.view) &&
              (key !== "Verified email" || snapshot.fields.email?.view),
    );
    return (
        <Screen
            scroll
            contentStyle={{ gap: width < 600 ? 12 : 16 }}
            refreshing={work.busy}
            onRefresh={width < 600 ? () => void refresh() : undefined}
        >
            <HomeHeader
                onRefresh={width >= 600 ? () => void refresh() : undefined}
                refreshing={work.busy}
            />
            {!!sources.length && (
                <SearchLauncher
                    label={t("searchResources", {
                        resources: sources
                            .map((source) => t(source.label))
                            .join(", "),
                    })}
                    onPress={() => router.push("/search")}
                />
            )}

            {!!work.error && (
                <ErrorState error={work.error} retry={() => void refresh()} />
            )}
            {query.isPending ? (
                <HomeSkeleton
                    label={t("loading")}
                    count={metrics.length}
                    cardWidth={cardWidth}
                    gap={cardGap}
                />
            ) : query.error ? (
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            ) : (
                query.data && (
                    <>
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: cardGap,
                            }}
                        >
                            {metrics.map(([key, label]) => (
                                <Card
                                    key={key}
                                    style={{
                                        width: cardWidth,
                                        minHeight: 88,
                                        padding: 12,
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    <View
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 12,
                                            backgroundColor:
                                                key === "Total accounts"
                                                    ? colors.brand.primary
                                                    : key === "Enabled"
                                                      ? colors.status.success
                                                      : key === "Disabled"
                                                        ? colors.status.warning
                                                        : colors.accent.purple,
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    >
                                        {key === "Total accounts" ? (
                                            <Users
                                                size={20}
                                                color={colors.brand.primaryText}
                                            />
                                        ) : key === "Enabled" ? (
                                            <UserCheck
                                                size={20}
                                                color={colors.brand.primaryText}
                                            />
                                        ) : key === "Disabled" ? (
                                            <UserX
                                                size={20}
                                                color={colors.brand.primaryText}
                                            />
                                        ) : (
                                            <BadgeCheck
                                                size={20}
                                                color={colors.brand.primaryText}
                                            />
                                        )}
                                    </View>
                                    <View style={{ flex: 1, gap: 4 }}>
                                        <Label
                                            size="title"
                                            style={{
                                                fontFamily: "Inter_600SemiBold",
                                            }}
                                        >
                                            {number(query.data!.metrics[key]!)}
                                        </Label>
                                        <Label
                                            tone="secondary"
                                            size="captionMedium"
                                        >
                                            {t(label)}
                                        </Label>
                                    </View>
                                </Card>
                            ))}
                        </View>
                        <HomeQuickActions />
                        {!!query.data.recent.length && (
                            <Card>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 8,
                                    }}
                                >
                                    <Label size="title">
                                        {t("recentActivity")}
                                    </Label>
                                    <Button
                                        variant="tertiary"
                                        label={t("seeAll")}
                                        onPress={() =>
                                            router.navigate(
                                                "/(app)/(tabs)/activity",
                                            )
                                        }
                                    />
                                </View>
                                {query.data.recent.slice(0, 6).map((event) => (
                                    <ActivityRow
                                        key={event.id}
                                        event={event}
                                        timezone={query.data!.timezone}
                                        onPress={() =>
                                            router.push(`/activity/${event.id}`)
                                        }
                                    />
                                ))}
                            </Card>
                        )}
                        <Card>
                            <Label size="title">{t("newAccounts")}</Label>
                            <View
                                style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                }}
                            >
                                {([7, 30] as const).map((value) => (
                                    <Chip
                                        key={value}
                                        label={t(
                                            value === 7 ? "days7" : "days30",
                                        )}
                                        selected={value === period}
                                        onPress={() => setPeriod(value)}
                                    />
                                ))}
                            </View>
                            <Label size="caption" tone="secondary">
                                {t("trendHint")}
                            </Label>
                            <AccountTrend days={query.data.new_users} />
                            {query.data.new_users.map((day) => (
                                <View
                                    key={day.date}
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 12,
                                    }}
                                    accessibilityLabel={`${day.label}, ${number(day.count)}`}
                                >
                                    <Label size="caption" style={{ width: 80 }}>
                                        {day.label}
                                    </Label>
                                    <View
                                        style={{
                                            flex: 1,
                                            height: 16,
                                            backgroundColor:
                                                colors.surfaceMuted,
                                            borderRadius: 4,
                                        }}
                                    >
                                        <View
                                            style={{
                                                width: `${(day.count / Math.max(1, ...query.data!.new_users.map((item) => item.count))) * 100}%`,
                                                height: 16,
                                                backgroundColor:
                                                    colors.brand.primary,
                                                borderRadius: 4,
                                            }}
                                        />
                                    </View>
                                    <Label>{number(day.count)}</Label>
                                </View>
                            ))}
                        </Card>
                    </>
                )
            )}
        </Screen>
    );
}
function HomeQuickActions() {
    const snapshot = useBootstrap();
    const reports = permittedExportResources(snapshot).length > 0;
    if (
        !snapshot.actions["users.create"] &&
        !snapshot.modules.roles &&
        !snapshot.modules.activity &&
        !reports
    )
        return null;
    return (
        <View style={{ gap: 12 }}>
            <Label size="title">{t("quickActions")}</Label>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {snapshot.actions["users.create"] && (
                    <QuickAction
                        icon={UserPlus}
                        label={t("addUser")}
                        onPress={() => router.push("/users/new")}
                    />
                )}
                {snapshot.modules.roles && (
                    <QuickAction
                        icon={Shield}
                        label={t("roles")}
                        onPress={() => router.push("/roles")}
                    />
                )}
                {snapshot.modules.activity && (
                    <QuickAction
                        icon={FileText}
                        label={t("activity")}
                        onPress={() =>
                            router.navigate("/(app)/(tabs)/activity")
                        }
                    />
                )}
                {reports && (
                    <QuickAction
                        icon={ChartNoAxesColumn}
                        label={t("reports")}
                        onPress={() => router.push("/reports")}
                    />
                )}
            </View>
        </View>
    );
}
