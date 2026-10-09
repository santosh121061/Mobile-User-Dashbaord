import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { targetSchema } from "@/api/contracts";
import { useBootstrap } from "@/auth/session";
import { useFeatureConfirmation } from "@/features/use-feature-confirmation";
import {
    Button,
    Card,
    ErrorState,
    Label,
    Loading,
    Screen,
} from "@/components/ui";
import { Access } from "@/components/access";
import { date, t, type StringKey } from "@/localization";
import { useTitle } from "@/components/forms";
import { useFeatureWork } from "@/features/use-feature-work";
import { AvatarView } from "@/features/avatar";
import { AdminAvatar } from "@/features/admin-avatar";
import { OwnerGovernance } from "@/features/owner-governance";
import { FeaturePane } from "@/features/feature-pane";
export default function UserDetail() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const snapshot = useBootstrap();
    const { colors } = useTheme();
    const [section, setSection] = useState<"overview" | "roles">("overview");
    const confirm = useFeatureConfirmation();
    useTitle(t("detail"));
    const work = useFeatureWork();
    const { busy, error } = work;
    const query = useRead(
        "user",
        id,
        async (signal) =>
            unwrap(
                await api.GET("/v1/mobile/users/{user}/context", {
                    params: { path: { user: Number(id) } },
                    signal,
                }),
                envelope(targetSchema),
            ).data,
        !!snapshot.modules.users,
    );
    const run = async (
        action:
            "status" | "archive" | "restore" | "delete" | "sessions" | "reset",
    ) =>
        work.run(async (scope) => {
            await confirm(
                scope,
                "POST",
                `/api/v1/users/${id}/actions/${action}`,
                async (approval, signal) =>
                    check(
                        await api.POST("/v1/users/{user}/actions/{action}", {
                            params: { path: { user: Number(id), action } },
                            headers: { "X-Mobile-Step-Up": approval },
                            signal,
                        }),
                    ),
            );
            scope.assertCurrent();
            if (action === "delete") router.back();
            else await query.refetch();
        });
    const actionLabels: Record<string, StringKey> = {
        status: "statusAction",
        archive: "archive",
        restore: "restore",
        delete: "delete",
        sessions: "revokeSessions",
        reset: "reset",
    };
    return (
        <Access module="users">
            <Screen scroll>
                <FeaturePane wide>
                    {query.isPending ? (
                        <Loading />
                    ) : query.error ? (
                        <ErrorState
                            error={query.error}
                            retry={() => void query.refetch()}
                        />
                    ) : (
                        query.data && (
                            <>
                                <Card>
                                    <View
                                        style={{ alignItems: "center", gap: 8 }}
                                    >
                                        <AvatarView
                                            size={56}
                                            available={
                                                query.data.avatar_available &&
                                                !!snapshot.fields.name?.view
                                            }
                                            userId={id}
                                            version={query.dataUpdatedAt}
                                            name={
                                                query.data.user.name ??
                                                query.data.user.public_id
                                            }
                                        />
                                        <Label
                                            size="title"
                                            style={{
                                                textAlign: "center",
                                                fontFamily: "Inter_600SemiBold",
                                            }}
                                        >
                                            {query.data.user.name ??
                                                query.data.user.public_id}
                                        </Label>
                                        <Label
                                            size="caption"
                                            tone="secondary"
                                            style={{ textAlign: "center" }}
                                        >
                                            {[
                                                query.data.user.roles
                                                    ?.map((role) => role.name)
                                                    .join(", "),
                                                query.data.user.archived
                                                    ? t("archived")
                                                    : query.data.user.status &&
                                                      t(query.data.user.status),
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </Label>
                                    </View>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            borderBottomWidth: 1,
                                            borderColor: colors.divider,
                                        }}
                                    >
                                        {(
                                            [
                                                "overview",
                                                ...(snapshot.fields.roles
                                                    ?.view &&
                                                query.data.user.roles !==
                                                    undefined
                                                    ? ["roles"]
                                                    : []),
                                            ] as ("overview" | "roles")[]
                                        ).map((value) => (
                                            <Pressable
                                                key={value}
                                                accessibilityRole="tab"
                                                accessibilityLabel={t(
                                                    value === "roles"
                                                        ? "userRoles"
                                                        : "overview",
                                                )}
                                                accessibilityState={{
                                                    selected:
                                                        (section === "roles" &&
                                                        snapshot.fields.roles
                                                            ?.view
                                                            ? "roles"
                                                            : "overview") ===
                                                        value,
                                                }}
                                                onPress={() =>
                                                    setSection(value)
                                                }
                                                style={{
                                                    flex: 1,
                                                    minHeight: 48,
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    borderBottomWidth:
                                                        section === value
                                                            ? 2
                                                            : 0,
                                                    borderColor:
                                                        colors.brand.primary,
                                                }}
                                            >
                                                <Label
                                                    size="bodyMedium"
                                                    style={{
                                                        color:
                                                            section === value
                                                                ? colors.brand
                                                                      .primary
                                                                : colors.text
                                                                      .secondary,
                                                    }}
                                                >
                                                    {t(
                                                        value === "roles"
                                                            ? "userRoles"
                                                            : "overview",
                                                    )}
                                                </Label>
                                            </Pressable>
                                        ))}
                                    </View>
                                    {section === "roles" &&
                                    snapshot.fields.roles?.view &&
                                    query.data.user.roles !== undefined ? (
                                        <View style={{ gap: 12 }}>
                                            {query.data.user.roles.length ? (
                                                query.data.user.roles.map(
                                                    (role) => (
                                                        <Label key={role.id}>
                                                            {role.name}
                                                        </Label>
                                                    ),
                                                )
                                            ) : (
                                                <Label tone="secondary">
                                                    {t("empty")}
                                                </Label>
                                            )}
                                        </View>
                                    ) : (
                                        <>
                                            {Object.entries(snapshot.fields)
                                                .filter(
                                                    ([key, rule]) =>
                                                        rule.view &&
                                                        key !== "name" &&
                                                        query.data!.user[
                                                            key as keyof typeof query.data.user
                                                        ] !== undefined,
                                                )
                                                .map(([key, rule]) => (
                                                    <ViewField
                                                        key={key}
                                                        label={rule.label}
                                                        value={
                                                            key === "roles"
                                                                ? query
                                                                      .data!.user.roles?.map(
                                                                          (
                                                                              role,
                                                                          ) =>
                                                                              role.name,
                                                                      )
                                                                      .join(
                                                                          ", ",
                                                                      )
                                                                : key ===
                                                                    "created_at"
                                                                  ? date(
                                                                        query
                                                                            .data!
                                                                            .user
                                                                            .created_at,
                                                                        snapshot
                                                                            .appearance
                                                                            .timezone,
                                                                    )
                                                                  : String(
                                                                        query
                                                                            .data!
                                                                            .user[
                                                                            key as keyof typeof query.data.user
                                                                        ] ??
                                                                            "-",
                                                                    )
                                                        }
                                                    />
                                                ))}
                                            {query.data.user.archived && (
                                                <Label>{t("archived")}</Label>
                                            )}
                                            <AdminAvatar
                                                key={
                                                    snapshot.account.id +
                                                    ":" +
                                                    id
                                                }
                                                id={id}
                                                available={
                                                    query.data.avatar_available
                                                }
                                                permitted={
                                                    !!query.data.actions
                                                        .update &&
                                                    !!snapshot.fields.name?.edit
                                                }
                                                refresh={() => query.refetch()}
                                            />
                                        </>
                                    )}
                                </Card>
                                <OwnerGovernance
                                    id={id}
                                    data={query.data}
                                    refresh={() => query.refetch()}
                                />
                                <Card>
                                    {query.data.actions.update && (
                                        <Button
                                            label={t("editUser")}
                                            disabled={busy}
                                            onPress={() =>
                                                router.push(`/users/${id}/edit`)
                                            }
                                        />
                                    )}
                                    {query.data.actions.access && (
                                        <Button
                                            variant="secondary"
                                            label={t("access")}
                                            disabled={busy}
                                            onPress={() =>
                                                router.push(
                                                    `/users/${id}/access`,
                                                )
                                            }
                                        />
                                    )}
                                    {Object.entries(actionLabels)
                                        .filter(
                                            ([action]) =>
                                                query.data!.actions[action],
                                        )
                                        .map(([action, label]) => (
                                            <Button
                                                key={action}
                                                label={t(label)}
                                                variant={
                                                    [
                                                        "status",
                                                        "archive",
                                                        "delete",
                                                        "sessions",
                                                    ].includes(action)
                                                        ? "danger"
                                                        : "secondary"
                                                }
                                                disabled={busy}
                                                onPress={() =>
                                                    void run(
                                                        action as Parameters<
                                                            typeof run
                                                        >[0],
                                                    )
                                                }
                                            />
                                        ))}
                                    <Label size="caption" tone="secondary">
                                        {t("protectedOwner")}
                                    </Label>
                                    {Object.entries(query.data.action_reasons)
                                        .filter(
                                            ([action]) =>
                                                !!actionLabels[action] &&
                                                !!snapshot.actions[
                                                    "users." + action
                                                ],
                                        )
                                        .map(([action, reason]) => (
                                            <Label
                                                key={action}
                                                size="caption"
                                                tone="secondary"
                                            >
                                                {t(actionLabels[action]!)}:
                                                {reason}
                                            </Label>
                                        ))}
                                </Card>
                            </>
                        )
                    )}
                    {!!error && <ErrorState error={error} />}
                </FeaturePane>
            </Screen>
        </Access>
    );
}
function ViewField({
    label,
    value,
}: {
    label: string;
    value: string | undefined;
}) {
    return (
        <>
            <Label size="caption" tone="secondary">
                {label}
            </Label>
            <Label>{value ?? "-"}</Label>
        </>
    );
}
