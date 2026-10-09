import { router } from "expo-router";
import { api, ApiError, unwrap } from "@/api/client";
import { useRead, useSearch } from "@/api/hooks";
import { auditSchema, pageSchema, userSchema } from "@/api/runtime";
import { useBootstrap, useSession } from "@/auth/session";
import {
    Button,
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
    const snapshot = useBootstrap();
    const session = useSession();
    const work = useFeatureWork();
    const { search, setSearch, debounced } = useSearch();
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
        enabled && users,
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
        enabled && activity,
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
                    kind === "users"
                        ? "/(app)/(tabs)/users"
                        : "/(app)/(tabs)/activity",
                params: { search: debounced, account: snapshot.account.id },
            });
        });
    const resources = sources.map((source) => t(source.label)).join(", ");
    return (
        <Screen scroll>
            <FeaturePane wide>
                <Label size="h1">{t("search")}</Label>
                {resources ? (
                    <>
                        <Input
                            label={t("search")}
                            placeholder={t("searchResources", { resources })}
                            value={search}
                            onChangeText={setSearch}
                            maxLength={100}
                        />
                        {!enabled ? (
                            <Label accessibilityLiveRegion="polite">
                                {search.trim().length >= 3
                                    ? t("loading")
                                    : t("searchStart")}
                            </Label>
                        ) : (
                            <>
                                {users && (
                                    <Card>
                                        <Label size="title">{t("users")}</Label>
                                        {userQuery.isPending ? (
                                            <Loading />
                                        ) : userQuery.error ? (
                                            <ErrorState
                                                error={userQuery.error}
                                                retry={() =>
                                                    void userQuery.refetch()
                                                }
                                            />
                                        ) : (
                                            <>
                                                {!userQuery.data?.data
                                                    .length && (
                                                    <Label>{t("empty")}</Label>
                                                )}
                                                {userQuery.data?.data
                                                    .slice(0, 5)
                                                    .map((user) => (
                                                        <Row
                                                            key={user.id}
                                                            title={
                                                                user.name ??
                                                                user.public_id
                                                            }
                                                            subtitle={[
                                                                user.email,
                                                                user.status,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(" · ")}
                                                            onPress={() =>
                                                                void open(
                                                                    `/users/${user.id}`,
                                                                )
                                                            }
                                                        />
                                                    ))}
                                                <Button
                                                    label={
                                                        t("seeAll") +
                                                        ": " +
                                                        t("users")
                                                    }
                                                    variant="secondary"
                                                    disabled={work.busy}
                                                    onPress={() =>
                                                        void all("users")
                                                    }
                                                />
                                            </>
                                        )}
                                    </Card>
                                )}
                                {activity && (
                                    <Card>
                                        <Label size="title">
                                            {t("activity")}
                                        </Label>
                                        {activityQuery.isPending ? (
                                            <Loading />
                                        ) : activityQuery.error ? (
                                            <ErrorState
                                                error={activityQuery.error}
                                                retry={() =>
                                                    void activityQuery.refetch()
                                                }
                                            />
                                        ) : (
                                            <>
                                                {!activityQuery.data?.data
                                                    .length && (
                                                    <Label>{t("empty")}</Label>
                                                )}
                                                {activityQuery.data?.data
                                                    .slice(0, 5)
                                                    .map((event) => (
                                                        <Row
                                                            key={event.id}
                                                            title={event.action}
                                                            subtitle={[
                                                                event.actor
                                                                    .name,
                                                                event.outcome,
                                                                date(
                                                                    event.created_at,
                                                                    snapshot
                                                                        .appearance
                                                                        .timezone,
                                                                ),
                                                            ]
                                                                .filter(Boolean)
                                                                .join(" · ")}
                                                            onPress={() =>
                                                                void open(
                                                                    `/activity/${event.id}`,
                                                                )
                                                            }
                                                        />
                                                    ))}
                                                <Button
                                                    label={
                                                        t("seeAll") +
                                                        ": " +
                                                        t("activity")
                                                    }
                                                    variant="secondary"
                                                    disabled={work.busy}
                                                    onPress={() =>
                                                        void all("activity")
                                                    }
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
