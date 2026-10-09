import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { Redirect, router } from "expo-router";
import { currentIntent, discardIntent, useIntent } from "@/auth/intents";
import { useSession } from "@/auth/session";
import { Button, Card, ErrorState, Label, Screen } from "@/components/ui";
import { t } from "@/localization";
import { recoveryText as text } from "@/localization/recovery";
export default function VerifyEmail() {
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
        <Screen scroll>
            <Card>
                <Label size="h1" accessibilityRole="header">
                    {text.verificationTitle}
                </Label>
                <Label>{text.verificationHint}</Label>
                {!enabled && (
                    <Label accessibilityRole="alert">
                        {text.verificationDisabled}
                    </Label>
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
            </Card>
        </Screen>
    );
}
