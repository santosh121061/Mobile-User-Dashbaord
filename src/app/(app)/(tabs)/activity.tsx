import { RootHeader } from "@/components/chrome";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  Search,
  RefreshCw,
  SlidersHorizontal,
  CalendarDays,
} from "lucide-react-native";
import { useTheme } from "@/theme";
import { IconButton } from "@/components/visuals";
import { ActivityRow } from "@/features/activity-row";
import { api, unwrap } from "@/api/client";
import { useBootstrap } from "@/auth/session";
import { usePages, useSearch } from "@/api/hooks";
import { pageSchema, auditSchema } from "@/api/runtime";
import { Access } from "@/components/access";
import {
  Button,
  Chip,
  ErrorState,
  Input,
  Label,
  Screen,
} from "@/components/ui";
import { Records } from "@/components/records";
import { Sheet } from "@/components/sheet";
import { Choice } from "@/features/choice";
import { t } from "@/localization";
import { ExportButton } from "@/features/exports";
import {
  useActivityNotice,
  type ActivityCriteria,
} from "@/features/activity-notice";
import { useFeatureWork } from "@/features/use-feature-work";
type State = "" | "success" | "denied" | "failed";
export default function Activity() {
  const snapshot = useBootstrap();
  return (
    <ActivityList
      key={[
        snapshot.account.id,
        snapshot.access_revision,
        snapshot.configuration_revision,
      ].join(":")}
    />
  );
}
function ActivityList() {
  const { colors } = useTheme();
  const snapshot = useBootstrap();
  const { search, setSearch, debounced } = useSearch();
  const params = useLocalSearchParams<{
    search?: string;
    account?: string;
  }>();
  const importedSearch = useRef("");
  const [state, setState] = useState<State>("");
  const [category, setCategory] = useState<ActivityCriteria["category"]>();
  const [period, setPeriod] = useState<ActivityCriteria["period"]>();
  const [dialog, setDialog] = useState<"filters" | "dates" | null>(null);
  useEffect(() => {
    if (
      typeof params.search !== "string" ||
      params.account !== snapshot.account.id ||
      params.search.length > 100 ||
      importedSearch.current === params.search
    )
      return;
    importedSearch.current = params.search;
    setSearch(params.search);
  }, [params.search, params.account, snapshot.account.id, setSearch]);
  const criteria: ActivityCriteria = {
    search: debounced,
    ...(state ? { state } : {}),
    ...(category ? { category } : {}),
    ...(period ? { period } : {}),
  };
  return (
    <Access module="activity">
      <Screen safeTop header={<RootHeader title={t("activity")} />}>
        <Input
          label={t("search")}
          hideLabel
          leading={<Search size={20} color={colors.text.tertiary} />}
          placeholder="Search activity"
          value={search}
          onChangeText={setSearch}
          maxLength={100}
        />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {(["", "success", "denied", "failed"] as State[]).map((value) => (
            <Chip
              key={value}
              label={t(value || "all")}
              selected={state === value}
              onPress={() => setState(value)}
            />
          ))}
          <IconButton
            label={t("activityFilters")}
            onPress={() => setDialog("filters")}
          >
            <SlidersHorizontal size={20} color={colors.text.secondary} />
          </IconButton>
          <IconButton
            label={t("activityPeriod")}
            onPress={() => setDialog("dates")}
          >
            <CalendarDays size={20} color={colors.text.secondary} />
          </IconButton>
        </View>
        {dialog === "filters" && (
          <Sheet title={t("activityFilters")} close={() => setDialog(null)}>
            <Label size="bodyMedium">{t("eventType")}</Label>
            {(["", "users", "security", "reports"] as const).map((value) => (
              <Choice
                key={value}
                label={t(value || "all")}
                selected={(category ?? "") === value}
                onPress={() => setCategory(value || undefined)}
              />
            ))}
            <Button
              label={t("activityPeriod")}
              variant="secondary"
              onPress={() => setDialog("dates")}
            />
            <Button label="Done" onPress={() => setDialog(null)} />
          </Sheet>
        )}
        {dialog === "dates" && (
          <Sheet title={t("activityPeriod")} close={() => setDialog(null)}>
            {(
              [
                ["today", "today"],
                ["7d", "lastSevenDays"],
                ["all", "allDates"],
              ] as const
            ).map(([value, label]) => (
              <Choice
                key={value}
                label={t(label)}
                selected={(period ?? "all") === value}
                onPress={() => {
                  setPeriod(value);
                  setDialog(null);
                }}
              />
            ))}
          </Sheet>
        )}
        <ActivityFeed key={JSON.stringify(criteria)} criteria={criteria} />
      </Screen>
    </Access>
  );
}
function ActivityFeed({ criteria }: { criteria: ActivityCriteria }) {
  const { colors } = useTheme();
  const snapshot = useBootstrap();
  const work = useFeatureWork();
  const query = usePages(
    "activity",
    criteria,
    async (page, signal) =>
      unwrap(
        await api.GET("/v1/audit", {
          params: { query: { ...criteria, page, per_page: 30 } },
          signal,
        }),
        pageSchema(auditSchema),
      ),
    !!snapshot.modules.activity,
    { refetchOnWindowFocus: false, refetchOnReconnect: false },
  );
  const notice = useActivityNotice(
    criteria,
    query.rows[0]?.id,
    !!snapshot.modules.activity && !query.isPending,
  );
  const refresh = () =>
    work.run(async (scope) => {
      await query.refetch();
      scope.assertCurrent();
      notice.clear();
    });
  return (
    <View style={{ flex: 1, gap: 0 }}>
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Label size="caption" tone="secondary" style={{ flex: 1 }}>
          {query.rows.length} events
        </Label>
        <ExportButton resource="audit" criteria={criteria} iconOnly />
        <IconButton
          label={t("checkActivity")}
          disabled={query.isPending || work.busy || notice.busy}
          onPress={() => void notice.check()}
        >
          <RefreshCw size={20} color={colors.brand.primary} />
        </IconButton>
      </View>
      {!!notice.error && (
        <ErrorState error={notice.error} retry={() => void notice.check()} />
      )}
      {!!work.error && (
        <ErrorState error={work.error} retry={() => void refresh()} />
      )}
      <Records
        rows={query.rows}
        pending={query.isPending}
        error={query.error}
        retry={() => void refresh()}
        refreshing={query.isRefetching}
        more={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        next={() => void query.fetchNextPage()}
        render={(event) => (
          <ActivityRow
            event={event}
            timezone={snapshot.appearance.timezone}
            onPress={() => router.push(`/activity/${event.id}`)}
          />
        )}
      />
      {!!notice.count && (
        <View
          testID="new-activity-notice"
          style={{
            position: "absolute",
            bottom: 24,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
          accessibilityLiveRegion="polite"
        >
          <Button
            label={t("newActivities")}
            loading={work.busy}
            onPress={() => void refresh()}
          />
        </View>
      )}
    </View>
  );
}
