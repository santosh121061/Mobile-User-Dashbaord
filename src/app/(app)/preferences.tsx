import { Sheet } from "@/components/sheet";
import { Globe, CalendarDays, Fingerprint, Bell } from "lucide-react-native";
import { ToggleRow } from "@/components/details";
import { ThemeChoice } from "@/components/theme-choice";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { profileSchema } from "@/api/contracts";
import { useBootstrap, useSession } from "@/auth/session";
import { applyFieldErrors, useDiscard, useTitle } from "@/components/forms";
import { useTheme } from "@/theme";
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
import { useFeatureWork } from "@/features/use-feature-work";
import { Choice } from "@/features/choice";
import { FeaturePane } from "@/features/feature-pane";
import { t } from "@/localization";
import { PushPreferences } from "@/push/preferences";

export default function Preferences() {
  const snapshot = useBootstrap();
  useTitle("Preferences");
  return <PreferencesEditor key={snapshot.account.id} />;
}
function PreferencesEditor() {
  const session = useSession();
  const theme = useTheme();
  const snapshot = useBootstrap();
  const work = useFeatureWork();
  const [message, setMessage] = useState("");
  const [regionOpen, setRegionOpen] = useState(false);
  const form = useForm({
    defaultValues: {
      timezone: snapshot.appearance.timezone ?? "UTC",
      date_format: snapshot.appearance.date_format ?? "d M Y",
    },
  });
  useDiscard(form.formState.isDirty);
  useEffect(() => {
    form.reset(
      {
        timezone: snapshot.appearance.timezone ?? "UTC",
        date_format: snapshot.appearance.date_format ?? "d M Y",
      },
      { keepDirtyValues: true },
    );
  }, [snapshot.appearance.timezone, snapshot.appearance.date_format, form]);
  const dirty = form.formState.dirtyFields;
  const securityEnabled =
    !!snapshot.features["notifications.security_email.enabled"];
  const profile = useRead(
    "profile",
    null,
    async (signal) =>
      unwrap(await api.GET("/v1/profile", { signal }), envelope(profileSchema))
        .data,
    securityEnabled,
  );
  const select = (mode: "light" | "dark" | "system") =>
    work.run(async (scope) => {
      check(
        await api.PATCH("/v1/profile/preferences", {
          body: { theme: mode },
          signal: scope.signal,
        }),
      );
      scope.assertCurrent();
      theme.setMode(mode);
      setMessage(t("saved"));
      await session.refresh();
    });
  const save = form.handleSubmit((body) =>
    work.run(
      async (scope) => {
        check(
          await api.PATCH("/v1/profile/preferences", {
            body,
            signal: scope.signal,
          }),
        );
        scope.assertCurrent();
        form.reset(body);
        setRegionOpen(false);
        setMessage(t("saved"));
        await session.refresh();
      },
      (failure) => applyFieldErrors(form, failure, ["timezone", "date_format"]),
    ),
  );
  const security = (enabled: boolean) =>
    work.run(async (scope) => {
      check(
        await api.PATCH("/v1/profile/notification-preferences", {
          body: { email_security: enabled },
          signal: scope.signal,
        }),
      );
      scope.assertCurrent();
      setMessage(t("saved"));
      await profile.refetch();
    });
  return (
    <Screen scroll>
      <FeaturePane wide>
        <View style={{ gap: 10 }}>
          <View style={{ minHeight: 27, justifyContent: "center" }}>
            <Label accessibilityRole="header" size="title">
              {t("appearance")}
            </Label>
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {(["light", "dark", "system"] as const).map((mode) => (
              <ThemeChoice
                mode={mode}
                key={mode}
                selected={theme.mode === mode}
                disabled={work.busy}
                onPress={() => void select(mode)}
              />
            ))}
          </View>
        </View>
        <View
          style={{ minHeight: 27, justifyContent: "center", marginTop: 10 }}
        >
          <Label size="title">Region</Label>
        </View>
        <View>
          <Row
            title={t("timezone")}
            subtitle={snapshot.appearance.timezone ?? "UTC"}
            leading={<Globe size={24} color={theme.colors.brand.primary} />}
            onPress={() => setRegionOpen(true)}
          />
          <Row
            title={t("dateFormat")}
            subtitle={snapshot.appearance.date_format ?? "d M Y"}
            leading={
              <CalendarDays size={24} color={theme.colors.accent.purple} />
            }
            onPress={() => setRegionOpen(true)}
          />
        </View>
        {regionOpen && (
          <Sheet
            title="Region"
            close={() => {
              if (!work.busy) setRegionOpen(false);
            }}
          >
            <Controller
              name="timezone"
              control={form.control}
              rules={{ required: t("validation") }}
              render={({ field, fieldState }) => (
                <Input
                  ref={field.ref}
                  label={t("timezone")}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  editable={!work.busy}
                  autoCapitalize="none"
                  error={fieldState.error?.message}
                />
              )}
            />
            <Label size="captionMedium">{t("dateFormat")}</Label>
            <Controller
              name="date_format"
              control={form.control}
              render={({ field }) => (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {(["d M Y", "d/m/Y", "m/d/Y"] as const).map((value) => (
                    <Choice
                      key={value}
                      label={value}
                      selected={field.value === value}
                      disabled={work.busy}
                      onPress={() => field.onChange(value)}
                    />
                  ))}
                </View>
              )}
            />
            <Button
              label={t("save")}
              disabled={!Object.keys(dirty).length}
              loading={work.busy}
              onPress={() => void save()}
            />
            <Button
              label={t("back")}
              variant="tertiary"
              disabled={work.busy}
              onPress={() => setRegionOpen(false)}
            />
          </Sheet>
        )}
        <View
          style={{ minHeight: 27, justifyContent: "center", marginTop: 10 }}
        >
          <Label size="title">Device security</Label>
        </View>
        <Card>
          <ToggleRow
            label={t("biometrics")}
            icon={Fingerprint}
            value={session.biometric}
            disabled={work.busy}
            onChange={(enabled) =>
              void work.run(async (scope) => {
                const success = await session.setBiometric(enabled);
                scope.assertCurrent();
                if (!success) throw new Error(t("biometricsUnavailable"));
              })
            }
          />
        </Card>
        <View
          style={{ minHeight: 27, justifyContent: "center", marginTop: 10 }}
        >
          <Label size="title">Notifications</Label>
        </View>
        <PushPreferences />
        <Card>
          <Label accessibilityRole="header" size="title">
            {t("notificationPreferences")}
          </Label>
          {securityEnabled ? (
            profile.isPending ? (
              <Loading />
            ) : profile.error ? (
              <ErrorState
                error={profile.error}
                retry={() => void profile.refetch()}
              />
            ) : (
              profile.data && (
                <>
                  <ToggleRow
                    label={t("securityEmails")}
                    icon={Bell}
                    value={profile.data.email_security}
                    disabled={work.busy}
                    onChange={(enabled) => void security(enabled)}
                  />
                  <Label size="caption" tone="secondary">
                    {t("securityEmailHint")}
                  </Label>
                </>
              )
            )
          ) : (
            <Label>{t("securityEmailDisabled")}</Label>
          )}
          <Label size="caption" tone="secondary">
            {t(
              snapshot.features["notifications.in_app.enabled"]
                ? "inboxEnabled"
                : "inboxDisabled",
            )}
          </Label>
        </Card>
        {!!message && <Label accessibilityLiveRegion="polite">{message}</Label>}
        {!!work.error && <ErrorState error={work.error} />}
      </FeaturePane>
    </Screen>
  );
}
