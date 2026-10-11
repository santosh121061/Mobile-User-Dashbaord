import { useTitle } from "@/components/forms";
import { router } from "expo-router";
import { View } from "react-native";
import { useState } from "react";
import { Bell } from "lucide-react-native";
import { Sheet } from "@/components/sheet";
import { api, check, unwrap } from "@/api/client";
import { usePages } from "@/api/hooks";
import { pageSchema, noticeSchema } from "@/api/runtime";
import { useBootstrap, useSession } from "@/auth/session";
import { Access } from "@/components/access";
import { Button, Chip, Row, ErrorState, Label, Screen } from "@/components/ui";
import { Records } from "@/components/records";
import { ExportButton } from "@/features/exports";
import { useFeatureWork } from "@/features/use-feature-work";
import { useUnread } from "@/features/inbox";
import { routeForIntent, permitsIntent, unavailableHref } from "@/utils/links";
import { date, number, t } from "@/localization";
import { useTheme } from "@/theme";
export default function Notifications() {
  useTitle(t("notifications"));
  const snapshot = useBootstrap();
  const session = useSession();
  const work = useFeatureWork();
  const { colors } = useTheme();
  const summary = useUnread();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
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
      const route = routeForIntent(path);
      router.push(
        permitsIntent(route, snapshot)
          ? route
          : unavailableHref(route, snapshot.account.id),
      );
    });
  return (
    <Access module="notifications">
      <Screen>
        <View style={{ flexDirection: "row" }}>
          <Chip
            label={t("all")}
            selected={!unreadOnly}
            onPress={() => setUnreadOnly(false)}
          />
          <Chip
            label={t("unread")}
            selected={unreadOnly}
            onPress={() => setUnreadOnly(true)}
          />
        </View>
        {!!summary.error && (
          <ErrorState
            error={summary.error}
            retry={() => void summary.refetch()}
          />
        )}
        <View
          style={{
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Label
            size="caption"
            tone="secondary"
            style={{ flex: 1 }}
            accessibilityLiveRegion="polite"
          >
            {summary.unread === undefined
              ? ""
              : t("unreadCount", { count: number(summary.unread) })}
          </Label>
          <Button
            label={t("readAll")}
            variant="tertiary"
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
          <ExportButton resource="notifications" iconOnly />
        </View>
        {!!work.error && <ErrorState error={work.error} />}
        <Records
          rows={
            enabled
              ? query.rows.filter((notice) => !unreadOnly || !notice.read_at)
              : []
          }
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
          refreshing={query.isRefetching}
          more={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          next={() => void query.fetchNextPage()}
          render={(notice) => (
            <Row
              title={notice.data.title ?? t("notifications")}
              subtitle={notice.data.message ?? undefined}
              metadata={date(notice.created_at, snapshot.appearance.timezone)}
              metadataPosition="below"
              selected={!notice.read_at}
              leading={
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 13,
                    backgroundColor: colors.brand.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bell size={22} color={colors.brand.primary} />
                </View>
              }
              trailing={
                !notice.read_at ? (
                  <View
                    accessibilityLabel={t("unread")}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.brand.primary,
                    }}
                  />
                ) : undefined
              }
              onPress={() => setSelected(notice.id)}
            />
          )}
        />
        {query.rows
          .filter((notice) => notice.id === selected)
          .map((notice) => (
            <Sheet
              key={notice.id}
              title={notice.data.title ?? t("notifications")}
              close={() => setSelected(null)}
            >
              {!!notice.data.message && <Label>{notice.data.message}</Label>}
              <Label size="caption" tone="secondary">
                {date(notice.created_at, snapshot.appearance.timezone)}
              </Label>
              <Button
                label={t(notice.read_at ? "markUnread" : "markRead")}
                variant="tertiary"
                disabled={work.busy || !enabled}
                onPress={() => void mark(notice.id, !notice.read_at)}
              />
              {!!notice.data.path && (
                <Button
                  label={t("openDestination")}
                  variant="tertiary"
                  disabled={work.busy || !enabled}
                  onPress={() => void open(notice.data.path!)}
                />
              )}
            </Sheet>
          ))}
      </Screen>
    </Access>
  );
}
