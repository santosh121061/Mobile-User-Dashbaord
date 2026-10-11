import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api, ApiError, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { accessSchema, directAccessWriteSchema } from "@/api/contracts";
import { useBootstrap, useSession } from "@/auth/session";
import {
  activeEntries,
  availabilityMatches,
  capabilityAvailable,
  catalogEntries,
  staleAvailability,
} from "@/api/availability";
import { useFeatureAction } from "@/features/use-feature-action";
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
import { FormIntro } from "@/components/form-intro";
import { ShieldCheck } from "lucide-react-native";
import { EffectiveAccess } from "@/features/effective-access";
import { useFeatureWork } from "@/features/use-feature-work";
import { Choice as Chip } from "@/features/choice";
import { FeaturePane } from "@/features/feature-pane";
type Effect = "inherit" | "allow" | "deny";
type Fields = Record<string, { view: Effect; edit: Effect }>;
export default function UserAccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const snapshot = useBootstrap();
  useTitle("User access");
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
    !!snapshot.features["api.enabled"] &&
      !!snapshot.modules.users &&
      !!snapshot.actions["access.manage"],
  );
  if (!snapshot.features["api.enabled"] || !snapshot.actions["access.manage"])
    return (
      <Screen>
        <ErrorState error={new ApiError(403, {}, null)} />
      </Screen>
    );
  return (
    <Access module="users">
      {query.isPending ? (
        <Screen>
          <Loading />
        </Screen>
      ) : query.error ? (
        <Screen>
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        </Screen>
      ) : (
        query.data && (
          <AccessEditor
            key={[
              snapshot.account.id,
              snapshot.access_revision,
              snapshot.configuration_revision,
              snapshot.availability_revision,
              query.data.availability_revision,
              id,
            ].join(":")}
            id={id}
            data={query.data}
            refresh={() => query.refetch()}
          />
        )
      )}
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
  const sourceRules = delegation ? data.delegation?.rules : undefined;
  const sourceFields = delegation ? data.delegation?.fields : data.fields;
  const permissionKeys = new Set([
    ...Object.keys(data.catalog),
    ...(delegation
      ? (sourceRules?.map((rule) => rule.name) ?? [])
      : [...Object.keys(data.effects), ...Object.keys(data.scopes)]),
  ]);
  for (const key of permissionKeys) {
    effectMap[key] = delegation
      ? data.delegation?.rules.some((rule) => rule.name === key)
        ? "allow"
        : "deny"
      : (data.effects[key] ?? "inherit");
    scopeMap[key] = delegation
      ? (data.delegation?.rules.find((rule) => rule.name === key)?.scope ??
        data.delegatable[key]?.[0] ??
        "self")
      : (data.scopes[key] ?? "inherit");
  }
  const fieldKeys = new Set([
    ...Object.keys(data.field_catalog),
    ...(sourceFields
      ?.filter(
        (rule) =>
          !delegation ||
          (typeof rule.can_view === "boolean" &&
            typeof rule.can_edit === "boolean"),
      )
      .map((rule) => rule.field) ?? []),
  ]);
  for (const key of fieldKeys) {
    const source = sourceFields?.find((rule) => rule.field === key);
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
  const runAction = useFeatureAction();
  const session = useSession();
  const snapshot = useBootstrap();
  const work = useFeatureWork(data.availability_revision);
  const [stale, setStale] = useState(false);
  const canEdit =
    !!snapshot.features["api.enabled"] &&
    !!snapshot.actions["access.manage"] &&
    availabilityMatches(snapshot, data) &&
    !stale;
  const catalog = activeEntries(data, data.catalog);
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
    } else if (assigned === source.assigned_ids.join(", ")) {
      // Preserve a fresh complete assignment list when only permission rules were edited.
      setAssigned(data.assigned_ids.join(", "));
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
    work.run(
      async (scope) => {
        if (!canEdit) throw new ApiError(403, {}, null);
        const activeEffects = catalogEntries(catalog, effects);
        const activeScopes = catalogEntries(catalog, scopes);
        const visibleFields = catalogEntries(data.field_catalog, fields);
        if (delegation) {
          const body = {
            grants: Object.keys(activeEffects).filter(
              (key) => effects[key] === "allow",
            ),
            scopes: activeScopes,
            availability_revision: data.availability_revision,
            fields: Object.fromEntries(
              Object.entries(visibleFields).map(([key, rule]) => [
                key,
                {
                  view: rule.view === "allow",
                  edit: rule.edit === "allow",
                },
              ]),
            ),
          };
          await runAction(
            scope,
            "PUT",
            `/api/v1/users/${id}/delegation`,
            async (signal) =>
              check(
                await api.PUT("/v1/users/{user}/delegation", {
                  params: { path: { user: Number(id) } },
                  body,

                  signal,
                }),
              ),
          );
        } else {
          const ids = assigned.trim()
            ? assigned.split(",").map((value) => Number(value.trim()))
            : [];
          if (
            ids.some((value) => !Number.isSafeInteger(value) || value < 1) ||
            new Set(ids).size !== ids.length
          )
            throw new Error("Invalid assignments");
          const body = directAccessWriteSchema.parse({
            effects: activeEffects,
            scopes: activeScopes,
            fields: visibleFields,
            assigned_ids: ids,
            availability_revision: data.availability_revision,
            update_mode: "patch",
          });
          await runAction(
            scope,
            "PUT",
            `/api/v1/users/${id}/access`,
            async (signal) =>
              check(
                await api.PUT("/v1/users/{user}/access", {
                  params: { path: { user: Number(id) } },
                  body,

                  signal,
                }),
              ),
          );
        }
        scope.assertCurrent();
        setDirty(false);
        setEditedRevision(data.revision);
        await refresh();
      },
      (failure) => {
        if (staleAvailability(failure)) setStale(true);
      },
    );
  return (
    <Screen
      scroll
      footer={
        <Button
          label={t("save")}
          loading={busy}
          disabled={!dirty || !canEdit}
          onPress={() => void save()}
        />
      }
    >
      <FeaturePane wide>
        <FormIntro
          icon={ShieldCheck}
          title={t("access")}
          subtitle={t("delegationHint")}
          tone="purple"
        />
        {!canEdit && (
          <Card>
            <Label accessibilityLiveRegion="polite">
              Access options changed or are unavailable. Refresh before saving.
            </Label>
            <Button
              label="Refresh access options"
              variant="secondary"
              onPress={() =>
                void (async () => {
                  await session.refresh();
                  await refresh();
                  setStale(false);
                })()
              }
            />
          </Card>
        )}
        {dirty && editedRevision !== data.revision && (
          <Label accessibilityLiveRegion="polite">{t("editChanged")}</Label>
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
        <Label size="section">{t("permissions")}</Label>
        <Label size="caption" tone="secondary">
          {t("delegationHint")}
        </Label>
        {Object.entries(catalog).map(([key, label]) => (
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
                    !canEdit ||
                    (value === "allow" && !data.delegatable[key]?.length)
                  }
                  hint={
                    value === "allow" && !data.delegatable[key]?.length
                      ? t("noDelegation")
                      : undefined
                  }
                  onPress={() => {
                    if (
                      busy ||
                      !canEdit ||
                      (value === "allow" && !data.delegatable[key]?.length)
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
              {[
                ...new Set([
                  ...(!delegation ? ["inherit"] : []),
                  ...(data.delegatable[key] ?? []),
                ]),
              ].map((scope) => (
                <Chip
                  key={scope}
                  label={t(
                    scope === "all"
                      ? "allScope"
                      : scope === "created"
                        ? "createdScope"
                        : (scope as "inherit" | "self" | "assigned"),
                  )}
                  selected={scopes[key] === scope}
                  disabled={busy || !canEdit}
                  onPress={() => {
                    if (busy || !canEdit) return;
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
        <Label size="section">{t("fields")}</Label>
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
                        !canEdit ||
                        (value === "allow" &&
                          !data.field_delegatable[key]?.[mode])
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
                          !canEdit ||
                          (value === "allow" &&
                            !data.field_delegatable[key]?.[mode])
                        )
                          return;
                        setFields((old) => ({
                          ...old,
                          [key]: {
                            view: old[key]?.view ?? "inherit",
                            edit: old[key]?.edit ?? "inherit",
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
            editable={!busy && canEdit}
            onChangeText={(value) => {
              setAssigned(value);
              setDirty(true);
            }}
            keyboardType="numbers-and-punctuation"
          />
        )}
        <EffectiveAccess
          value={data.effective.filter((rule) =>
            capabilityAvailable(data, rule.key),
          )}
        />
        {!!error && <ErrorState error={error} />}
        <Button
          label={t("cancel")}
          variant="tertiary"
          disabled={busy}
          onPress={() => router.back()}
        />
      </FeaturePane>
    </Screen>
  );
}
