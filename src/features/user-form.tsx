import { UserPlus, Check } from "lucide-react-native";
import { FormIntro } from "@/components/form-intro";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Switch, View, useWindowDimensions } from "react-native";
import { useTheme } from "@/theme";
import { router } from "expo-router";
import { z } from "zod";
import { api, ApiError, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope, userSchema } from "@/api/runtime";
import {
  targetSchema,
  creationSchema,
  passwordLinkUserCreateSchema,
} from "@/api/contracts";
import type { UserRecord } from "@/api/runtime";
import { useBootstrap } from "@/auth/session";
import { useFeatureAction } from "@/features/use-feature-action";
import { applyFieldErrors, useDiscard, useTitle } from "@/components/forms";
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
import { namePayload } from "./user-payload";
import { useFeatureWork } from "./use-feature-work";
import { Choice as Chip } from "./choice";
import { SelectionField } from "@/components/selection-field";
type Values = {
  name: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: "enabled" | "disabled";
  lifecycle_status: "active" | "pending" | "suspended" | "disabled";
  role_ids: number[];
  owner: boolean;
};
export default function UserForm({ id }: { id?: string }) {
  const snapshot = useBootstrap();
  return (
    <UserFormEditor
      key={[
        snapshot.account.id,
        snapshot.access_revision,
        snapshot.configuration_revision,
        snapshot.availability_revision,
        id ?? "new",
      ].join(":")}
      id={id}
    />
  );
}
function UserFormEditor({ id }: { id?: string }) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const snapshot = useBootstrap();
  const runAction = useFeatureAction();
  const work = useFeatureWork();
  const { error } = work;
  const [saved, setSaved] = useState(false);
  const [created, setCreated] = useState<UserRecord | null>(null);
  useTitle(id ? "Edit details" : "New user");
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
    !!id && !!snapshot.features["api.enabled"] && !!snapshot.modules.users,
  );
  const creation = useRead(
    "user-create",
    null,
    async (signal) =>
      unwrap(
        await api.GET("/v1/mobile/users/create-context", { signal }),
        envelope(creationSchema),
      ).data,
    !id &&
      !!snapshot.features["api.enabled"] &&
      !!snapshot.actions["users.create"] &&
      !!snapshot.features["account.email.enabled"] &&
      !!snapshot.features["account.recovery.enabled"],
  );
  const roleOptions = id
    ? query.data?.role_options
    : creation.data?.role_options;
  const form = useForm<Values>({
    defaultValues: {
      name: "",
      email: "",
      first_name: "",
      last_name: "",
      phone: "",
      status: "enabled",
      lifecycle_status: "pending",
      role_ids: [],
      owner: false,
    },
  });
  useDiscard(form.formState.isDirty && !saved);
  useEffect(() => {
    if (query.data) {
      form.reset(
        {
          name: query.data.user.name ?? "",
          email: query.data.user.email ?? "",
          first_name: query.data.user.first_name ?? "",
          last_name: query.data.user.last_name ?? "",
          phone: query.data.user.phone ?? "",
          status: query.data.user.status ?? "enabled",
          role_ids: query.data.user.roles?.map((role) => Number(role.id)) ?? [],
          lifecycle_status:
            query.data.user.lifecycle_status === "archived"
              ? "disabled"
              : (query.data.user.lifecycle_status ??
                (query.data.user.status === "enabled" ? "active" : "disabled")),
          owner: query.data.governance?.owner ?? false,
        },
        { keepDirtyValues: true },
      );
    }
  }, [query.data, form, id]);
  const dirtyFields = form.formState.dirtyFields;
  const editable = (field: string) =>
    snapshot.fields[field]?.edit &&
    (!id ||
      !["status", "roles"].includes(field) ||
      !(query.data?.governance?.owner || query.data?.user.is_owner)) &&
    (field !== "status" || !id || query.data?.actions.status) &&
    (field !== "roles" ||
      (snapshot.actions["users.roles"] && (!id || query.data?.actions.roles)));
  const submit = form.handleSubmit((values) =>
    work.run(
      async (scope) => {
        const body: Record<string, unknown> = namePayload(
          values,
          dirtyFields,
          editable,
          !id,
        );
        for (const key of ["email", "phone"] as const)
          if (editable(key) && (!id || form.formState.dirtyFields[key]))
            body[key] = values[key] || null;
        if (
          id &&
          query.data?.user.lifecycle_status &&
          editable("status") &&
          dirtyFields.lifecycle_status
        )
          body.lifecycle_status = values.lifecycle_status;
        else if (id && editable("status") && form.formState.dirtyFields.status)
          body.status = values.status;
        if (editable("roles") && (!id || form.formState.dirtyFields.role_ids))
          body.role_ids = values.role_ids;
        if (
          id &&
          query.data?.actions.owner &&
          query.data.governance?.membership_change_allowed
        )
          if ((!id && values.owner) || form.formState.dirtyFields.owner)
            body.owner = values.owner;
        const result = await runAction(
          scope,
          id ? "PUT" : "POST",
          id ? `/api/v1/users/${id}` : "/api/v1/users",
          async (signal) =>
            id
              ? unwrap(
                  await api.PUT("/v1/users/{user}", {
                    params: { path: { user: Number(id) } },
                    body,

                    signal,
                  }),
                  envelope(userSchema),
                )
              : unwrap(
                  await api.POST("/v1/users", {
                    body: passwordLinkUserCreateSchema.parse({
                      first_name: values.first_name.trim(),
                      last_name: values.last_name.trim(),
                      email: values.email,
                      phone: values.phone.trim(),
                      lifecycle_status: editable("status")
                        ? values.lifecycle_status
                        : "pending",
                      role_ids: editable("roles") ? values.role_ids : [],
                      provisioning: "password_link",
                    }),

                    signal,
                  }),
                  envelope(userSchema),
                ),
        );
        scope.assertCurrent();
        setSaved(true);
        form.reset(values);
        if (id) router.back();
        else setCreated(result.data);
      },
      (failure) => applyFieldErrors(form, failure, Object.keys(values)),
    ),
  );
  if (
    !snapshot.features["api.enabled"] ||
    (id && !snapshot.modules.users) ||
    (!id && !snapshot.actions["users.create"])
  )
    return (
      <Screen>
        <ErrorState error={new ApiError(403, {}, null)} />
      </Screen>
    );
  if (
    !id &&
    (!["first_name", "last_name", "email", "phone"].every(editable) ||
      !snapshot.features["account.email.enabled"] ||
      !snapshot.features["account.recovery.enabled"])
  )
    return (
      <Screen>
        <ErrorState error={new ApiError(403, {}, null)} />
      </Screen>
    );
  if (created)
    return (
      <Screen scroll>
        <Card>
          <Label size="title" accessibilityRole="header">
            User created
          </Label>
          <Label>Password setup was requested by email.</Label>
          <Label>
            Pending accounts still require administrator activation after
            password setup.
          </Label>
          {snapshot.modules.users && (
            <Button
              label={t("detail")}
              onPress={() => router.replace(`/users/${created.id}`)}
            />
          )}
          <Button label="Done" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  if ((id && query.isPending) || (!id && creation.isPending))
    return <Loading />;
  if ((id && query.error) || (!id && creation.error))
    return (
      <Screen>
        <ErrorState
          error={id ? query.error : creation.error}
          retry={() => void (id ? query.refetch() : creation.refetch())}
        />
      </Screen>
    );
  if (
    (id && !query.data?.actions.update) ||
    (!id && !snapshot.actions["users.create"])
  )
    return (
      <Screen>
        <ErrorState error={new ApiError(403, {}, null)} />
      </Screen>
    );
  return (
    <Access {...(id ? { module: "users" } : { action: "users.create" })}>
      <Screen
        scroll
        contentStyle={{
          maxWidth:
            width >= 840 && height >= 480 ? 550 : width >= 600 ? 540 : 760,
        }}
        footer={
          <Button
            label={id ? t("save") : "Create user"}
            icon={<Check size={20} color="#FFFFFF" />}
            iconPosition="after"
            onPress={() => void submit()}
            loading={work.busy}
            disabled={!!id && !form.formState.isDirty}
          />
        }
      >
        {id ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 15,
              borderRadius: 18,
              backgroundColor: colors.brand.primarySoft,
              marginBottom: 6,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.brand.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Label size="bodyMedium" style={{ color: colors.brand.primary }}>
                {(query.data?.user.name ?? "")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </Label>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Label size="bodyMedium">
                {query.data?.user.name ?? t("editUser")}
              </Label>
              <Label size="secondary" tone="secondary">
                {t("editMemberHint")}
              </Label>
            </View>
          </View>
        ) : (
          <FormIntro
            icon={UserPlus}
            title={t("newMember")}
            subtitle={t("newMemberHint")}
          />
        )}
        <Card
          style={{
            width: "100%",
            maxWidth: 550,
            alignSelf: "center",
            gap: 15,
          }}
          formSection
          heading={t("personalDetails")}
        >
          {(!id
            ? (["first_name", "last_name", "email", "phone"] as const)
            : ([
                ...(!editable("first_name") && !editable("last_name")
                  ? (["name"] as const)
                  : []),
                "first_name",
                "last_name",
                "email",
                "phone",
              ] as const)
          )
            .filter(editable)
            .map((key) => (
              <Controller
                key={key}
                name={key}
                control={form.control}
                rules={{
                  required: !id ? t("validation") : false,
                  maxLength:
                    key === "email"
                      ? 254
                      : key === "phone"
                        ? 32
                        : key === "name"
                          ? 201
                          : 100,
                  validate:
                    key === "email"
                      ? (value) =>
                          (!/[\u0000-\u001f\u007f]/.test(value) &&
                            z
                              .email({ pattern: z.regexes.rfc5322Email })
                              .safeParse(value.trim()).success) ||
                          t("validation")
                      : key === "phone" && !id
                        ? (value) =>
                            /^\+[1-9][0-9]{6,14}$/.test(value.trim()) ||
                            "Use an international number, such as +919876543210."
                        : !id && ["first_name", "last_name"].includes(key)
                          ? (value) => !!value.trim() || t("validation")
                          : undefined,
                }}
                render={({
                  field: { ref, value, onChange, onBlur },
                  fieldState,
                }) => (
                  <Input
                    ref={ref}
                    label={
                      key === "name"
                        ? "Full name"
                        : key === "email"
                          ? "Work email"
                          : t(key)
                    }
                    placeholder={
                      key === "name"
                        ? "e.g. Ananya Kapoor"
                        : key === "email"
                          ? "name@company.com"
                          : key === "first_name"
                            ? id
                              ? "First name"
                              : "e.g. Ananya"
                            : key === "last_name"
                              ? id
                                ? "Last name"
                                : "e.g. Kapoor"
                              : key === "phone"
                                ? "+91 98765 43210"
                                : undefined
                    }
                    help={
                      key === "email" && !id
                        ? "Use their work email address."
                        : key === "phone"
                          ? "Include country code for reliable contact."
                          : undefined
                    }
                    required={!id}
                    value={value}
                    editable={!work.busy}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    keyboardType={
                      key === "email"
                        ? "email-address"
                        : key === "phone"
                          ? "phone-pad"
                          : "default"
                    }
                    autoCapitalize={key === "email" ? "none" : "words"}
                  />
                )}
              />
            ))}
        </Card>
        <Card formSection heading={t("workspaceAccess")} style={{ gap: 15 }}>
          {editable("roles") && roleOptions && (
            <>
              <Controller
                name="role_ids"
                control={form.control}
                rules={{
                  validate: (value) =>
                    (value.length <= 20 &&
                      new Set(value).size === value.length &&
                      value.every((id) =>
                        roleOptions.some((role) => Number(role.id) === id),
                      )) ||
                    t("validation"),
                }}
                render={({ field, fieldState }) => (
                  <SelectionField
                    label="Role"
                    error={fieldState.error?.message}
                    value={roleOptions
                      .filter((role) => field.value.includes(Number(role.id)))
                      .map((role) => role.name)
                      .join(", ")}
                    disabled={work.busy}
                  >
                    {roleOptions.map((role) => (
                      <Chip
                        key={role.id}
                        label={role.name}
                        selected={field.value.includes(Number(role.id))}
                        disabled={work.busy}
                        onPress={() =>
                          field.onChange(
                            field.value.includes(Number(role.id))
                              ? field.value.filter(
                                  (id) => id !== Number(role.id),
                                )
                              : [...field.value, Number(role.id)],
                          )
                        }
                      />
                    ))}
                  </SelectionField>
                )}
              />
            </>
          )}
          {(!id || query.data?.user.lifecycle_status) && editable("status") ? (
            <Controller
              name="lifecycle_status"
              control={form.control}
              render={({ field, fieldState }) => (
                <SelectionField
                  label="Account status"
                  error={fieldState.error?.message}
                  value={t(field.value)}
                  disabled={work.busy}
                >
                  {(!id
                    ? (["pending", "active"] as const)
                    : (["active", "pending", "suspended", "disabled"] as const)
                  ).map((value) => (
                    <Chip
                      key={value}
                      label={t(value)}
                      selected={field.value === value}
                      disabled={work.busy}
                      onPress={() => field.onChange(value)}
                    />
                  ))}
                </SelectionField>
              )}
            />
          ) : (
            id &&
            editable("status") && (
              <Controller
                name="status"
                control={form.control}
                render={({ field }) => (
                  <SelectionField
                    label="Account status"
                    value={t(field.value)}
                    disabled={work.busy}
                  >
                    {(["enabled", "disabled"] as const).map((value) => (
                      <Chip
                        key={value}
                        label={t(value)}
                        selected={field.value === value}
                        disabled={work.busy}
                        onPress={() => field.onChange(value)}
                      />
                    ))}
                  </SelectionField>
                )}
              />
            )
          )}
          {!id && (
            <Label size="caption" tone="secondary">
              A password setup link will be sent by email. Pending accounts
              require administrator activation.
            </Label>
          )}
          {id && query.data?.actions.owner && query.data.governance && (
            <>
              <Label>{t("ownerMembership")}</Label>
              <Controller
                name="owner"
                control={form.control}
                render={({ field, fieldState }) => (
                  <>
                    <Switch
                      style={{ minHeight: 48 }}
                      accessibilityLabel={t("ownerMembership")}
                      value={field.value}
                      disabled={
                        work.busy ||
                        (!!id &&
                          !query.data?.governance?.membership_change_allowed)
                      }
                      onValueChange={field.onChange}
                    />
                    {!!fieldState.error && (
                      <Label accessibilityLiveRegion="polite">
                        {fieldState.error.message}
                      </Label>
                    )}
                  </>
                )}
              />
              <Label size="caption" tone="secondary">
                {t(
                  id && !query.data?.governance?.membership_change_allowed
                    ? "ownerMembershipBlocked"
                    : "ownerMembershipHint",
                )}
              </Label>
            </>
          )}
          {!!error && <ErrorState error={error} />}
          <Button
            label={t("cancel")}
            variant="tertiary"
            onPress={() => router.back()}
            disabled={work.busy}
          />
        </Card>
      </Screen>
    </Access>
  );
}
