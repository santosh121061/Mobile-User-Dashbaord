import { useLocalSearchParams } from "expo-router";
import { useRead } from "@/api/hooks";
import { api, unwrap } from "@/api/client";
import { envelope, auditSchema } from "@/api/runtime";
import { useBootstrap } from "@/auth/session";
import { Access } from "@/components/access";
import { Card, ErrorState, Label, Loading, Screen } from "@/components/ui";
import { date, t } from "@/localization";
export default function AuditDetail() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const snapshot = useBootstrap();
    const query = useRead(
        "audit-detail",
        id,
        async (signal) =>
            unwrap(
                await api.GET("/v1/mobile/audit/{id}", {
                    params: { path: { id } },
                    signal,
                }),
                envelope(auditSchema),
            ).data,
        !!snapshot.modules.activity,
    );
    return (
        <Access module="activity">
            <Screen scroll>
                {query.isPending ? (
                    <Loading />
                ) : query.error ? (
                    <ErrorState
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
                ) : (
                    query.data && (
                        <Card>
                            <Label size="title">{query.data.action}</Label>
                            <Label>{query.data.actor.name ?? "-"}</Label>
                            <Label>{query.data.outcome}</Label>
                            <Label>
                                {date(
                                    query.data.created_at,
                                    snapshot.appearance.timezone,
                                )}
                            </Label>
                            {query.data.request_id && (
                                <Label size="caption">
                                    {t("supportId")}: {query.data.request_id}
                                </Label>
                            )}
                            {query.data.changes &&
                                Object.entries(query.data.changes).map(
                                    ([key, value]) => (
                                        <Card key={key}>
                                            <Label size="caption">{key}</Label>
                                            <Label>
                                                {JSON.stringify(value)}
                                            </Label>
                                        </Card>
                                    ),
                                )}
                        </Card>
                    )
                )}
            </Screen>
        </Access>
    );
}
