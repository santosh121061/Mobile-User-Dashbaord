import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    BackHandler,
    ScrollView,
    View,
    useWindowDimensions,
} from "react-native";
import { MoreVertical, Search } from "lucide-react-native";
import { FloatingAdd, IconButton } from "@/components/visuals";
import { UserMenu } from "@/features/user-menu";
import { useTheme } from "@/theme";
import { api, check, unwrap } from "@/api/client";
import { useBootstrap, useSession } from "@/auth/session";
import { useFeatureConfirmation } from "@/features/use-feature-confirmation";
import { usePages, useRead, useSearch } from "@/api/hooks";
import { envelope, pageSchema, userSchema } from "@/api/runtime";
import { listContextSchema, operationSchema } from "@/api/contracts";
import { rememberOperation } from "@/features/session-operations";
import { useFeatureWork } from "@/features/use-feature-work";
import { Access } from "@/components/access";
import { Button, ErrorState, Input, Label, Row, Screen } from "@/components/ui";
import { Records } from "@/components/records";
import { t, number } from "@/localization";
import { ExportButton } from "@/features/exports";
import { Choice as Chip } from "@/features/choice";
type State = "" | "enabled" | "disabled" | "archived";
export default function Users() {
    const snapshot = useBootstrap();
    return (
        <UsersList
            key={[
                snapshot.account.id,
                snapshot.access_revision,
                snapshot.configuration_revision,
                snapshot.fields.roles?.view,
                snapshot.actions["users.bulk"],
                snapshot.features["users.bulk.enabled"],
            ].join(":")}
        />
    );
}
function UsersList() {
    const { width } = useWindowDimensions();
    const { colors } = useTheme();
    const [menu, setMenu] = useState<{ id: string; name: string } | null>(null);
    const snapshot = useBootstrap();
    const { captureWork } = useSession();
    const params = useLocalSearchParams<{
        search?: string;
        account?: string;
    }>();
    const importedSearch = useRef("");
    const confirm = useFeatureConfirmation();
    const work = useFeatureWork();
    const { search, setSearch, debounced } = useSearch();
    const [state, setState] = useState<State>("");
    const [selected, setSelected] = useState<string[]>([]);
    const [selecting, setSelecting] = useState(false);
    const [role, setRole] = useState<string>("");
    const [showRoles, setShowRoles] = useState(false);
    const selectable =
        !!snapshot.actions["users.bulk"] &&
        !!snapshot.features["users.bulk.enabled"];
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
        setSelected([]);
        setSelecting(false);
    }, [params.search, params.account, snapshot.account.id, setSearch]);
    useFocusEffect(
        useCallback(() => {
            const subscription = BackHandler.addEventListener(
                "hardwareBackPress",
                () => {
                    if (showRoles) {
                        setShowRoles(false);
                        return true;
                    }
                    if (!selecting) return false;
                    setSelected([]);
                    setSelecting(false);
                    return true;
                },
            );
            return () => subscription.remove();
        }, [selecting, showRoles]),
    );
    const rolesVisible = !!snapshot.fields.roles?.view;
    const roleOptions = useRead(
        "user-list-context",
        null,
        async (signal) =>
            unwrap(
                await api.GET("/v1/mobile/users/list-context", { signal }),
                envelope(listContextSchema),
            ).data,
        !!snapshot.modules.users && rolesVisible,
    );
    const criteria = {
        search: debounced,
        ...(state &&
        (state !== "archived" || snapshot.features["users.archive.enabled"])
            ? { state }
            : {}),
        ...(rolesVisible &&
        roleOptions.data?.role_options.some((option) => option.id === role)
            ? { role: Number(role) }
            : {}),
    };
    const { busy, error } = work;
    const actionCriteria = Object.fromEntries(
        Object.entries(criteria).map(([key, value]) => [key, String(value)]),
    );
    const query = usePages(
        "users",
        criteria,
        async (page, signal) =>
            unwrap(
                await api.GET("/v1/users", {
                    params: { query: { ...criteria, page, per_page: 30 } },
                    signal,
                }),
                pageSchema(userSchema),
            ),
        !!snapshot.modules.users,
    );
    const bulk = async (
        action: "enable" | "disable" | "archive" | "restore" | "delete",
    ) =>
        work.run(async (scope) => {
            await confirm(
                scope,
                "POST",
                "/api/v1/users/bulk",
                async (approval, signal) => {
                    const result = await api.POST("/v1/users/bulk", {
                        body: {
                            action,
                            criteria: actionCriteria,
                            selection: {
                                mode: "selected",
                                ids: selected.map(Number),
                            },
                        },
                        headers: { "X-Mobile-Step-Up": approval },
                        signal,
                    });
                    check(result);
                    scope.assertCurrent();
                    if (result.response.status === 202) {
                        const operation = operationSchema.parse(result.data);
                        rememberOperation(
                            operation.id,
                            "bulk",
                            snapshot,
                            captureWork,
                        );
                        router.push(`/operations/${operation.id}`);
                    }
                },
            );
            scope.assertCurrent();
            setSelected([]);
            setSelecting(false);
            await query.refetch();
        });
    return (
        <Access module="users">
            <Screen>
                <View
                    style={{
                        flexDirection: "row",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                    }}
                >
                    <Label size="h1" style={{ flex: 1 }}>
                        {t("users")}
                    </Label>
                    {width >= 600 && snapshot.actions["users.create"] && (
                        <Button
                            label={t("addUser")}
                            onPress={() => router.push("/users/new")}
                        />
                    )}
                </View>
                <Input
                    label={t("search")}
                    hideLabel
                    leading={<Search size={20} color={colors.text.tertiary} />}
                    placeholder={t("usersSearch")}
                    value={search}
                    onChangeText={(value) => {
                        setSearch(value);
                        setSelected([]);
                        setSelecting(false);
                    }}
                    maxLength={100}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {(
                        [
                            "",
                            "enabled",
                            "disabled",
                            ...(snapshot.features["users.archive.enabled"]
                                ? ["archived"]
                                : []),
                        ] as State[]
                    ).map((value) => (
                        <Chip
                            key={value}
                            label={t(value || "all")}
                            selected={state === value}
                            disabled={busy}
                            onPress={() => {
                                setState(value);
                                setSelected([]);
                                setSelecting(false);
                            }}
                        />
                    ))}
                </View>
                <View
                    style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                    {rolesVisible && (
                        <Button
                            label={
                                t("roleFilter") +
                                (role
                                    ? ": " +
                                      (roleOptions.data?.role_options.find(
                                          (option) => option.id === role,
                                      )?.name ?? "")
                                    : "")
                            }
                            variant="tertiary"
                            disabled={busy}
                            onPress={() => setShowRoles(!showRoles)}
                        />
                    )}
                    {selectable && (
                        <Button
                            variant="tertiary"
                            label={t(selecting ? "cancel" : "select")}
                            onPress={() => {
                                setSelecting(!selecting);
                                setSelected([]);
                            }}
                        />
                    )}
                    <ExportButton
                        resource="users"
                        criteria={actionCriteria}
                        variant="tertiary"
                    />
                </View>
                {rolesVisible && showRoles && (
                    <ScrollView
                        testID="user-role-selector"
                        style={{ maxHeight: 240, flexGrow: 0 }}
                        contentContainerStyle={{ gap: 8 }}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                    >
                        {!!roleOptions.error && (
                            <ErrorState
                                error={roleOptions.error}
                                retry={() => void roleOptions.refetch()}
                            />
                        )}
                        <View
                            style={{ flexDirection: "row", flexWrap: "wrap" }}
                        >
                            {[
                                { id: "", name: t("all") },
                                ...(roleOptions.data?.role_options ?? []),
                            ].map((option) => (
                                <Chip
                                    key={option.id}
                                    label={option.name}
                                    selected={option.id === role}
                                    disabled={busy || roleOptions.isPending}
                                    onPress={() => {
                                        if (busy) return;
                                        setRole(option.id);
                                        setSelected([]);
                                        setSelecting(false);
                                        setShowRoles(false);
                                    }}
                                />
                            ))}
                        </View>
                    </ScrollView>
                )}
                {selecting && (
                    <>
                        <Label>
                            {t("selected")}: {number(selected.length)}
                        </Label>
                        <Label size="caption">{t("selectionHint")}</Label>
                        <View
                            style={{
                                flexDirection: "row",
                                gap: 8,
                                flexWrap: "wrap",
                            }}
                        >
                            {snapshot.actions["users.status"] &&
                                state !== "archived" && (
                                    <>
                                        <Button
                                            label={t("bulkEnable")}
                                            onPress={() => void bulk("enable")}
                                            disabled={!selected.length || busy}
                                        />
                                        <Button
                                            label={t("bulkDisable")}
                                            variant="danger"
                                            onPress={() => void bulk("disable")}
                                            disabled={!selected.length || busy}
                                        />
                                    </>
                                )}
                            {snapshot.actions[
                                state === "archived"
                                    ? "users.restore"
                                    : "users.archive"
                            ] &&
                                snapshot.features["users.archive.enabled"] && (
                                    <Button
                                        label={t(
                                            state === "archived"
                                                ? "restore"
                                                : "archive",
                                        )}
                                        variant="danger"
                                        disabled={!selected.length || busy}
                                        onPress={() =>
                                            void bulk(
                                                state === "archived"
                                                    ? "restore"
                                                    : "archive",
                                            )
                                        }
                                    />
                                )}
                            {state === "archived" &&
                                snapshot.actions["users.delete"] && (
                                    <Button
                                        label={t("delete")}
                                        variant="danger"
                                        disabled={!selected.length || busy}
                                        onPress={() => void bulk("delete")}
                                    />
                                )}
                        </View>
                    </>
                )}
                {!!error && <ErrorState error={error} />}
                <Records
                    bottomPadding={
                        width < 600 && snapshot.actions["users.create"]
                            ? 80
                            : 16
                    }
                    rows={query.rows}
                    pending={query.isPending}
                    error={query.error}
                    retry={() => void query.refetch()}
                    refreshing={query.isRefetching}
                    more={query.hasNextPage}
                    loadingMore={query.isFetchingNextPage}
                    next={() => void query.fetchNextPage()}
                    render={(user) => (
                        <Row
                            trailing={
                                !selecting && (
                                    <IconButton
                                        label={t("recordActions", {
                                            name: user.name ?? user.public_id,
                                        })}
                                        onPress={() =>
                                            setMenu({
                                                id: user.id,
                                                name:
                                                    user.name ?? user.public_id,
                                            })
                                        }
                                    >
                                        <MoreVertical
                                            size={20}
                                            color={colors.text.secondary}
                                        />
                                    </IconButton>
                                )
                            }
                            title={user.name ?? user.public_id}
                            subtitle={[
                                user.roles?.map((role) => role.name).join(", "),
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                            selected={selected.includes(user.id)}
                            status={user.archived ? "archived" : user.status}
                            onLongPress={
                                selectable && !busy
                                    ? () => {
                                          setSelecting(true);
                                          setSelected((old) =>
                                              old.includes(user.id)
                                                  ? old
                                                  : [...old, user.id],
                                          );
                                      }
                                    : undefined
                            }
                            onPress={() =>
                                selecting
                                    ? setSelected((old) =>
                                          old.includes(user.id)
                                              ? old.filter(
                                                    (id) => id !== user.id,
                                                )
                                              : [...old, user.id],
                                      )
                                    : router.push(`/users/${user.id}`)
                            }
                        />
                    )}
                />
                {width < 600 &&
                    !selecting &&
                    snapshot.actions["users.create"] && (
                        <FloatingAdd
                            label={t("addUser")}
                            onPress={() => router.push("/users/new")}
                        />
                    )}
                {menu && (
                    <UserMenu
                        id={menu.id}
                        name={menu.name}
                        close={() => setMenu(null)}
                        refresh={() => query.refetch()}
                    />
                )}
            </Screen>
        </Access>
    );
}
