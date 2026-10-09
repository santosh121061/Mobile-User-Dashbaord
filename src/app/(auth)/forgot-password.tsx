import React, { useState } from "react";
import { useRouter } from "expo-router";
import { z } from "zod";
import { api, check } from "@/api/client";
import { useSession } from "@/auth/session";
import { Button, Card, ErrorState, Input, Label } from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";
import { t } from "@/localization";
export default function ForgotPassword() {
    const router = useRouter();
    const { features } = useSession();
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [sent, setSent] = useState(false);
    const submit = async () => {
        if (busy || !z.email().safeParse(email).success) return;
        setBusy(true);
        try {
            check(
                await api.POST("/v1/auth/forgot-password", { body: { email } }),
            );
            setSent(true);
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(false);
        }
    };
    return (
        <AuthFrame>
            <Card style={{ padding: 24, borderRadius: 24, gap: 20 }}>
                <Label size="h2" accessibilityRole="header">
                    {t("forgot")}
                </Label>
                <Input
                    label={t("email")}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder={t("emailPlaceholder")}
                />
                {!!error && <ErrorState error={error} />}
                {sent ? (
                    <Label accessibilityLiveRegion="polite">
                        {t("recoverySent")}
                    </Label>
                ) : (
                    <Button
                        label={t("recover")}
                        disabled={!features["account.recovery.enabled"]}
                        loading={busy}
                        onPress={() => void submit()}
                    />
                )}
                <Button
                    variant="tertiary"
                    label={t("back")}
                    onPress={() => router.back()}
                />
            </Card>
        </AuthFrame>
    );
}
