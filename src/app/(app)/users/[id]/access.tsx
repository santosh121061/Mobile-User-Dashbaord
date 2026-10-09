import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api, ApiError, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { accessSchema } from "@/api/contracts";
import { useBootstrap } from "@/auth/session";
import { useFeatureConfirmation } from "@/features/use-feature-confirmation";
import { useDiscard, useTitle } from "@/components/forms";
import {
    Button,
    Card,
    ErrorState,
    Input,
    Label,
    Loading,
    Screen,
} from "@/components/ui";
import { Access } from "@/components/access";
import { t } from "@/localization";
import { EffectiveAccess } from "@/features/effective-access";
import { useFeatureWork } from "@/features/use-feature-work";
import { Choice as Chip } from "@/features/choice";
import { FeaturePane } from "@/features/feature-pane";
type Effect = "inherit" | "allow" | "deny";
type Fields = Record<string, { view: Effect; edit: Effect }>;
export default function UserAccess() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const snapshot = useBootstrap();
    useTitle(t("access"));
    const query = useRead(
        "access",
        id,
        async (signal) =>
            unwrap(
                await api.GET("/v1/mobile/users/{user}/access", {
                    params: { path: { user: Number(id) } },
                    signal,
                }),
                envelope(accessSchema),
            ).data,
        !!snapshot.modules.users && !!snapshot.actions["access.manage"],
    );
    if (!snapshot.actions["access.manage"])
        return (
            <Screen>
                <ErrorState error={new ApiError(403, {}, null)} />
            </Screen>
        );
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
                            <AccessEditor
                                key={snapshot.account.id + ":" + id}
                                id={id}
                                data={query.data}
                                refresh={() => query.refetch()}
                            />
                        )
                    )}
                </FeaturePane>
            </Screen>
        </Access>
    );
}
function accessDefaults(
    data: z.infer<typeof accessSchema>,
    delegation: boolean,
) {
    const effectMap: Record<string, Effect> = {};
    const scopeMap: Record<string, string> = {};
    const fieldMap: Fields = {};
    for (const key of Object.keys(data.catalog)) {
        effectMap[key] = delegation
            ? data.delegation?.rules.some((rule) => rule.name === key)
                ? "allow"
                : "deny"
            : (data.effects[key] ?? "inherit");
        scopeMap[key] = delegation
            ? (data.delegation?.rules.find((rule) => rule.name === key)
                  ?.scope ?? "self")
            : (data.scopes[key] ?? "inherit");
    }
    for (const key of Object.keys(data.field_catalog)) {
        const source = (
            delegation ? data.delegation?.fields : data.fields
        )?.find((rule) => rule.field === key);
        const mode = (value: boolean | null | undefined): Effect =>
            value == null
                ? delegation
                    ? "deny"
                    : "inherit"
                : value
                  ? "allow"
                  : "deny";
        fieldMap[key] = {
            view: mode(source?.can_view),
            edit: mode(source?.can_edit),
        };
    }
    return {
        effects: effectMap,
        scopes: scopeMap,
        fields: fieldMap,
        assigned: data.assigned_ids.join(", "),
    };
}
function AccessEditor({
    id,
    data,
    refresh,
}: {
    id: string;
    data: z.infer<typeof accessSchema>;
    refresh: () => Promise<unknown>;
}) {
    const confirm = useFeatureConfirmation();
    const work = useFeatureWork();
    const initial = accessDefaults(data, false);
    const [effects, setEffects] = useState(initial.effects);
    const [scopes, setScopes] = useState(initial.scopes);
    const [fields, setFields] = useState(initial.fields);
    const [assigned, setAssigned] = useState(initial.assigned);
    const [delegation, setDelegation] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [editedRevision, setEditedRevision] = useState(data.revision);
    const { busy, error } = work;
    useDiscard(dirty);
    const [source, setSource] = useState(data);
    if (source !== data) {
        setSource(data);
        if (!dirty) {
            const next = accessDefaults(data, delegation);
            setEffects(next.effects);
            setScopes(next.scopes);
            setFields(next.fields);
            setAssigned(next.assigned);
        }
    }
    const selectMode = (next: boolean) => {
        if (dirty || busy) return;
        const values = accessDefaults(data, next);
        setEffects(values.effects);
        setScopes(values.scopes);
        setFields(values.fields);
        setAssigned(values.assigned);
        setDelegation(next);
    };
    const save = () =>
        work.run(async (scope) => {
            if (delegation) {
                const body = {
                    grants: Object.keys(data.catalog).filter(
                        (key) => effects[key] === "allow",
                    ),
                    scopes,
                    fields: Object.fromEntries(
                        Object.entries(fields).map(([key, rule]) => [
                            key,
                            {
                                view: rule.view === "allow",
                                edit: rule.edit === "allow",
                            },
                        ]),
                    ),
                };
                await confirm(
                    scope,
                    "PUT",
                    `/api/v1/users/${id}/delegation`,
                    async (approval, signal) =>
                        check(
                            await api.PUT("/v1/users/{user}/delegation", {
                                params: { path: { user: Number(id) } },
                                body,
                                headers: { "X-Mobile-Step-Up": approval },
                                signal,
                            }),
                        ),
                );
            } else {
                const ids = assigned.trim()
                    ? assigned.split(",").map((value) => Number(value.trim()))
                    : [];
                if (
                    ids.some(
                        (value) => !Number.isSafeInteger(value) || value < 1,
                    ) ||
                    new Set(ids).size !== ids.length
                )
                    throw new Error("Invalid assignments");
                const body = { effects, scopes, fields, assigned_ids: ids };
                await confirm(
                    scope,
                    "PUT",
                    `/api/v1/users/${id}/access`,
                    async (approval, signal) =>
                        check(
                            await api.PUT("/v1/users/{user}/access", {
                                params: { path: { user: Number(id) } },
                                body,
                                headers: { "X-Mobile-Step-Up": approval },
                                signal,
                            }),
                        ),
                );
            }
            scope.assertCurrent();
            setDirty(false);
            setEditedRevision(data.revision);
            await refresh();
        });
    return (
        <>
            <EffectiveAccess value={data.effective} />
            {dirty && editedRevision !== data.revision && (
                <Label accessibilityLiveRegion="polite">
                    {t("editChanged")}
                </Label>
            )}
            {data.delegation && (
                <View style={{ flexDirection: "row" }}>
                    <Chip
                        label={t("access")}
                        selected={!delegation}
                        disabled={busy || dirty}
                        onPress={() => {
                            selectMode(false);
                        }}
                    />
                    <Chip
                        label={t("delegation")}
                        selected={delegation}
                        disabled={busy || dirty}
                        onPress={() => {
                            selectMode(true);
                        }}
                    />
                </View>
            )}
            <Label size="title">{t("permissions")}</Label>
            <Label size="caption" tone="secondary">
                {t("delegationHint")}
            </Label>
            {Object.entries(data.catalog).map(([key, label]) => (
                <Card key={key}>
                    <Label size="bodyMedium">{label}</Label>
                    <View
                        style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                        }}
                    >
                        {(delegation
                            ? ["allow", "deny"]
                            : (["inherit", "allow", "deny"] as Effect[])
                        ).map((value) => (
                            <Chip
                                key={value}
                                label={t(value as Effect)}
                                selected={effects[key] === value}
                                disabled={
                                    busy ||
                                    (value === "allow" &&
                                        !data.delegatable[key]?.length)
                                }
                                hint={
                                    value === "allow" &&
                                    !data.delegatable[key]?.length
                                        ? t("noDelegation")
                                        : undefined
                                }
                                onPress={() => {
                                    if (
                                        busy ||
                                        (value === "allow" &&
                                            !data.delegatable[key]?.length)
                                    )
                                        return;
                                    setEffects((old) => ({
                                        ...old,
                                        [key]: value as Effect,
                                    }));
                                    setDirty(true);
                                }}
                            />
                        ))}
                    </View>
                    <View
                        style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                        }}
                    >
                        {(delegation
                            ? ["self", "all"]
                            : ["inherit", ...(data.delegatable[key] ?? [])]
                        )
                            .filter(
                                (scope) =>
                                    !delegation ||
                                    scope === "self" ||
                                    data.delegatable[key]?.includes(scope),
                            )
                            .map((scope) => (
                                <Chip
                                    key={scope}
                                    label={t(
                                        scope === "all"
                                            ? "allScope"
                                            : scope === "created"
                                              ? "createdScope"
                                              : (scope as
                                                    | "inherit"
                                                    | "self"
                                                    | "assigned"),
                                    )}
                                    selected={scopes[key] === scope}
                                    disabled={busy}
                                    onPress={() => {
                                        if (busy) return;
                                        setScopes((old) => ({
                                            ...old,
                                            [key]: scope,
                                        }));
                                        setDirty(true);
                                    }}
                                />
                            ))}
                    </View>
                    <Label size="caption" tone="secondary">
                        {data.delegatable[key]?.join(", ") || t("noDelegation")}
                    </Label>
                </Card>
            ))}
            <Label size="title">{t("fields")}</Label>
            {Object.entries(data.field_catalog).map(([key, label]) => (
                <Card key={key}>
                    <Label>{label}</Label>
                    {(["view", "edit"] as const).map((mode) => (
                        <View key={mode}>
                            <Label size="caption">{t(mode)}</Label>
                            <View
                                testID={`access-field-${key}-${mode}-choices`}
                                style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                }}
                            >
                                {(delegation
                                    ? ["allow", "deny"]
                                    : ["inherit", "allow", "deny"]
                                ).map((value) => (
                                    <Chip
                                        key={value}
                                        label={t(value as Effect)}
                                        selected={fields[key]?.[mode] === value}
                                        disabled={
                                            busy ||
                                            (value === "allow" &&
                                                !data.field_delegatable[key]?.[
                                                    mode
                                                ])
                                        }
                                        hint={
                                            value === "allow" &&
                                            !data.field_delegatable[key]?.[mode]
                                                ? t("noDelegation")
                                                : undefined
                                        }
                                        onPress={() => {
                                            if (
                                                busy ||
                                                (value === "allow" &&
                                                    !data.field_delegatable[
                                                        key
                                                    ]?.[mode])
                                            )
                                                return;
                                            setFields((old) => ({
                                                ...old,
                                                [key]: {
                                                    view:
                                                        old[key]?.view ??
                                                        "inherit",
                                                    edit:
                                                        old[key]?.edit ??
                                                        "inherit",
                                                    [mode]: value as Effect,
                                                },
                                            }));
                                            setDirty(true);
                                        }}
                                    />
                                ))}
                            </View>
                        </View>
                    ))}
                </Card>
            ))}
            {!delegation && (
                <Input
                    label={t("assignedIds")}
                    help={t("assignedIdsHint")}
                    value={assigned}
                    editable={!busy}
                    onChangeText={(value) => {
                        setAssigned(value);
                        setDirty(true);
                    }}
                    keyboardType="numbers-and-punctuation"
                />
            )}
            {!!error && <ErrorState error={error} />}
            <Button
                label={t("save")}
                loading={busy}
                disabled={!dirty}
                onPress={() => void save()}
            />
            <Button
                label={t("cancel")}
                variant="secondary"
                disabled={busy}
                onPress={() => router.back()}
            />
        </>
    );
}
