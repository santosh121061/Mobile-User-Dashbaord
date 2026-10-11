import { RootHeader } from "@/components/chrome";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  BackHandler,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Search,
  UserPlus,
  SlidersHorizontal,
  ArrowDownUp,
} from "lucide-react-native";
import { IconButton } from "@/components/visuals";
import { Sheet } from "@/components/sheet";
import { UserDirectoryRow } from "@/features/user-directory-row";
import { UserMenu } from "@/features/user-menu";
import { useTheme } from "@/theme";
import { api, ApiError, check, unwrap } from "@/api/client";
import { useBootstrap, useSession } from "@/auth/session";
import { useFeatureAction } from "@/features/use-feature-action";
import { usePages, useRead, useSearch } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import {
  listContextSchema,
  operationSchema,
  userPageSchema,
} from "@/api/contracts";
import { rememberOperation } from "@/features/session-operations";
import { useFeatureWork } from "@/features/use-feature-work";
import { Access } from "@/components/access";
import { Button, ErrorState, Input, Label, Screen } from "@/components/ui";
import { Records } from "@/components/records";
import { t, number } from "@/localization";
import { ExportButton } from "@/features/exports";
import { Choice as Chip } from "@/features/choice";
type State = "" | "active" | "pending" | "suspended" | "disabled" | "archived";
type Sort = "name_asc" | "name_desc" | "recent";
export default function Users() {
  const snapshot = useBootstrap();
  return (
    <UsersList
      key={[
        snapshot.account.id,
        snapshot.access_revision,
        snapshot.configuration_revision,
        snapshot.availability_revision,
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
  const runAction = useFeatureAction();
  const work = useFeatureWork();
  const { search, setSearch, debounced } = useSearch();
  const [state, setState] = useState<State>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [role, setRole] = useState<string>("");
  const [showRoles, setShowRoles] = useState(false);
  const [sort, setSort] = useState<Sort>();
  const [showSort, setShowSort] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    status: string;
    updated_count: number;
    skipped_count: number;
  } | null>(null);
  const selectable =
    !!snapshot.features["api.enabled"] &&
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
          if (showBulk) {
            if (!work.busy) setShowBulk(false);
            return true;
          }
          if (showSort) {
            if (!work.busy) setShowSort(false);
            return true;
          }
          if (showRoles) {
            if (!work.busy) setShowRoles(false);
            return true;
          }
          if (!selecting) return false;
          setSelected([]);
          setSelecting(false);
          return true;
        },
      );
      return () => subscription.remove();
    }, [selecting, showRoles, showSort, showBulk, work.busy]),
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
    ...(sort ? { sort } : {}),
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
        userPageSchema,
      ),
    !!snapshot.modules.users,
  );
  const firstPage = query.data?.pages[0];
  const statusCounts = firstPage?.meta?.status_counts;
  const total = firstPage?.meta?.total ?? firstPage?.total;
  const runBulkAction = async (
    action: "suspend" | "reactivate" | "archive" | "restore",
  ) =>
    work.run(async (scope) => {
      if (
        !selectable ||
        !selected.length ||
        (["suspend", "reactivate"].includes(action)
          ? !snapshot.actions["users.status"] ||
            !snapshot.fields.status?.edit ||
            state === "archived"
          : !snapshot.actions[`users.${action}`] ||
            !snapshot.features["users.archive.enabled"])
      )
        throw new ApiError(403, {}, null);
      const ids = z
        .array(z.number().int().positive().safe())
        .min(1)
        .parse(selected.map(Number));
      setBulkResult(null);
      await runAction(
        scope,
        "POST",
        "/api/v1/users/bulk",
        async (signal) => {
          const result = await api.POST("/v1/users/bulk", {
            body: {
              action,
              criteria: actionCriteria,
              selection: {
                mode: "selected",
                ids,
              },
            },

            signal,
          });
          check(result);
          scope.assertCurrent();
          if (result.response.status === 202) {
            const operation = z
              .union([
                operationSchema,
                envelope(operationSchema).transform((value) => value.data),
              ])
              .parse(result.data);
            rememberOperation(operation.id, "bulk", snapshot, captureWork);
            router.push(`/operations/${operation.id}`);
          } else {
            const receipt = unwrap(
              result,
              envelope(
                z.object({
                  status: z.string(),
                  updated_count: z.number().int().nonnegative(),
                  skipped_count: z.number().int().nonnegative(),
                }),
              ),
            ).data;
            setBulkResult(receipt);
          }
        },
        action === "suspend" || action === "archive",
      );
      scope.assertCurrent();
      setSelected([]);
      setSelecting(false);
      setShowBulk(false);
      await query.refetch();
      scope.assertCurrent();
    });
  return (
    <Access module="users">
      <Screen
        safeTop
        contentStyle={{ gap: 0 }}
        footer={
          selecting ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                padding: 6,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: "#C9D9EF",
                backgroundColor: colors.surface,
              }}
            >
              <View
                accessibilityLabel={`${t("selected")}: ${number(selected.length)}`}
                style={{
                  width: width <= 330 ? 42 : 54,
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Label
                  style={{
                    fontFamily: "Inter_750ExtraBold15",
                    fontSize: width <= 330 ? 13 : 15,
                    lineHeight: 20,
                  }}
                >
                  {number(selected.length)}
                </Label>
                <Label
                  size="caption"
                  style={{ fontSize: width <= 330 ? 8 : 9, lineHeight: 13 }}
                >
                  {t("selected")}
                </Label>
              </View>
              <View style={{ flex: 1 }}>
                <ExportButton
                  resource="users"
                  criteria={actionCriteria}
                  selection={{ mode: "selected", ids: selected.map(Number) }}
                  label="Export selected"
                  displayLabel="Export"
                  variant="outline"
                  compact
                  disabled={busy || !selected.length}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Actions"
                  compact
                  disabled={busy || !selected.length}
                  onPress={() => setShowBulk(true)}
                />
              </View>
            </View>
          ) : undefined
        }
        header={
          <RootHeader title={t("users")}>
            {snapshot.actions["users.create"] && (
              <IconButton
                variant="accent"
                label={t("addUser")}
                onPress={() => router.push("/users/new")}
              >
                <UserPlus size={22} color={colors.brand.primary} />
              </IconButton>
            )}
          </RootHeader>
        }
      >
        <Input
          label={t("search")}
          hideLabel
          leading={<Search size={20} color={colors.searchIcon} />}
          placeholder="Search users, email or role"
          containerStyle={{ marginBottom: 12 }}
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setSelected([]);
            setSelecting(false);
          }}
          maxLength={100}
        />
        <View style={{ flexDirection: "row", gap: 8, minHeight: 48 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            <View style={{ flexDirection: "row", paddingTop: 2 }}>
              {(
                [
                  "",
                  "active",
                  "pending",
                  "suspended",
                  "disabled",
                  ...(snapshot.features["users.archive.enabled"]
                    ? ["archived"]
                    : []),
                ] as State[]
              ).map((value) => {
                const count =
                  value && value !== "archived"
                    ? statusCounts?.[value]
                    : undefined;
                return (
                  <Chip
                    key={value}
                    label={
                      t(value || "all") +
                      (count === undefined ? "" : ` ${number(count)}`)
                    }
                    selected={state === value}
                    disabled={busy}
                    onPress={() => {
                      setState(value);
                      setSelected([]);
                      setSelecting(false);
                    }}
                  />
                );
              })}
            </View>
          </ScrollView>
          {rolesVisible && (
            <IconButton
              variant="surface"
              label={
                role && rolesVisible
                  ? `${t("roleFilter")}: ${roleOptions.data?.role_options.find((option) => option.id === role)?.name ?? t("all")}`
                  : t("roleFilter")
              }
              disabled={busy}
              onPress={() => setShowRoles(!showRoles)}
            >
              <SlidersHorizontal size={22} color={colors.text.secondary} />
            </IconButton>
          )}
          <IconButton
            variant="surface"
            label={t("sortUsers")}
            disabled={busy}
            onPress={() => setShowSort(true)}
          >
            <ArrowDownUp size={22} color={colors.text.secondary} />
          </IconButton>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginVertical: 9,
            minHeight: 48,
          }}
        >
          <Label size="caption" tone="secondary" style={{ flex: 1 }}>
            {number(total ?? query.rows.length)}{" "}
            {total === undefined ? "loaded people" : "people"}
          </Label>
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
            iconOnly
          />
        </View>
        {rolesVisible && showRoles && (
          <Sheet
            title="Filter users"
            closeDisabled={busy}
            close={() => {
              if (!busy) setShowRoles(false);
            }}
          >
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
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
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
          </Sheet>
        )}
        {showSort && (
          <Sheet
            title={t("sortUsers")}
            closeDisabled={busy}
            close={() => setShowSort(false)}
          >
            {(
              [
                ["name_asc", "nameAscending"],
                ["name_desc", "nameDescending"],
                ["recent", "recentlyAdded"],
              ] as const
            ).map(([value, label]) => (
              <Chip
                key={value}
                label={t(label)}
                selected={sort === value}
                disabled={busy}
                onPress={() => {
                  setSort(value);
                  setSelected([]);
                  setSelecting(false);
                  setShowSort(false);
                }}
              />
            ))}
          </Sheet>
        )}
        {showBulk && (
          <Sheet
            title={`${number(selected.length)} selected people`}
            closeDisabled={busy}
            close={() => setShowBulk(false)}
          >
            <Label size="caption" tone="secondary">
              Protected Owner accounts are excluded by the server. Review the
              result for skipped accounts.
            </Label>
            {snapshot.actions["users.status"] &&
              snapshot.fields.status?.edit &&
              state !== "archived" && (
                <>
                  <Button
                    label="Reactivate selected"
                    onPress={() => void runBulkAction("reactivate")}
                    disabled={!selected.length || busy}
                  />
                  <Button
                    label="Suspend selected"
                    variant="danger"
                    onPress={() => void runBulkAction("suspend")}
                    disabled={!selected.length || busy}
                  />
                </>
              )}
            {snapshot.actions[
              state === "archived" ? "users.restore" : "users.archive"
            ] &&
              snapshot.features["users.archive.enabled"] && (
                <Button
                  label={t(state === "archived" ? "restore" : "archive")}
                  variant="danger"
                  disabled={!selected.length || busy}
                  onPress={() =>
                    void runBulkAction(
                      state === "archived" ? "restore" : "archive",
                    )
                  }
                />
              )}
            <Button
              label="Done"
              variant="tertiary"
              disabled={busy}
              onPress={() => setShowBulk(false)}
            />
            {!!error && <ErrorState error={error} />}
          </Sheet>
        )}
        {bulkResult && (
          <Label accessibilityLiveRegion="polite">
            {number(bulkResult.updated_count)} updated ·{" "}
            {number(bulkResult.skipped_count)} skipped
          </Label>
        )}
        {bulkResult && (
          <Label size="caption" tone="secondary">
            Status: {bulkResult.status}
          </Label>
        )}
        {!!error && !showBulk && <ErrorState error={error} />}
        <Records
          bottomPadding={
            width < 600 && snapshot.actions["users.create"] ? 80 : 16
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
            <UserDirectoryRow
              user={user}
              selectable={selectable}
              selected={selected.includes(user.id)}
              selecting={selecting}
              busy={busy}
              onToggle={() => {
                if (busy) return;
                setSelecting(true);
                setSelected((old) =>
                  old.includes(user.id)
                    ? old.filter((id) => id !== user.id)
                    : [...old, user.id],
                );
              }}
              onOpen={() =>
                selecting
                  ? setSelected((old) =>
                      old.includes(user.id)
                        ? old.filter((id) => id !== user.id)
                        : [...old, user.id],
                    )
                  : router.push(`/users/${user.id}`)
              }
              onActions={() =>
                setMenu({ id: user.id, name: user.name ?? user.public_id })
              }
              onSelect={() => {
                if (busy || !selectable) return;
                setSelecting(true);
                setSelected((old) =>
                  old.includes(user.id) ? old : [...old, user.id],
                );
              }}
            />
          )}
        />
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
