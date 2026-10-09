import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useBootstrap } from "@/auth/session";
import { queryClient, queryKey } from "@/api/query";
import { ApiError } from "@/api/client";
import {
    Button,
    Card,
    ErrorState,
    Label,
    Loading,
    Row,
    Screen,
} from "@/components/ui";
import { ExportButton } from "@/features/exports";
import { FeaturePane } from "@/features/feature-pane";
import { useSessionOperations } from "@/features/session-operations";
import { useOperation } from "@/features/use-operation";
import { useFeatureWork } from "@/features/use-feature-work";
import {
    exportResourceAllowed,
    permittedExportResources,
} from "@/modules/registry";
import { number, t } from "@/localization";
import { useTheme } from "@/theme";

export default function Reports() {
    const snapshot = useBootstrap();
    return (
        <ReportHub
            key={[
                snapshot.account.id,
                snapshot.access_revision,
                snapshot.configuration_revision,
            ].join(":")}
        />
    );
}
function ReportHub() {
    const snapshot = useBootstrap();
    const resources = permittedExportResources(snapshot);
    const work = useFeatureWork();
    const operations = useSessionOperations().filter((entry) =>
        entry.source === "bulk"
            ? snapshot.modules.users &&
              snapshot.actions["users.bulk"] &&
              snapshot.features["users.bulk.enabled"]
            : exportResourceAllowed(entry.source, snapshot),
    );
    const refresh = () =>
        work.run(async (scope) => {
            await Promise.all(
                operations.map((entry) =>
                    queryClient.invalidateQueries({
                        queryKey: queryKey(snapshot, "operation", entry.id),
                        exact: true,
                    }),
                ),
            );
            scope.assertCurrent();
        });
    if (!resources.length)
        return (
            <Screen>
                <ErrorState error={new ApiError(403, {}, null)} />
            </Screen>
        );
    return (
        <Screen scroll refreshing={work.busy} onRefresh={() => void refresh()}>
            <FeaturePane wide>
                <Label accessibilityRole="header" size="h1">
                    {t("reports")}
                </Label>
                {resources.map((resource) => (
                    <Card key={resource.resource}>
                        <Label accessibilityRole="header" size="title">
                            {t(resource.label)}
                        </Label>
                        <ExportButton resource={resource.resource} />
                    </Card>
                ))}
                <Label accessibilityRole="header" size="title">
                    {t("sessionOperations")}
                </Label>
                <Label size="caption" tone="secondary">
                    {t("sessionOperationsHint")}
                </Label>
                {!operations.length ? (
                    <Card style={{ alignItems: "center" }}>
                        <Label tone="secondary" style={{ textAlign: "center" }}>
                            {t("noSessionOperations")}
                        </Label>
                    </Card>
                ) : (
                    <>
                        <Button
                            label={t("exportLinkRefresh")}
                            variant="secondary"
                            loading={work.busy}
                            onPress={() => void refresh()}
                        />
                        {operations.map((entry) => (
                            <OperationSummary key={entry.id} id={entry.id} />
                        ))}
                    </>
                )}
                {!!work.error && (
                    <ErrorState
                        error={work.error}
                        retry={() => void refresh()}
                    />
                )}
            </FeaturePane>
        </Screen>
    );
}
function OperationSummary({ id }: { id: string }) {
    const query = useOperation(id, false);
    const { colors } = useTheme();
    if (query.isPending)
        return (
            <Card>
                <Loading />
            </Card>
        );
    if (query.error)
        return (
            <Card>
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            </Card>
        );
    if (!query.data) return null;
    const processed = Math.min(
        query.data.total,
        Math.max(0, query.data.updated_count + query.data.skipped_count),
    );
    return (
        <Card>
            <Row
                title={
                    t(query.data.kind === "bulk" ? "bulk" : "reports") +
                    ": " +
                    t(query.data.status)
                }
                subtitle={
                    number(query.data.updated_count) +
                    " / " +
                    number(query.data.total)
                }
                onPress={() => router.push(`/operations/${id}`)}
                trailing={
                    query.data.kind === "export" &&
                    ["queued", "running"].includes(query.data.status) ? (
                        <ActivityIndicator
                            color={colors.brand.primary}
                            accessibilityLabel={t(query.data.status)}
                        />
                    ) : undefined
                }
            />
            {query.data.kind === "bulk" &&
                query.data.total > 0 &&
                ["queued", "running"].includes(query.data.status) && (
                    <View
                        accessibilityRole="progressbar"
                        accessibilityLabel={t(
                            query.data.kind === "bulk" ? "bulk" : "reports",
                        )}
                        accessibilityValue={{
                            min: 0,
                            max: query.data.total,
                            now: processed,
                        }}
                        style={{
                            height: 8,
                            borderRadius: 9999,
                            overflow: "hidden",
                            backgroundColor: colors.surfaceMuted,
                        }}
                    >
                        <View
                            style={{
                                height: 8,
                                borderRadius: 9999,
                                backgroundColor: colors.brand.primary,
                                width: `${(processed / query.data.total) * 100}%`,
                            }}
                        />
                    </View>
                )}
            {query.data.message && (
                <Label
                    accessibilityRole={
                        query.data.status === "failed" ? "alert" : undefined
                    }
                >
                    {query.data.message}
                </Label>
            )}
        </Card>
    );
}
