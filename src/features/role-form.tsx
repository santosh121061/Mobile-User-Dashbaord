import { ShieldCheck, Search, Check } from "lucide-react-native";
import { ToggleRow, permissionLabel } from "@/components/details";
import { FormIntro } from "@/components/form-intro";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Controller, useForm, useWatch } from "react-hook-form";
import { router } from "expo-router";
import { api, ApiError, check, unwrap } from "@/api/client";
import { envelope } from "@/api/runtime";
import { roleSchema } from "@/api/contracts";
import { useRead } from "@/api/hooks";
import { useBootstrap } from "@/auth/session";
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
import { useFeatureConfirmation } from "./use-feature-confirmation";
import { useFeatureWork } from "./use-feature-work";
import { t } from "@/localization";

type Values = {
  name: string;
  grants: string[];
  scopes: Record<string, string>;
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

export default function RoleForm({ id }: { id?: string }) {
  const snapshot = useBootstrap();
  return <RoleEditor key={snapshot.account.id + ":" + (id ?? "new")} id={id} />;
}
function RoleEditor({ id }: { id?: string }) {
  const { width, height } = useWindowDimensions();
  const formWidth =
    width >= 840 && height >= 480 ? 550 : width >= 600 ? 540 : 560;
  const { colors } = useTheme();
  const snapshot = useBootstrap();
  const confirm = useFeatureConfirmation();
  const work = useFeatureWork();
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [permissionEditor, setPermissionEditor] = useState(false);
  useTitle(id ? "Role details" : "New role");
  const query = useRead(
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
    !!id && !!snapshot.modules.roles,
  );
  const form = useForm<Values>({
    defaultValues: {
      name: "",
      grants: [],
      scopes: {},
      fields: Object.fromEntries(
        Object.keys(snapshot.fields).map((key) => [
          key,
          { view: false, edit: false },
        ]),
      ),
    },
  });
  useDiscard(form.formState.isDirty && !saved);
  const dirtyFields = form.formState.dirtyFields;
  useEffect(() => {
    if (!query.data) return;
    form.reset(
      {
        name: query.data.name,
        grants: query.data.grants,
        scopes: Object.fromEntries(
          query.data.scopes.map((rule) => [rule.name, rule.scope]),
        ),
        fields: Object.fromEntries(
          Object.keys(snapshot.fields).map((key) => {
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
  }, [query.data, form, snapshot.fields]);
  const canEdit = !!snapshot.actions["roles.manage"];
  const watched = useWatch({ control: form.control });
  const values: Values = {
    name: watched.name ?? "",
    grants: watched.grants ?? [],
    scopes: (watched.scopes as Values["scopes"]) ?? {},
    fields: (watched.fields as Values["fields"]) ?? {},
  };
  const filter = search.trim().toLocaleLowerCase();
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(snapshot.actions)) {
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
  const fields = Object.entries(snapshot.fields).filter(
    ([key, rule]) =>
      !filter || (key + " " + rule.label).toLocaleLowerCase().includes(filter),
  );
  const submit = form.handleSubmit((body) =>
    work.run(
      async (scope) => {
        await confirm(
          scope,
          id ? "PUT" : "POST",
          id ? `/api/v1/roles/${id}` : "/api/v1/roles",
          async (signal) =>
            check(
              id
                ? await api.PUT("/v1/roles/{role}", {
                    params: { path: { role: id } },
                    body,

                    signal,
                  })
                : await api.POST("/v1/roles", {
                    body,

                    signal,
                  }),
            ),
        );
        scope.assertCurrent();
        setSaved(true);
        form.reset(body);
        router.back();
      },
      (failure) => applyFieldErrors(form, failure, ["name"]),
    ),
  );
  const remove = () =>
    work.run(async (scope) => {
      if (!id) return;
      await confirm(scope, "DELETE", `/api/v1/roles/${id}`, async (signal) =>
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
  if ((id && !snapshot.modules.roles) || (!id && !canEdit))
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
          <Card style={{ padding: 18, gap: 17 }}>
            {!id && <Label size="bodyMedium">Role details</Label>}
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
          </Card>
          {!id && (
            <Card style={{ padding: 18, gap: 17 }}>
              <Label size="bodyMedium">Starting permissions</Label>
              <Button
                label="Choose permissions"
                variant="secondary"
                onPress={() => setPermissionEditor(true)}
              />
              <Label size="caption" tone="secondary">
                Review individual permissions before creating the role.
              </Label>
            </Card>
          )}
          {!canEdit && (
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
                          disabled={!canEdit || work.busy}
                          onChange={() =>
                            form.setValue(
                              "grants",
                              values.grants.includes(key)
                                ? values.grants.filter((value) => value !== key)
                                : [...values.grants, key],
                              { shouldDirty: true },
                            )
                          }
                        />
                        {key.startsWith("users.") &&
                          values.grants.includes(key) && (
                            <View
                              testID={`role-scopes-${key}`}
                              style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                              }}
                            >
                              {(
                                ["self", "created", "assigned", "all"] as const
                              ).map((scope) => (
                                <Choice
                                  key={scope}
                                  label={t(
                                    scope === "all"
                                      ? "allScope"
                                      : scope === "created"
                                        ? "createdScope"
                                        : scope,
                                  )}
                                  selected={
                                    (values.scopes[key] ?? "self") === scope
                                  }
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
                              ))}
                            </View>
                          )}
                      </View>
                    ))}
                  </Card>
                </View>
              ))}
              {!!fields.length && <Label size="title">{t("fields")}</Label>}
              {fields.map(([key, rule]) => (
                <Card key={key}>
                  <Label>{rule.label}</Label>
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
                        label={t(mode) + ": " + rule.label}
                        selected={!!values.fields[key]?.[mode]}
                        disabled={!canEdit || work.busy}
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
