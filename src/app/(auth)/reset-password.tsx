import { useEffect, useRef, useState } from "react";
import { Redirect, router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { api, check } from "@/api/client";
import {
    currentIntent,
    discardIntent,
    markResetComplete,
    useIntent,
} from "@/auth/intents";
import { useSession } from "@/auth/session";
import {
    Button,
    Card,
    ErrorState,
    Input,
    Label,
    Loading,
} from "@/components/ui";
import { AuthFrame } from "@/components/auth-frame";
import { t } from "@/localization";
import { recoveryText as text } from "@/localization/recovery";

export default function ResetPassword() {
    const intent = useIntent();
    const { features, logout } = useSession();
    const [failure, setFailure] = useState<unknown>(null);
    const [complete, setComplete] = useState(false);
    const mounted = useRef(true);
    const request = useRef<AbortController | null>(null);
    const enabled =
        !!features["api.enabled"] && !!features["account.recovery.enabled"];
    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting },
    } = useForm({ defaultValues: { password: "", password_confirmation: "" } });
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            request.current?.abort();
            if (intent)
                queueMicrotask(() => {
                    if (!mounted.current) discardIntent(intent);
                });
        };
    }, [intent]);
    useEffect(() => {
        if (!enabled) request.current?.abort();
    }, [enabled]);
    const submit = async (values: {
        password: string;
        password_confirmation: string;
    }) => {
        if (
            !enabled ||
            intent?.kind !== "reset" ||
            isSubmitting ||
            request.current
        )
            return;
        const active = new AbortController();
        request.current = active;
        setFailure(null);
        try {
            check(
                await api.POST("/v1/auth/reset-password", {
                    body: {
                        ...values,
                        email: intent.email,
                        token: intent.token,
                    },
                    signal: active.signal,
                }),
            );
            if (
                !mounted.current ||
                active.signal.aborted ||
                currentIntent() !== intent
            )
                return;
            // Reset invalidates every server session; remove the local session before returning to login.
            reset();
            setComplete(true);
            markResetComplete();
            discardIntent(intent);
            const cleanup = logout();
            router.replace("/(auth)/login");
            await cleanup;
        } catch (error) {
            if (
                mounted.current &&
                !active.signal.aborted &&
                currentIntent() === intent
            )
                setFailure(error);
        } finally {
            if (request.current === active) request.current = null;
        }
    };
    if (intent?.kind !== "reset")
        return complete ? <Loading /> : <Redirect href="/unavailable" />;
    return (
        <AuthFrame>
            <Card style={{ padding: 24, borderRadius: 24, gap: 20 }}>
                <Label size="h2" accessibilityRole="header">
                    {text.resetTitle}
                </Label>
                <>
                    <Input
                        label={t("email")}
                        value={intent.email}
                        editable={false}
                    />
                    <Label tone="secondary">{text.passwordHint}</Label>
                    <Controller
                        name="password"
                        control={control}
                        rules={{
                            required: t("validation"),
                            validate: (value) =>
                                (value.length >= 12 &&
                                    /[a-z]/.test(value) &&
                                    /[A-Z]/.test(value) &&
                                    /[0-9]/.test(value) &&
                                    /[^a-zA-Z0-9]/.test(value)) ||
                                text.passwordHint,
                        }}
                        render={({ field, fieldState }) => (
                            <Input
                                ref={field.ref}
                                label={text.newPassword}
                                value={field.value}
                                onChangeText={field.onChange}
                                secureTextEntry
                                autoComplete="new-password"
                                error={fieldState.error?.message}
                                editable={!isSubmitting}
                            />
                        )}
                    />
                    <Controller
                        name="password_confirmation"
                        control={control}
                        rules={{
                            required: t("validation"),
                            validate: (value, values) =>
                                value === values.password ||
                                text.passwordMismatch,
                        }}
                        render={({ field, fieldState }) => (
                            <Input
                                ref={field.ref}
                                label={text.confirmPassword}
                                value={field.value}
                                onChangeText={field.onChange}
                                secureTextEntry
                                autoComplete="new-password"
                                error={fieldState.error?.message}
                                editable={!isSubmitting}
                            />
                        )}
                    />
                    {!enabled && (
                        <Label accessibilityRole="alert">{text.disabled}</Label>
                    )}
                    {!!failure && <ErrorState error={failure} />}
                    <Button
                        label={text.resetTitle}
                        disabled={!enabled}
                        loading={isSubmitting}
                        onPress={() => void handleSubmit(submit)()}
                    />
                </>
                <Button
                    variant="secondary"
                    label={t("cancel")}
                    onPress={() => {
                        request.current?.abort();
                        reset();
                        discardIntent(intent);
                        router.replace("/(auth)/login");
                    }}
                />
            </Card>
        </AuthFrame>
    );
}
