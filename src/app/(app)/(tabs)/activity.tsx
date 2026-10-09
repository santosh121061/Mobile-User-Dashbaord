import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Search } from "lucide-react-native";
import { useTheme } from "@/theme";
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
    };
    return (
        <Access module="activity">
            <Screen>
                <Label size="h1">{t("activity")}</Label>
                <Input
                    label={t("search")}
                    hideLabel
                    leading={<Search size={20} color={colors.text.tertiary} />}
                    placeholder={t("activitySearch")}
                    value={search}
                    onChangeText={setSearch}
                    maxLength={100}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {(["", "success", "denied", "failed"] as State[]).map(
                        (value) => (
                            <Chip
                                key={value}
                                label={t(value || "all")}
                                selected={state === value}
                                onPress={() => setState(value)}
                            />
                        ),
                    )}
                </View>
                <ActivityFeed
                    key={JSON.stringify(criteria)}
                    criteria={criteria}
                />
            </Screen>
        </Access>
    );
}
function ActivityFeed({ criteria }: { criteria: ActivityCriteria }) {
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
        <View style={{ flex: 1, gap: 12 }}>
            <ExportButton resource="audit" criteria={criteria} />
            <Button
                label={t("checkActivity")}
                variant="secondary"
                loading={notice.busy}
                disabled={query.isPending || work.busy}
                onPress={() => void notice.check()}
            />
            {!!notice.error && (
                <ErrorState
                    error={notice.error}
                    retry={() => void notice.check()}
                />
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
