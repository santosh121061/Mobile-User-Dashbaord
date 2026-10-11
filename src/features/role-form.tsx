import { ShieldCheck, Search, Check } from "lucide-react-native";
import { KeyRow, ToggleRow, permissionLabel } from "@/components/details";
import { FormIntro } from "@/components/form-intro";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Controller, useForm, useWatch } from "react-hook-form";
import { router } from "expo-router";
import { api, ApiError, check, unwrap } from "@/api/client";
import { envelope } from "@/api/runtime";
import {
  roleSchema,
  roleWriteSchema,
  roleCreateContextSchema,
  type RoleScope,
  type RolePreset,
} from "@/api/contracts";
import { useRead } from "@/api/hooks";
import { useBootstrap, useSession } from "@/auth/session";
import {
  activeEntries,
  availabilityMatches,
  capabilityAvailable,
  catalogEntries,
  staleAvailability,
} from "@/api/availability";
import { useTheme } from "@/theme";
import { applyFieldErrors, useDiscard, useTitle } from "@/components/forms";
import { Access } from "@/components/access";
import {
  Button,
  Card,
  ErrorState,
  Input,
  Label,
  Loading,
  Screen,
} from "@/components/ui";
import { Choice } from "./choice";
import { FeaturePane } from "./feature-pane";
import { Sheet } from "@/components/sheet";
import { useFeatureAction } from "./use-feature-action";
import { useFeatureWork } from "./use-feature-work";
import { date, number, t } from "@/localization";

type Values = {
  name: string;
  description?: string | null;
  default_scope?: RoleScope | null;
  preset?: RolePreset;
  grants: string[];
  scopes: Record<string, RoleScope>;
  fields: Record<string, { view: boolean; edit: boolean }>;
};
const groupLabel = (group: string) =>
  ({
    users: t("users"),
    roles: t("roles"),
    audit: t("activity"),
    api: t("keys"),
    access: t("access"),
    settings: t("settings"),
    notifications: t("notifications"),
    account: t("profile"),
    dashboard: t("home"),
  })[group] ?? group.replaceAll("_", " ");

function RolePermissionPanel({
  children,
  modal,
  close,
}: React.PropsWithChildren<{ modal: boolean; close: () => void }>) {
  return modal ? (
    <Sheet title="Starting permissions" close={close}>
      {children}
      <Button label="Done" onPress={close} />
    </Sheet>
  ) : (
    <>{children}</>
  );
}

function useRoleOptions(snapshot: ReturnType<typeof useBootstrap>) {
  return useRead(
    "role-create",
    null,
    async (signal) =>
      unwrap(
        await api.GET("/v1/mobile/roles/create-context", { signal }),
        envelope(roleCreateContextSchema),
      ).data,
    !!snapshot.features["api.enabled"] && !!snapshot.actions["roles.manage"],
  );
}

function useRoleDetail(snapshot: ReturnType<typeof useBootstrap>, id?: string) {
  return useRead(
    "role",
    id,
    async (signal) =>
      unwrap(
        await api.GET("/v1/roles/{role}", {
          params: { path: { role: Number(id) } },
          signal,
        }),
        envelope(roleSchema),
      ).data,
    !!id && !!snapshot.features["api.enabled"] && !!snapshot.modules.roles,
  );
}

