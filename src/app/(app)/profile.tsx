import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  LockKeyhole,
  SlidersHorizontal,
  Laptop,
  Bell,
  UserRound,
  Pencil,
} from "lucide-react-native";
import { Controller, useForm } from "react-hook-form";
import { api, ApiError, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { profileSchema } from "@/api/contracts";
import { useBootstrap, useSession } from "@/auth/session";
import {
  Button,
  Card,
  ErrorState,
  Input,
  Label,
  Loading,
  Screen,
  Row,
} from "@/components/ui";
import { applyFieldErrors, useDiscard, useTitle } from "@/components/forms";
import {
  AvatarPicker,
  AvatarView,
  appendAvatar,
  type AvatarAsset,
} from "@/features/avatar";
import { useFeatureWork } from "@/features/use-feature-work";
import { FeaturePane } from "@/features/feature-pane";
import { DetailField } from "@/components/details";
import { Sheet } from "@/components/sheet";
import { t } from "@/localization";
import { useTheme } from "@/theme";
import type { z } from "zod";

type ProfileRecord = z.infer<typeof profileSchema>;
type Values = { first_name: string; last_name: string; phone: string };
const defaults = (profile: ProfileRecord): Values => ({
  first_name: profile.first_name ?? "",
  last_name: profile.last_name ?? "",
  phone: profile.phone ?? "",
});
export default function Profile() {
  useTitle("My profile");
  const snapshot = useBootstrap();
  const query = useRead(
    "profile",
    null,
    async (signal) =>
      unwrap(await api.GET("/v1/profile", { signal }), envelope(profileSchema))
        .data,
  );
  return (
    <Screen scroll contentStyle={{ maxWidth: 660 }}>
      <FeaturePane wide>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          query.data && (
            <ProfileEditor
              key={snapshot.account.id}
              profile={query.data}
              version={query.dataUpdatedAt}
              refresh={() => query.refetch()}
            />
          )
        )}
      </FeaturePane>
    </Screen>
  );
}
function ProfileEditor({
  profile,
  version,
  refresh,
}: {
  profile: ProfileRecord;
  version: number;
  refresh: () => Promise<unknown>;
}) {
  const snapshot = useBootstrap();
  const session = useSession();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const work = useFeatureWork();
  const [avatar, setAvatar] = useState<AvatarAsset | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const changeAvatar = useCallback((asset: AvatarAsset | null) => {
    setAvatar(asset);
    setRemoveAvatar(false);
  }, []);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const form = useForm<Values>({ defaultValues: defaults(profile) });
  useDiscard(form.formState.isDirty || !!avatar || removeAvatar);
  useEffect(() => {
    form.reset(defaults(profile), { keepDirtyValues: true });
  }, [profile, form]);
  const dirty = form.formState.dirtyFields;
  const save = form.handleSubmit((values) =>
    work.run(
      async (scope) => {
        const body = {
          ...values,
          last_name: values.last_name || null,
          phone: values.phone || null,
          timezone: snapshot.appearance.timezone ?? "UTC",
          date_format: snapshot.appearance.date_format ?? "d M Y",
          ...(removeAvatar && snapshot.features["users.avatar.enabled"]
            ? { remove_avatar: true }
            : {}),
        };
        const data = new FormData();
        Object.entries(body).forEach(([key, value]) =>
          data.append(
            key,
            typeof value === "boolean" ? (value ? "1" : "0") : (value ?? ""),
          ),
        );
        if (avatar && snapshot.features["users.avatar.enabled"])
          appendAvatar(data, avatar);
        const result = unwrap(
          await api.POST("/v1/profile/details", {
            body,
            bodySerializer: () => data,
            signal: scope.signal,
          }),
          envelope(profileSchema),
        ).data;
        scope.assertCurrent();
        form.reset(defaults(result));
        changeAvatar(null);
        setMessage(t("saved"));
        await refresh();
        scope.assertCurrent();
        await session.refresh();
      },
      (failure) =>
        applyFieldErrors(form, failure, ["first_name", "last_name", "phone"]),
    ),
  );
  const verify = () =>
    work.run(async (scope) => {
      check(
        await api.POST("/v1/profile/verification", {
          signal: scope.signal,
        }),
      );
      scope.assertCurrent();
      setMessage(t("verificationSent"));
    });
  const links = [
    {
      key: "personal",
      title: t("personalDetails"),
      subtitle: "Update your name and email",
      leading: (
        <UserRound
          size={23}
          strokeWidth={1.9}
          color={colors.status.successText}
        />
      ),
      onPress: () => setEditing(true),
    },
    {
      key: "password",
      title: t("changePassword"),
      subtitle: "Keep your account secure",
      leading: (
        <LockKeyhole size={23} strokeWidth={1.9} color={colors.brand.primary} />
      ),
      onPress: () => router.push("/password"),
    },
    {
      key: "appearance",
      title: "Preferences",
      subtitle: t("preferencesDestinationHint"),
      leading: (
        <SlidersHorizontal
          size={23}
          strokeWidth={1.9}
          color={colors.accent.purple}
        />
      ),
      onPress: () => router.push("/preferences"),
    },
    {
      key: "sessions",
      title: "Active sessions",
      accessibilityLabel: t("sessions"),
      subtitle: "Review your signed-in devices",
      leading: (
        <Laptop size={23} strokeWidth={1.9} color={colors.accent.purple} />
      ),
      onPress: () => router.push("/sessions"),
    },
    ...(snapshot.modules.notifications
      ? [
          {
            key: "notifications",
            title: t("notifications"),
            subtitle: "Your workspace updates",
            leading: (
              <Bell size={23} strokeWidth={1.9} color={colors.accent.gold} />
            ),
            onPress: () => router.push("/notifications"),
          },
        ]
      : []),
  ];
  const linkRows =
    width >= 600
      ? links.reduce<(typeof links)[]>((rows, link, index) => {
          if (index % 2 === 0) rows.push([link]);
          else rows[rows.length - 1]?.push(link);
          return rows;
        }, [])
      : links.map((link) => [link]);
  return (
    <>
      <View
        style={{
          alignItems: "center",
          gap: 0,
          paddingTop: width >= 600 ? 12 : 8,
          paddingBottom: 18,
          marginBottom: -12,
        }}
      >
        <Pressable
          accessibilityRole={
            snapshot.features["users.avatar.enabled"] ? "button" : undefined
          }
          accessibilityLabel={
            snapshot.features["users.avatar.enabled"]
              ? "Edit profile image"
              : undefined
          }
          disabled={!snapshot.features["users.avatar.enabled"] || work.busy}
          onPress={() => setEditing(true)}
        >
          <AvatarView
            available={profile.avatar_available}
            version={version}
            name={profile.name}
            size={88}
          />
          {snapshot.features["users.avatar.enabled"] && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                right: -4,
                bottom: 0,
                width: 38,
                height: 38,
                borderRadius: 19,
                borderWidth: 3,
                borderColor: colors.surface,
                backgroundColor: colors.brand.primaryFill,
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0px 3px 8px rgba(18,103,255,0.12)",
              }}
            >
              <Pencil size={18} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
        <Label
          size="h1"
          style={{ textAlign: "center", marginTop: 12, letterSpacing: -0.65 }}
        >
          {profile.name}
        </Label>
        <Label
          size="secondary"
          tone="secondary"
          style={{ textAlign: "center", marginTop: 3, marginBottom: 9 }}
        >
          {profile.email}
        </Label>
        <View
          style={{
            borderRadius: 9999,
            paddingHorizontal: 12,
            paddingVertical: 4,
            backgroundColor:
              profile.status === "enabled"
                ? colors.status.successSoft
                : colors.surfaceMuted,
          }}
        >
          <Label
            size="micro"
            style={{
              color:
                profile.status === "enabled"
                  ? colors.status.successText
                  : colors.text.secondary,
            }}
          >
            {t(profile.status)}
          </Label>
        </View>
      </View>
      <Card
        style={{
          padding: 16,
          borderColor: colors.border + "99",
          boxShadow: "none",
        }}
      >
        <DetailField label="Full name" value={profile.name} />
        <DetailField label="Email address" value={profile.email} />
      </Card>
      <View style={{ gap: width >= 600 ? 10 : 8, marginTop: 2 }}>
        {linkRows.map((row, index) => (
          <View key={index} style={{ flexDirection: "row", gap: 10 }}>
            {row.map(({ key, ...link }) => (
              <View key={key} style={{ flex: 1, minWidth: 0 }}>
                <Row
                  leadingSize={38}
                  {...link}
                  onPress={work.busy ? undefined : link.onPress}
                  style={{ marginBottom: 0 }}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
      {editing && (
        <Sheet
          title={t("personalDetails")}
          closeDisabled={work.busy}
          close={() => {
            if (!work.busy) setEditing(false);
          }}
        >
          <Card>
            <Label size="section">{t("personalDetails")}</Label>
            <Input
              label={t("email")}
              value={profile.email}
              editable={false}
              keyboardType="email-address"
            />
            {(["first_name", "last_name", "phone"] as const).map((key) => (
              <Controller
                key={key}
                name={key}
                control={form.control}
                rules={{
                  required: key === "first_name" ? t("validation") : false,
                  maxLength: {
                    value: key === "phone" ? 32 : 100,
                    message: t("validation"),
                  },
                }}
                render={({ field, fieldState }) => (
                  <Input
                    ref={field.ref}
                    label={t(key)}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    editable={!work.busy}
                    error={fieldState.error?.message}
                    keyboardType={key === "phone" ? "phone-pad" : "default"}
                    autoCapitalize={key === "phone" ? "none" : "words"}
                  />
                )}
              />
            ))}
            <AvatarPicker
              enabled={!!snapshot.features["users.avatar.enabled"]}
              value={avatar}
              onChange={changeAvatar}
              disabled={work.busy}
            />
            {snapshot.features["users.avatar.enabled"] &&
              profile.avatar_available && (
                <Button
                  variant="secondary"
                  label={t(
                    removeAvatar ? "cancelAvatarRemoval" : "removeAvatar",
                  )}
                  disabled={work.busy}
                  onPress={() => {
                    setAvatar(null);
                    setRemoveAvatar(!removeAvatar);
                  }}
                />
              )}
            {removeAvatar && snapshot.features["users.avatar.enabled"] && (
              <Label accessibilityLiveRegion="polite">
                {t("avatarRemovalPending")}
              </Label>
            )}
            <Button
              label={t("save")}
              loading={work.busy}
              disabled={!Object.keys(dirty).length && !avatar && !removeAvatar}
              onPress={() => void save()}
            />
            {!!message && (
              <Label accessibilityLiveRegion="polite">{message}</Label>
            )}
            {!!work.error && <ErrorState error={work.error} />}
            {work.error instanceof ApiError &&
              !!work.error.fields.avatar?.[0] && (
                <Label accessibilityLiveRegion="polite">
                  {work.error.fields.avatar[0]}
                </Label>
              )}
            <Button
              label={t("back")}
              variant="tertiary"
              disabled={work.busy}
              onPress={() => setEditing(false)}
            />
          </Card>
        </Sheet>
      )}
      {!profile.email_verified_at &&
        snapshot.features["account.verification.enabled"] && (
          <Button
            label={t("verification")}
            variant="secondary"
            disabled={work.busy}
            onPress={() => void verify()}
          />
        )}
    </>
  );
}
