import { AuthArtwork, AuthHeading } from "@/components/chrome";
import { Brand } from "@/components/brand";
import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sun,
  Moon,
  ArrowRight,
  ShieldCheck,
} from "lucide-react-native";
import { IconButton } from "@/components/visuals";
import { loginFeedback } from "@/auth/login-feedback";
import { AuthFrame } from "@/components/auth-frame";
import { useForm, Controller } from "react-hook-form";
import { useRouter } from "expo-router";
import { z } from "zod";
import { useSession } from "@/auth/session";
import { api, unwrap } from "@/api/client";
import {
  Button,
  Card,
  ErrorState,
  Input,
  Label,
  Screen,
} from "@/components/ui";
import { t } from "@/localization";
import { useTheme } from "@/theme";
import { takeResetNotice } from "@/auth/intents";
import { recoveryText } from "@/localization/recovery";
export default function Login() {
  const {
    signIn,
    phase,
    unlock,
    logout,
    biometric,
    features,
    unavailableError,
    refresh,
  } = useSession();
  const router = useRouter();
  const { colors, dark, setMode } = useTheme();
  const { width, height } = useWindowDimensions();
  const authMaxWidth =
    width >= 840 && height >= 480 ? 550 : width >= 600 ? 540 : 480;
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    getValues,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { email: "", password: "" } });
  const [error, setFailure] = useState<unknown>(null);
  const [show, setShow] = useState(false);
  const [verification, setVerification] = useState(false);
  const [resetNotice] = useState(takeResetNotice);
  const submit = handleSubmit(async (value) => {
    setFailure(null);
    setVerification(false);
    try {
      await signIn(value.email.trim(), value.password);
    } catch (failure) {
      setFailure(failure);
      const feedback = loginFeedback(failure);
      setVerification(
        !!feedback.verification && !!features["account.verification.enabled"],
      );
      for (const field of ["email", "password"] as const)
        if (feedback.fields?.[field])
          setError(field, { message: feedback.fields[field] });
      if (feedback.fields?.email) setFocus("email");
      else if (feedback.fields?.password) setFocus("password");
    }
  });
  if (phase === "locked")
    return (
      <AuthFrame>
        <Card style={{ padding: 24, borderRadius: 24, gap: 20 }}>
          <Label size="h2" accessibilityRole="header">
            {t("locked")}
          </Label>
          <Label>{t("lockedHint")}</Label>
          {biometric && (
            <Button
              label={t("unlock")}
              onPress={() => {
                void unlock().then((result) => {
                  if (!result)
                    setFailure(new Error(t("biometricsUnavailable")));
                });
              }}
            />
          )}
          <Button
            variant="secondary"
            label={t("usePassword")}
            onPress={() => void logout()}
          />
          {!!error && <ErrorState error={error} />}
        </Card>
      </AuthFrame>
    );
  return (
    <Screen
      scroll
      safeTop
      contentStyle={{
        maxWidth: authMaxWidth,
        flexGrow: 1,
        paddingTop: 24,
        gap: 0,
      }}
    >
      {height < 480 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 64,
            alignSelf: "center",
            width: "100%",
            maxWidth: "100%",
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            {height < 480 && <Brand variant="auth" />}
          </View>
          <IconButton
            label={t("appearance")}
            onPress={() => setMode(dark ? "light" : "dark")}
          >
            {dark ? (
              <Sun size={20} color={colors.text.secondary} />
            ) : (
              <Moon size={20} color={colors.text.secondary} />
            )}
          </IconButton>
        </View>
      )}
      <View
        style={{
          justifyContent: "flex-start",
          alignSelf: "center",
          width: "100%",
          maxWidth: authMaxWidth,
          gap: 0,
          paddingTop: 0,
          paddingBottom: 32,
        }}
      >
        <AuthArtwork />
        <AuthHeading title={t("signInTitle")} subtitle={t("signInHint")} />
        <Card
          style={{
            paddingVertical: 18,
            paddingHorizontal: 16,
            borderRadius: 18,
            gap: 0,
            marginTop: 23,
            borderColor: colors.border,
            boxShadow: "0px 8px 26px rgba(27,68,128,0.08)",
          }}
        >
          <Controller
            control={control}
            name="email"
            rules={{
              required: "Enter your email address.",
              validate: (value) =>
                z.email().safeParse(value.trim()).success ||
                "Enter a valid email address, such as you@company.com.",
              maxLength: {
                value: 254,
                message: "Use an email address with 254 characters or fewer.",
              },
            }}
            render={({ field: { value, onChange, ref }, fieldState }) => (
              <Input
                testID="auth-email"
                ref={ref}
                label="Email address"
                required
                leading={
                  <Mail
                    size={19}
                    color={dark ? colors.text.tertiary : "#8CA1C0"}
                  />
                }
                value={value}
                onChangeText={onChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                error={fieldState.error?.message}
                returnKeyType="next"
                onSubmitEditing={() => setFocus("password")}
                containerStyle={{ marginBottom: 18 }}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            rules={{ required: "Enter your password." }}
            render={({ field: { value, onChange, ref }, fieldState }) => (
              <Input
                testID="auth-password"
                ref={ref}
                label={t("password")}
                required
                leading={
                  <LockKeyhole
                    size={19}
                    color={dark ? colors.text.tertiary : "#8CA1C0"}
                  />
                }
                trailing={
                  <IconButton
                    inField
                    label={t(show ? "hidePassword" : "showPassword")}
                    onPress={() => setShow((old) => !old)}
                  >
                    {show ? (
                      <EyeOff
                        size={19}
                        color={dark ? colors.text.secondary : "#7288AB"}
                      />
                    ) : (
                      <Eye
                        size={19}
                        color={dark ? colors.text.secondary : "#7288AB"}
                      />
                    )}
                  </IconButton>
                }
                value={value}
                onChangeText={onChange}
                secureTextEntry={!show}
                autoComplete="current-password"
                placeholder={t("passwordPlaceholder")}
                error={fieldState.error?.message}
                onSubmitEditing={() => void submit()}
              />
            )}
          />
          {features["account.recovery.enabled"] && (
            <View
              style={{
                alignItems: "flex-end",
                marginTop: 12,
                marginBottom: 19,
              }}
            >
              <Button
                variant="tertiary"
                compact
                label={t("forgot")}
                onPress={() => router.push("/(auth)/forgot-password")}
              />
            </View>
          )}
          {!!error && (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ gap: 4, marginBottom: 16 }}
            >
              <Label
                size="bodyMedium"
                style={{ color: colors.status.dangerText }}
              >
                {loginFeedback(error).title}
              </Label>
              <Label size="secondary" tone="secondary">
                {loginFeedback(error).hint}
              </Label>
            </View>
          )}
          {!error && !!unavailableError && (
            <ErrorState
              error={unavailableError}
              retry={
                !error && unavailableError ? () => void refresh() : undefined
              }
            />
          )}
          {resetNotice && (
            <Label accessibilityLiveRegion="polite">
              {recoveryText.complete}
            </Label>
          )}
          <View>
            <Button
              testID="sign-in"
              label={t("signIn")}
              onPress={() => void submit()}
              loading={isSubmitting}
              icon={<ArrowRight size={22} color="#FFFFFF" />}
              iconPosition="after"
            />
          </View>
          {verification && (
            <Button
              variant="secondary"
              label={t("verification")}
              onPress={() => {
                const values = getValues();
                void api
                  .POST("/v1/auth/verification-resend", {
                    body: values,
                  })
                  .then((result) => {
                    unwrap(result, z.unknown());
                    setVerification(false);
                  })
                  .catch(setFailure);
              }}
            />
          )}
        </Card>
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            justifyContent: "center",
            alignItems: "center",
            marginTop: 18,
          }}
        >
          <ShieldCheck size={14} color={colors.text.secondary} />
          <Label size="caption" tone="secondary">
            Secure workspace access
          </Label>
        </View>
        <Label
          size="caption"
          tone="secondary"
          style={{
            textAlign: "center",
            maxWidth: 320,
            alignSelf: "center",
            marginTop: 24,
          }}
        >
          Need access? Contact your administrator.
        </Label>
      </View>
    </Screen>
  );
}
