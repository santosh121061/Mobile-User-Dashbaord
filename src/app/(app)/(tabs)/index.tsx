import { router } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { z } from "zod";
import { useBootstrap, useSession } from "@/auth/session";
import { api, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { auditSchema, envelope, dictionary } from "@/api/runtime";
import { Button, Card, ErrorState, Label, Screen, Chip } from "@/components/ui";
import { useState } from "react";
import { t, number } from "@/localization";
import { Sheet } from "@/components/sheet";
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
  ShieldCheck,
  Search,
  FileChartColumn,
  Activity,
} from "lucide-react-native";
import {
  HomeSkeleton,
  DashboardBanner,
  QuickAction,
  SearchLauncher,
  dashboardCardStyle,
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
  const { colors, dark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const [period, setPeriod] = useState<7 | 30>(7);
  const [showDays, setShowDays] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
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
        safeTop
        contentStyle={{ gap: width < 600 ? 12 : 16 }}
        refreshing={work.busy}
        onRefresh={width < 600 ? () => void refresh() : undefined}
        header={
          <HomeHeader
            onRefresh={width >= 600 ? () => void refresh() : undefined}
            refreshing={work.busy}
          />
        }
      >
        {!!sources.length && (
          <SearchLauncher
            displayLabel={
              "Search " +
              sources
                .map((source) => t(source.label).toLowerCase())
                .join(" or ")
            }
            label={t("searchResources", {
              resources: sources.map((source) => t(source.label)).join(", "),
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
        {snapshot.modules.activity && (
          <DashboardBanner
            onPress={() => router.push("/(app)/(tabs)/activity")}
          />
        )}
        {!!work.error && (
          <ErrorState error={work.error} retry={() => void refresh()} />
        )}
      </Screen>
    );
  const columns = fontScale >= 1.5 ? 1 : 2;
  const availableWidth =
    Math.min(width - (width >= 600 ? 88 : 0), 760) - (width < 600 ? 32 : 48);
  const cardWidth = (availableWidth - (columns - 1) * 8) / columns;
  const cardGap = 8;
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
      safeTop
      contentStyle={{ gap: width < 600 ? 12 : 16 }}
      refreshing={work.busy}
      onRefresh={width < 600 ? () => void refresh() : undefined}
      header={
        <HomeHeader
          onRefresh={width >= 600 ? () => void refresh() : undefined}
          refreshing={work.busy}
        />
      }
    >
      {!!sources.length && (
        <SearchLauncher
          displayLabel={
            "Search " +
            sources.map((source) => t(source.label).toLowerCase()).join(" or ")
          }
          label={t("searchResources", {
            resources: sources.map((source) => t(source.label)).join(", "),
          })}
          onPress={() => router.push("/search")}
        />
      )}

      {!!work.error && (
        <ErrorState error={work.error} retry={() => void refresh()} />
      )}
      {snapshot.modules.activity && (
        <DashboardBanner
          onPress={() => router.push("/(app)/(tabs)/activity")}
        />
      )}
      {query.isPending ? (
        <HomeSkeleton
          label={t("loading")}
          count={metrics.length}
          cardWidth={cardWidth}
          gap={cardGap}
        />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
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
                    minHeight: 82,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    ...dashboardCardStyle(dark),
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor:
                        key === "Total accounts"
                          ? colors.brand.primarySoft
                          : key === "Enabled"
                            ? colors.status.successSoft
                            : key === "Disabled"
                              ? colors.status.warningSoft
                              : colors.accent.purpleSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {key === "Total accounts" ? (
                      <Users size={19} color={colors.brand.primary} />
                    ) : key === "Enabled" ? (
                      <UserCheck size={19} color={colors.status.successText} />
                    ) : key === "Disabled" ? (
                      <UserX size={19} color={colors.status.warningText} />
                    ) : (
                      <BadgeCheck size={19} color={colors.accent.purple} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Label tone="secondary" size="secondary">
                      {t(label)}
                    </Label>
                    <Label size="metric">
                      {number(query.data!.metrics[key]!)}
                    </Label>
                  </View>
                </Card>
              ))}
            </View>
            <Card
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                paddingBottom: 11,
                gap: 4,
                ...dashboardCardStyle(dark),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Activity size={22} color={colors.brand.primary} />
                  <Label size="title" style={{ letterSpacing: -0.25 }}>
                    {t("newAccounts")}
                  </Label>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose chart period"
                  onPress={() => setPeriodOpen(true)}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    marginVertical: -9,
                  }}
                >
                  <Label size="caption" tone="secondary">
                    Last {period} days
                  </Label>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  showDays ? "hideDailyCounts" : "viewDailyCounts",
                )}
                onPress={() => setShowDays((value) => !value)}
              >
                <AccountTrend days={query.data.new_users} />
              </Pressable>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Label size="caption" tone="secondary">
                  {query.data.new_users[0]?.date} –{" "}
                  {query.data.new_users.at(-1)?.date}
                </Label>
                <Label size="caption">
                  {number(
                    query.data.new_users.reduce(
                      (total, day) => total + day.count,
                      0,
                    ),
                  )}{" "}
                  new accounts
                </Label>
              </View>
              {showDays &&
                query.data.new_users.map((day) => (
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
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: 4,
                      }}
                    >
                      <View
                        style={{
                          width: `${(day.count / Math.max(1, ...query.data!.new_users.map((item) => item.count))) * 100}%`,
                          height: 16,
                          backgroundColor: colors.brand.primary,
                          borderRadius: 4,
                        }}
                      />
                    </View>
                    <Label>{number(day.count)}</Label>
                  </View>
                ))}
            </Card>
            {periodOpen && (
              <Sheet title="Chart period" close={() => setPeriodOpen(false)}>
                {([7, 30] as const).map((value) => (
                  <Chip
                    key={value}
                    label={t(value === 7 ? "days7" : "days30")}
                    selected={value === period}
                    onPress={() => {
                      setPeriod(value);
                      setPeriodOpen(false);
                    }}
                  />
                ))}
              </Sheet>
            )}
            <HomeQuickActions />
            {!!query.data.recent.length && (
              <View style={{ gap: 12, marginTop: 0 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Label size="title" style={{ letterSpacing: -0.25 }}>
                    {t("recentActivity")}
                  </Label>
                  <Button
                    variant="tertiary"
                    label="View all"
                    compact
                    style={{ minHeight: 32, paddingVertical: 2 }}
                    onPress={() => router.navigate("/(app)/(tabs)/activity")}
                  />
                </View>
                <Card
                  style={{
                    paddingVertical: 0,
                    paddingHorizontal: 12,
                    gap: 0,
                    ...dashboardCardStyle(dark),
                  }}
                >
                  {query.data.recent.slice(0, 3).map((event, index, recent) => (
                    <ActivityRow
                      compact
                      last={index === recent.length - 1}
                      key={event.id}
                      event={event}
                      timezone={query.data!.timezone}
                      onPress={() => router.push(`/activity/${event.id}`)}
                    />
                  ))}
                </Card>
              </View>
            )}
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
      <Label size="title" style={{ letterSpacing: -0.25 }}>
        {t("quickActions")}
      </Label>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {snapshot.actions["users.create"] && (
          <QuickAction
            icon={UserPlus}
            label={t("addUser")}
            onPress={() => router.push("/users/new")}
          />
        )}
        {snapshot.modules.users && (
          <QuickAction
            icon={Search}
            tone="mint"
            label="Find user"
            onPress={() => router.push("/search")}
          />
        )}
        {reports && (
          <QuickAction
            icon={FileChartColumn}
            tone="purple"
            label={t("reports")}
            onPress={() => router.push("/reports")}
          />
        )}
        {snapshot.modules.roles && (
          <QuickAction
            icon={ShieldCheck}
            tone="gold"
            label="Roles"
            onPress={() => router.push("/roles")}
          />
        )}
      </View>
    </View>
  );
}
