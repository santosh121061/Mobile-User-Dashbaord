import { useState } from "react";
import { z } from "zod";
import { api, check, unwrap } from "@/api/client";
import { usePages, useRead } from "@/api/hooks";
import { envelope, idSchema, pageSchema } from "@/api/runtime";
import { useSession } from "@/auth/session";
import { Button, Card, Chip, ErrorState, Row, Screen } from "@/components/ui";
import { Records } from "@/components/records";
import { date, t } from "@/localization";
const nativeSchema = z.object({
    id: idSchema,
    name: z.string(),
    current: z.boolean(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
    expires_at: z.string().nullable(),
});
const browserSchema = z.object({
    id: z.string(),
    ip_address: z.string().nullable(),
    last_activity: z.number(),
});
export default function Sessions() {
    const session = useSession();
    const [browser, setBrowser] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const mobile = usePages(
        "mobile-sessions",
        null,
        async (page, signal) =>
            unwrap(
                await api.GET("/v1/profile/mobile-sessions", {
                    params: { query: { page } },
                    signal,
                }),
                pageSchema(nativeSchema),
            ),
        !browser,
    );
    const web = useRead(
        "web-sessions",
        null,
        async (signal) =>
            unwrap(
                await api.GET("/v1/profile/sessions", { signal }),
                envelope(z.array(browserSchema)),
            ).data,
        browser,
    );
    const revoke = async (id: string, current = false) => {
        setBusy(id);
        setError(null);
        try {
            check(
                browser
                    ? await api.DELETE("/v1/profile/sessions/{id}", {
                          params: { path: { id } },
                      })
                    : await api.DELETE("/v1/profile/mobile-sessions/{id}", {
                          params: { path: { id } },
                      }),
            );
            if (current) await session.logout();
            else if (browser) await web.refetch();
            else await mobile.refetch();
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(null);
        }
    };
    return (
        <Screen>
            <Card>
                <Chip
                    label={t("mobileSessions")}
                    selected={!browser}
                    onPress={() => setBrowser(false)}
                />
                <Chip
                    label={t("webSessions")}
                    selected={browser}
                    onPress={() => setBrowser(true)}
                />
            </Card>
            {!!error && <ErrorState error={error} />}{" "}
            {browser ? (
                <Records
                    rows={web.data ?? []}
                    pending={web.isPending}
                    error={web.error}
                    retry={() => void web.refetch()}
                    refreshing={web.isRefetching}
                    render={(row) => (
                        <Row
                            title={t("webSessions")}
                            subtitle={date(
                                new Date(
                                    row.last_activity * 1000,
                                ).toISOString(),
                            )}
                            trailing={
                                <Button
                                    variant="danger"
                                    label={t("revoke")}
                                    loading={busy === row.id}
                                    disabled={!!busy}
                                    onPress={() => void revoke(row.id)}
                                />
                            }
                        />
                    )}
                />
            ) : (
                <Records
                    rows={mobile.rows}
                    pending={mobile.isPending}
                    error={mobile.error}
                    retry={() => void mobile.refetch()}
                    refreshing={mobile.isRefetching}
                    more={mobile.hasNextPage}
                    loadingMore={mobile.isFetchingNextPage}
                    next={() => void mobile.fetchNextPage()}
                    render={(row) => (
                        <Row
                            title={row.current ? t("currentSession") : row.name}
                            subtitle={`${t("expires")}: ${date(row.expires_at)}`}
                            trailing={
                                <Button
                                    variant="danger"
                                    label={t("revoke")}
                                    disabled={!!busy}
                                    loading={busy === row.id}
                                    onPress={() =>
                                        void revoke(row.id, row.current)
                                    }
                                />
                            }
                        />
                    )}
                />
            )}
        </Screen>
    );
}
