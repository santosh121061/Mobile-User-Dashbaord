import { Search as SearchIcon, Users, History } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { useTitle } from "@/components/forms";
import { userStatusLabel } from "@/features/user-status";
import { router } from "expo-router";
import { api, ApiError, unwrap } from "@/api/client";
import { useRead, useSearch } from "@/api/hooks";
import { auditSchema, pageSchema, userSchema } from "@/api/runtime";
import { useBootstrap, useSession } from "@/auth/session";
import {
  Button,
  Chip,
  Card,
  ErrorState,
  Input,
  Label,
  Loading,
  Row,
  Screen,
} from "@/components/ui";
import { FeaturePane } from "@/features/feature-pane";
import { useFeatureWork } from "@/features/use-feature-work";
import { date, t } from "@/localization";
import { searchableResources } from "@/modules/registry";

export default function Search() {
  useTitle(t("search"));
  const snapshot = useBootstrap();
  return (
    <SearchResults
      key={[
        snapshot.account.id,
        snapshot.access_revision,
        snapshot.configuration_revision,
      ].join(":")}
    />
  );
}
function SearchResults() {
  const { colors } = useTheme();
  const snapshot = useBootstrap();
  const session = useSession();
  const work = useFeatureWork();
  const { search, setSearch, debounced } = useSearch();
  const [scope, setScope] = useState<"all" | "users" | "activity">("all");
  const enabled = debounced.length >= 3 && search.trim() === debounced;
  const sources = searchableResources(snapshot);
  const users = sources.some((source) => source.resource === "users");
  const activity = sources.some((source) => source.resource === "audit");
  const userQuery = useRead(
    "search-users",
    debounced,
    async (signal) =>
      unwrap(
        await api.GET("/v1/users", {
          params: {
            query: { search: debounced, page: 1, per_page: 5 },
          },
          signal,
        }),
        pageSchema(userSchema),
      ),
    enabled && users && scope !== "activity",
  );
  const activityQuery = useRead(
    "search-activity",
    debounced,
    async (signal) =>
      unwrap(
        await api.GET("/v1/audit", {
          params: {
            query: { search: debounced, page: 1, per_page: 5 },
          },
          signal,
        }),
        pageSchema(auditSchema),
      ),
    enabled && activity && scope !== "users",
  );
  const open = (path: `/users/${string}` | `/activity/${string}`) =>
    work.run(async (scope) => {
      await session.refresh();
      scope.assertCurrent();
      router.push(path);
    });
  const all = (kind: "users" | "activity") =>
    work.run(async (scope) => {
      await session.refresh();
      scope.assertCurrent();
      router.navigate({
        pathname:
          kind === "users" ? "/(app)/(tabs)/users" : "/(app)/(tabs)/activity",
        params: { search: debounced, account: snapshot.account.id },
      });
    });
  const resources = sources.map((source) => t(source.label)).join(", ");
  return (
    <Screen scroll>
      <FeaturePane wide>
        {resources ? (
          <>
            <Input
              label={t("search")}
              hideLabel
              leading={<SearchIcon size={18} color={colors.text.secondary} />}
              placeholder="Search your workspace"
              value={search}
              onChangeText={setSearch}
              maxLength={100}
            />
            <View style={{ flexDirection: "row" }}>
              <Chip
                label={t("all")}
                selected={scope === "all"}
                onPress={() => setScope("all")}
              />
              {users && (
                <Chip
                  label="People"
                  selected={scope === "users"}
                  onPress={() => setScope("users")}
                />
              )}
              {activity && (
                <Chip
                  label={t("activity")}
                  selected={scope === "activity"}
                  onPress={() => setScope("activity")}
                />
              )}
            </View>
            {!enabled ? (
              <>
                <Label
                  size="secondary"
                  tone="secondary"
                  accessibilityLiveRegion="polite"
                >
                  {search.trim().length >= 3 ? t("loading") : t("searchStart")}
                </Label>
                <Label size="title" style={{ marginTop: 14 }}>
                  Browse
                </Label>
                {users && scope !== "activity" && (
                  <Row
                    title={t("users")}
                    subtitle="Find a person by name or email"
                    leading={<Users size={24} color={colors.brand.primary} />}
                    onPress={() => router.push("/(app)/(tabs)/users")}
                  />
                )}
                {activity && scope !== "users" && (
                  <Row
                    title={t("activity")}
                    subtitle="Find a workspace event"
                    leading={<History size={24} color={colors.brand.primary} />}
                    onPress={() => router.push("/(app)/(tabs)/activity")}
                  />
                )}
              </>
            ) : (
              <>
                {users && scope !== "activity" && (
                  <Card>
                    <Label size="title">{t("users")}</Label>
                    {userQuery.isPending ? (
                      <Loading />
                    ) : userQuery.error ? (
                      <ErrorState
                        error={userQuery.error}
                        retry={() => void userQuery.refetch()}
                      />
                    ) : (
                      <>
                        {!userQuery.data?.data.length && (
                          <Label>{t("empty")}</Label>
                        )}
                        {userQuery.data?.data.slice(0, 5).map((user) => (
                          <Row
                            key={user.id}
                            title={user.name ?? user.public_id}
                            subtitle={[user.email, userStatusLabel(user)]
                              .filter(Boolean)
                              .join(" · ")}
                            onPress={() => void open(`/users/${user.id}`)}
                          />
                        ))}
                        <Button
                          label={t("seeAll") + ": " + t("users")}
                          variant="secondary"
                          disabled={work.busy}
                          onPress={() => void all("users")}
                        />
                      </>
                    )}
                  </Card>
                )}
                {activity && scope !== "users" && (
                  <Card>
                    <Label size="title">{t("activity")}</Label>
                    {activityQuery.isPending ? (
                      <Loading />
                    ) : activityQuery.error ? (
                      <ErrorState
                        error={activityQuery.error}
                        retry={() => void activityQuery.refetch()}
                      />
                    ) : (
                      <>
                        {!activityQuery.data?.data.length && (
                          <Label>{t("empty")}</Label>
                        )}
                        {activityQuery.data?.data.slice(0, 5).map((event) => (
                          <Row
                            key={event.id}
                            title={event.action}
                            subtitle={[
                              event.actor.name,
                              event.outcome,
                              date(
                                event.created_at,
                                snapshot.appearance.timezone,
                              ),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            onPress={() => void open(`/activity/${event.id}`)}
                          />
                        ))}
                        <Button
                          label={t("seeAll") + ": " + t("activity")}
                          variant="secondary"
                          disabled={work.busy}
                          onPress={() => void all("activity")}
                        />
                      </>
                    )}
                  </Card>
                )}
              </>
            )}
          </>
        ) : (
          <ErrorState error={new ApiError(403, {}, null)} />
        )}
        {!!work.error && <ErrorState error={work.error} />}
      </FeaturePane>
    </Screen>
  );
}
