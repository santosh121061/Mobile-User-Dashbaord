import { Mail, ArrowRight } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { z } from "zod";
import { api, check } from "@/api/client";
import { useSession } from "@/auth/session";
import { Button, ErrorState, Input, Label } from "@/components/ui";
import { AuthCard, AuthFrame } from "@/components/auth-frame";
import { t } from "@/localization";
import { useTheme } from "@/theme";
export default function ForgotPassword() {
  const router = useRouter();
  const { colors } = useTheme();
  const { features } = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const submit = async () => {
    setAttempted(true);
    if (busy || !z.email().safeParse(email.trim()).success) return;
    setBusy(true);
    try {
      check(
        await api.POST("/v1/auth/forgot-password", {
          body: { email: email.trim() },
        }),
      );
      setSent(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      barTitle="Account recovery"
      title={t("forgot")}
      subtitle="Enter your work email to request a reset link."
      icon={Mail}
    >
      <AuthCard>
        <Input
          label="Email address"
          required
          error={
            attempted && !z.email().safeParse(email.trim()).success
              ? t("validation")
              : undefined
          }
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
        />
        {!!error && <ErrorState error={error} />}
        {sent ? (
          <Label accessibilityLiveRegion="polite">{t("recoverySent")}</Label>
        ) : (
          <Button
            label="Send reset link"
            icon={<ArrowRight size={20} color="#FFFFFF" />}
            iconPosition="after"
            disabled={!features["account.recovery.enabled"]}
            loading={busy}
            onPress={() => void submit()}
          />
        )}
      </AuthCard>
      <View
        style={{
          marginTop: 24,
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Label size="caption" tone="secondary">
          Remembered your password?{" "}
        </Label>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Sign in"
          hitSlop={{ left: 4, right: 4 }}
          onPress={() => router.back()}
          style={{
            minHeight: 44,
            paddingVertical: 8,
            paddingHorizontal: 2,
            marginStart: 3,
            justifyContent: "center",
          }}
        >
          <Label
            size="caption"
            style={{
              color: colors.brand.primary,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            Sign in
          </Label>
        </Pressable>
      </View>
    </AuthFrame>
  );
}