export default function RoleForm({ id }: { id?: string }) {
  const snapshot = useBootstrap();
  const creation = useRoleOptions(snapshot);
  const query = useRoleDetail(snapshot, id);
  return (
    <RoleEditor
      key={[
        snapshot.account.id,
        snapshot.access_revision,
        snapshot.configuration_revision,
        snapshot.availability_revision,
        creation.data?.availability_revision,
        query.data?.availability_revision,
        id ?? "new",
      ].join(":")}
      id={id}
      creation={creation}
      query={query}
    />
  );
}
function RoleEditor({
  id,
  creation,
  query,
}: {
  id?: string;
  creation: ReturnType<typeof useRoleOptions>;
  query: ReturnType<typeof useRoleDetail>;
}) {
  const { width, height } = useWindowDimensions();
  const formWidth =
    width >= 840 && height >= 480 ? 550 : width >= 600 ? 540 : 560;
  const { colors } = useTheme();
  const snapshot = useBootstrap();
  const runAction = useFeatureAction();
  const session = useSession();
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [permissionEditor, setPermissionEditor] = useState(false);
  useTitle(id ? "Role details" : "New role");
  const work = useFeatureWork(creation.data?.availability_revision);
  const form = useForm<Values>({
    defaultValues: {
      name: "",
      grants: [],
      scopes: {},
      fields: {},
    },
  });
  useDiscard(form.formState.isDirty && !saved);
  const dirtyFields = form.formState.dirtyFields;
  useEffect(() => {
    if (!query.data) return;
    form.reset(
      {
        name: query.data.name,
        description: query.data.description,
        default_scope: query.data.default_scope,
        grants: query.data.grants,
        scopes: Object.fromEntries(
          query.data.scopes.map((rule) => [rule.name, rule.scope]),
        ),
        fields: Object.fromEntries(
          [
            ...new Set([
              ...Object.keys(creation.data?.field_catalog ?? {}),
              // Hidden nullable rules cannot be expressed by the current boolean write contract.
              ...query
                .data!.fields.filter(
                  (rule) =>
                    typeof rule.can_view === "boolean" &&
                    typeof rule.can_edit === "boolean",
                )
                .map((rule) => rule.field),
            ]),
          ].map((key) => {
            const rule = query.data!.fields.find((rule) => rule.field === key);
            return [
              key,
              {
                view: rule?.can_view ?? false,
                edit: rule?.can_edit ?? false,
              },
            ];
          }),
        ),
      },
      { keepDirtyValues: true },
    );
  }, [
    query.data,
    form,
    creation.data?.field_catalog,
    creation.data?.availability_revision,
  ]);
  const authorized =
    !!snapshot.features["api.enabled"] &&
    !!snapshot.actions["roles.manage"] &&
    (!id || query.data?.can_edit !== false);
  const context = creation.data;
  const ready =
    !!context &&
    availabilityMatches(snapshot, context) &&
    (!id || (!!query.data && availabilityMatches(snapshot, query.data))) &&
    !!context.field_catalog &&
    !!context.field_delegatable &&
    !!context.delegatable;
  const canEdit = authorized && ready && !stale;
  const watched = useWatch({ control: form.control });
  const values: Values = {
    name: watched.name ?? "",
    grants: watched.grants ?? [],
    scopes: (watched.scopes as Values["scopes"]) ?? {},
    fields: (watched.fields as Values["fields"]) ?? {},
  };
  const filter = search.trim().toLocaleLowerCase();
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(
    context?.catalog ??
      Object.fromEntries((query.data?.grants ?? []).map((key) => [key, key])),
  )) {
    if (!capabilityAvailable(context ?? snapshot, key)) continue;
    const group = key.split(".")[0]!;
    if (
      filter &&
      ![key, key.replaceAll(".", " "), groupLabel(group)].some((label) =>
        label.toLocaleLowerCase().includes(filter),
      )
    )
      continue;
    groups.set(group, [...(groups.get(group) ?? []), key]);
  }
  const fields = Object.entries(context?.field_catalog ?? {}).filter(
    ([key, label]) =>
      !filter || (key + " " + label).toLocaleLowerCase().includes(filter),
  );
  const submit = form.handleSubmit((body) =>
    work.run(
      async (scope) => {
        if (
          !canEdit ||
          (!id && body.preset && !creation.data?.presets[body.preset].available)
        )
          throw new ApiError(403, {}, null);
        const payload = roleWriteSchema.parse({
          ...body,
          grants: body.grants.filter((key) =>
            capabilityAvailable(context!, key),
          ),
          scopes: activeEntries(context!, body.scopes),
          fields: catalogEntries(
            context!.field_catalog!,
            Object.fromEntries(
              Object.entries(body.fields).filter(
                ([key]) =>
                  !id ||
                  !!dirtyFields.fields?.[key] ||
                  !!query.data?.fields.some(
                    (rule) =>
                      rule.field === key &&
                      typeof rule.can_view === "boolean" &&
                      typeof rule.can_edit === "boolean",
                  ),
              ),
            ),
          ),
          availability_revision: context!.availability_revision,
        });
        await runAction(
          scope,
          id ? "PUT" : "POST",
          id ? `/api/v1/roles/${id}` : "/api/v1/roles",
          async (signal) =>
            check(
              id
                ? await api.PUT("/v1/roles/{role}", {
                    params: { path: { role: id } },
                    body: payload,

                    signal,
                  })
                : await api.POST("/v1/roles", {
                    body: payload,

                    signal,
                  }),
            ),
        );
        scope.assertCurrent();
        setSaved(true);
        form.reset(body);
        router.back();
      },
      (failure) => {
        if (staleAvailability(failure)) setStale(true);
        applyFieldErrors(form, failure, [
          "name",
          "description",
          "default_scope",
          "preset",
        ]);
      },
    ),
  );
  const remove = () =>
    work.run(async (scope) => {
      if (!id) return;
      await runAction(scope, "DELETE", `/api/v1/roles/${id}`, async (signal) =>
        check(
          await api.DELETE("/v1/roles/{role}", {
            params: { path: { role: id } },

            signal,
          }),
        ),
      );
      scope.assertCurrent();
      setSaved(true);
      form.reset();
      router.back();
    });
  if (
    !snapshot.features["api.enabled"] ||
    (id && !snapshot.modules.roles) ||
    (!id && !authorized)
  )
    return (
      <Screen>
        <ErrorState error={new ApiError(403, {}, null)} />
      </Screen>
    );
  if (id && query.isPending) return <Loading />;
  if (id && query.error)
    return (
      <Screen>
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      </Screen>
    );
  if (authorized && creation.isPending) return <Loading />;
  if (authorized && creation.error)
    return (
      <Screen>
        <ErrorState
          error={creation.error}
          retry={() => void creation.refetch()}
        />
      </Screen>
    );
  return (
    <Access {...(id ? { module: "roles" } : { action: "roles.manage" })}>
      <Screen
        scroll
        contentStyle={id ? undefined : { maxWidth: formWidth }}
        footer={
          <>
            {canEdit && (
              <>
                <Button
                  label={id ? t("save") : "Create role"}
                  displayLabel={id ? "Save access" : undefined}
                  icon={<Check size={20} color="#FFFFFF" />}
                  iconPosition="after"
                  onPress={() => void submit()}
                  loading={work.busy || form.formState.isSubmitting}
                  disabled={!Object.keys(dirtyFields).length}
                />
              </>
            )}
          </>
        }
      >
        <FeaturePane wide={!!id}>
          {id ? (
            <Card
              style={{
                padding: 20,
                borderRadius: 22,
                borderColor: colors.border,
                boxShadow: "none",
              }}
            >
              <FormIntro
                icon={ShieldCheck}
                title={query.data?.name ?? t("roles")}
                subtitle={`${query.data?.grants.length ?? 0} ${t("permissions").toLowerCase()}`}
                tone="purple"
                prominent
              />
            </Card>
          ) : (
            <FormIntro
              icon={ShieldCheck}
              title={t("roleIntro")}
              subtitle={t("roleIntroHint")}
              tone="purple"
            />
          )}
          <Card
            formSection
            heading={!id ? "Role details" : undefined}
            style={{ gap: 15 }}
          >
            <Controller
              name="name"
              control={form.control}
              rules={{
                required: t("validation"),
                maxLength: 100,
              }}
              render={({
                field: { ref, value, onChange, onBlur },
                fieldState,
              }) => (
                <Input
                  ref={ref}
                  label={t("roleName")}
                  placeholder="e.g. Support lead"
                  required
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  editable={canEdit && !work.busy}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="description"
              control={form.control}
              rules={{
                maxLength: {
                  value: 500,
                  message: "Use 500 characters or fewer.",
                },
              }}
              render={({
                field: { ref, value, onChange, onBlur },
                fieldState,
              }) => (
                <Input
                  ref={ref}
                  label="Description"
                  placeholder="What will this role be responsible for?"
                  value={value ?? ""}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  editable={canEdit && !work.busy}
                  error={fieldState.error?.message}
                />
              )}
            />
          </Card>
          {id &&
            query.data &&
            (query.data.default_scope !== undefined ||
              query.data.updated_at ||
              (query.data.assigned_count_scope ===
                "visible_unarchived_accounts" &&
                query.data.assigned_count !== undefined &&
                query.data.assigned_count !== null)) && (
              <Card>
                {query.data.default_scope !== undefined && (
                  <KeyRow
                    label="Default scope"
                    value={
                      query.data.default_scope === null
                        ? "No role override"
                        : t(
                            query.data.default_scope === "all"
                              ? "allScope"
                              : query.data.default_scope === "created"
                                ? "createdScope"
                                : query.data.default_scope,
                          )
                    }
                  />
                )}
                {query.data.updated_at && (
                  <KeyRow
                    label="Last updated"
                    value={date(query.data.updated_at)}
                  />
                )}
                {query.data.assigned_count_scope ===
                  "visible_unarchived_accounts" &&
                  query.data.assigned_count !== undefined &&
                  query.data.assigned_count !== null && (
                    <KeyRow
                      label="Visible accounts"
                      value={number(query.data.assigned_count)}
                    />
                  )}
              </Card>
            )}
          {!id && (
            <Card formSection style={{ gap: 15 }}>
              <Label size="bodyMedium">Starting permissions</Label>
              <Label size="caption" tone="secondary">
                Start from
              </Label>
              <Controller
                name="preset"
                control={form.control}
                render={({ field, fieldState }) => (
                  <>
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {(["viewer", "editor", "manager"] as const).map((key) => {
                        const definition = creation.data?.presets[key];
                        return (
                          definition && (
                            <Choice
                              key={key}
                              label={definition.label}
                              selected={field.value === key}
                              disabled={
                                !canEdit || work.busy || !definition.available
                              }
                              onPress={() => {
                                field.onChange(key);
                                form.setValue(
                                  "grants",
                                  [...definition.grants],
                                  { shouldDirty: true },
                                );
                                form.setValue(
                                  "scopes",
                                  { ...definition.scopes },
                                  { shouldDirty: true },
                                );
                                form.setValue(
                                  "fields",
                                  Object.fromEntries(
                                    Object.entries(definition.fields).map(
                                      ([name, value]) => [name, { ...value }],
                                    ),
                                  ),
                                  { shouldDirty: true },
                                );
                              }}
                            />
                          )
                        );
                      })}
                    </View>
                    {fieldState.error?.message && (
                      <Label accessibilityLiveRegion="polite">
                        {fieldState.error.message}
                      </Label>
                    )}
                  </>
                )}
              />
              <Button
                label="Choose permissions"
                variant="secondary"
                disabled={!canEdit || work.busy}
                onPress={() => setPermissionEditor(true)}
              />
              <Label size="caption" tone="secondary">
                Review individual permissions before creating the role.
              </Label>
            </Card>
          )}
          {canEdit && (
            <Card>
              <Controller
                name="default_scope"
                control={form.control}
                render={({ field, fieldState }) => (
                  <>
                    <Label size="bodyMedium">Default scope</Label>
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      <Choice
                        label="No role override"
                        selected={field.value === null}
                        disabled={work.busy}
                        onPress={() => field.onChange(null)}
                      />
                      {(["self", "created", "assigned", "all"] as const).map(
                        (scope) => (
                          <Choice
                            key={scope}
                            label={
                              !id
                                ? (creation.data?.scope_options[scope] ?? scope)
                                : t(
                                    scope === "all"
                                      ? "allScope"
                                      : scope === "created"
                                        ? "createdScope"
                                        : scope,
                                  )
                            }
                            selected={field.value === scope}
                            disabled={work.busy}
                            onPress={() => field.onChange(scope)}
                          />
                        ),
                      )}
                    </View>
                    {fieldState.error?.message && (
                      <Label accessibilityLiveRegion="polite">
                        {fieldState.error.message}
                      </Label>
                    )}
                  </>
                )}
              />
            </Card>
          )}
          {authorized && (!ready || stale) && (
            <Card>
              <Label accessibilityLiveRegion="polite">
                Access options changed or are unavailable. Refresh before
                saving.
              </Label>
              <Button
                label="Refresh access options"
                variant="secondary"
                onPress={() =>
                  void (async () => {
                    await session.refresh();
                    await creation.refetch();
                    if (id) await query.refetch();
                    setStale(false);
                  })()
                }
              />
            </Card>
          )}
          {!authorized && (
            <Label accessibilityLiveRegion="polite">{t("forbiddenHint")}</Label>
          )}
          {(id || permissionEditor) && (
            <RolePermissionPanel
              modal={!id}
              close={() => setPermissionEditor(false)}
            >
              <Input
                label={t("permissionSearch")}
                hideLabel
                leading={<Search size={18} color={colors.text.secondary} />}
                placeholder={t("permissionSearch")}
                value={search}
                onChangeText={setSearch}
                maxLength={100}
              />
              <Label size="title">{t("permissions")}</Label>
              {!groups.size && !fields.length && <Label>{t("empty")}</Label>}
              {[...groups].map(([group, keys]) => (
                <View
                  key={group}
                  testID={`permission-group-${group}`}
                  style={{ gap: 12 }}
                >
                  <Card style={{ gap: 0, paddingVertical: 12 }}>
                    <Label
                      size="captionMedium"
                      tone="secondary"
                      accessibilityRole="header"
                    >
                      {groupLabel(group)}
                    </Label>
                    {keys.map((key) => (
                      <View key={key} style={{ gap: 6 }}>
                        <ToggleRow
                          label={permissionLabel(key)}
                          hint={t(
                            values.grants.includes(key)
                              ? "permissionGranted"
                              : "permissionNotGranted",
                          )}
                          value={values.grants.includes(key)}
                          disabled={
                            !canEdit ||
                            work.busy ||
                            (!values.grants.includes(key) &&
                              !context?.delegatable?.[key]?.length)
                          }
                          onChange={() => {
                            if (!canEdit || work.busy) return;
                            const adding = !values.grants.includes(key);
                            const firstScope = context?.delegatable?.[key]?.[0];
                            if (adding && !firstScope) return;
                            form.setValue(
                              "grants",
                              values.grants.includes(key)
                                ? values.grants.filter((value) => value !== key)
                                : [...values.grants, key],
                              { shouldDirty: true },
                            );
                            if (
                              adding &&
                              firstScope &&
                              !context?.delegatable?.[key]?.includes(
                                values.scopes[key]!,
                              )
                            )
                              form.setValue(
                                "scopes",
                                { ...values.scopes, [key]: firstScope },
                                { shouldDirty: true },
                              );
                          }}
                        />
                        {!!context?.delegatable?.[key]?.length &&
                          values.grants.includes(key) && (
                            <View
                              testID={`role-scopes-${key}`}
                              style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                              }}
                            >
                              {(context.delegatable![key] ?? []).map(
                                (scope) => (
                                  <Choice
                                    key={scope}
                                    label={t(
                                      scope === "all"
                                        ? "allScope"
                                        : scope === "created"
                                          ? "createdScope"
                                          : scope,
                                    )}
                                    selected={values.scopes[key] === scope}
                                    disabled={!canEdit || work.busy}
                                    onPress={() =>
                                      form.setValue(
                                        "scopes",
                                        {
                                          ...values.scopes,
                                          [key]: scope,
                                        },
                                        {
                                          shouldDirty: true,
                                        },
                                      )
                                    }
                                  />
                                ),
                              )}
                            </View>
                          )}
                      </View>
                    ))}
                  </Card>
                </View>
              ))}
              {!!fields.length && <Label size="title">{t("fields")}</Label>}
              {fields.map(([key, label]) => (
                <Card key={key}>
                  <Label>{label}</Label>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {(["view", "edit"] as const).map((mode) => (
                      <Choice
                        key={mode}
                        label={t(mode) + ": " + label}
                        selected={!!values.fields[key]?.[mode]}
                        disabled={
                          !canEdit ||
                          work.busy ||
                          (!values.fields[key]?.[mode] &&
                            (!context?.field_delegatable?.[key]?.[mode] ||
                              (mode === "edit" &&
                                !values.fields[key]?.view &&
                                !context?.field_delegatable?.[key]?.view)))
                        }
                        onPress={() => {
                          const old = values.fields[key] ?? {
                            view: false,
                            edit: false,
                          };
                          const next = {
                            ...old,
                            [mode]: !old[mode],
                          };
                          if (mode === "edit" && next.edit) next.view = true;
                          if (mode === "view" && !next.view) next.edit = false;
                          form.setValue(
                            "fields",
                            {
                              ...values.fields,
                              [key]: next,
                            },
                            { shouldDirty: true },
                          );
                        }}
                      />
                    ))}
                  </View>
                </Card>
              ))}
            </RolePermissionPanel>
          )}
          {!!work.error && <ErrorState error={work.error} />}
          {canEdit && id && (
            <Button
              label={t("deleteRole")}
              variant="danger"
              onPress={() => void remove()}
              disabled={work.busy || form.formState.isSubmitting}
            />
          )}
          <Button
            label={t("cancel")}
            variant="tertiary"
            disabled={work.busy}
            onPress={() => router.back()}
          />
        </FeaturePane>
      </Screen>
    </Access>
  );
}
