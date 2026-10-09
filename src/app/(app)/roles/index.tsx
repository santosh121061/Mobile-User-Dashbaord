import { router } from "expo-router";
import { z } from "zod";
import { useBootstrap } from "@/auth/session";
import { useRead, useSearch } from "@/api/hooks";
import { api, unwrap } from "@/api/client";
import { envelope } from "@/api/runtime";
import { roleListSchema } from "@/api/contracts";
import { Access } from "@/components/access";
import { Button, Input, Label, Row, Screen } from "@/components/ui";
import { Records } from "@/components/records";
import { ExportButton } from "@/features/exports";
import { t } from "@/localization";
export default function Roles() {
    const snapshot = useBootstrap();
    const { search, setSearch, debounced } = useSearch();
    const query = useRead(
        "roles",
        null,
        async (signal) =>
            unwrap(
                await api.GET("/v1/roles", { signal }),
                envelope(z.array(roleListSchema)),
            ).data,
        !!snapshot.modules.roles,
    );
    return (
        <Access module="roles">
            <Screen>
                <Label size="h1">{t("roles")}</Label>
                {snapshot.actions["roles.manage"] && (
                    <Button
                        label={t("addRole")}
                        onPress={() => router.push("/roles/new")}
                    />
                )}
                <ExportButton resource="roles" />
                <Input
                    label={t("search")}
                    placeholder={t("rolesSearch")}
                    value={search}
                    onChangeText={setSearch}
                    maxLength={100}
                />
                <Records
                    rows={(query.data ?? []).filter(
                        (role) =>
                            !debounced ||
                            [
                                role.name,
                                ...(role.permissions?.map(
                                    (permission) => permission.name,
                                ) ?? []),
                            ].some((value) =>
                                value
                                    .toLocaleLowerCase()
                                    .includes(debounced.toLocaleLowerCase()),
                            ),
                    )}
                    pending={query.isPending}
                    error={query.error}
                    retry={() => void query.refetch()}
                    refreshing={query.isRefetching}
                    render={(role) => (
                        <Row
                            title={role.name}
                            subtitle={role.permissions
                                ?.map((item) => item.name)
                                .join(", ")}
                            onPress={() => router.push(`/roles/${role.id}`)}
                        />
                    )}
                />
            </Screen>
        </Access>
    );
}
