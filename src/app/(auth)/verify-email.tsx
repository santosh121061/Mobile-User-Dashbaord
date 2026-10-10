import { ExternalLink, MailCheck } from "lucide-react-native";
import { AuthCard, AuthFrame } from "@/components/auth-frame";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { Redirect, router } from "expo-router";
import { currentIntent, discardIntent, useIntent } from "@/auth/intents";
import { useSession } from "@/auth/session";
import { Button, ErrorState, Label } from "@/components/ui";
import { t } from "@/localization";
import { recoveryText as text } from "@/localization/recovery";
import { useTheme } from "@/theme";
export default function VerifyEmail() {
  const { colors } = useTheme();
  const intent = useIntent();
  const { features } = useSession();
  const mounted = useRef(true);
  const [failure, setFailure] = useState<unknown>(null);
  const enabled =
    !!features["api.enabled"] && !!features["account.verification.enabled"];
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (intent)
        queueMicrotask(() => {
          if (!mounted.current) discardIntent(intent);
        });
    };
  }, [intent]);
  if (intent?.kind !== "verify") return <Redirect href="/unavailable" />;
  return (
    <AuthFrame
      barTitle="Email verification"
      title="Verify your email"
      subtitle="Open the verification link in your email, then return here to continue."
      icon={MailCheck}
    >
      <AuthCard>
        <View
          style={{
            padding: 12,
            borderRadius: 14,
            backgroundColor: colors.brand.primarySoft,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 9,
          }}
        >
          <ExternalLink
            size={18}
            color={colors.brand.primary}
            style={{ marginTop: 1 }}
          />
          <Label
            size="secondary"
            style={{ color: colors.brand.primary, flex: 1 }}
          >
            Your verification link opens in your browser. You may need to sign
            in there.
          </Label>
        </View>
        {!enabled && (
          <Label accessibilityRole="alert">{text.verificationDisabled}</Label>
        )}
        {!!failure && <ErrorState error={failure} />}
        <Button
          label={text.verificationOpen}
          disabled={!enabled}
          onPress={() => {
            if (!enabled || currentIntent() !== intent) return;
            // Existing signed/authenticated web route remains the verification authority.
            void Linking.openURL(intent.url).catch((error) => {
              if (mounted.current && currentIntent() === intent)
                setFailure(error);
            });
          }}
        />
        <Button
          variant="secondary"
          label={t("signIn")}
          onPress={() => {
            discardIntent(intent);
            router.replace("/(auth)/login");
          }}
        />
      </AuthCard>
    </AuthFrame>
  );
}
