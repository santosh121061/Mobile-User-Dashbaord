import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Eye, EyeOff, LockKeyhole, Mail, Sun, Moon } from "lucide-react-native";
import { IconButton } from "@/components/visuals";
import { Brand } from "@/components/brand";
import { AuthFrame } from "@/components/auth-frame";
import { useForm, Controller } from "react-hook-form";
import { useRouter } from "expo-router";
import { z } from "zod";
import { useSession } from "@/auth/session";
import { api, ApiError, unwrap } from "@/api/client";
import {
    Button,
    Card,
    ErrorState,
    Input,
    Label,
    Screen,
} from "@/components/ui";
import { t } from "@/localization";
import { useTheme, tokens } from "@/theme";
import { takeResetNotice } from "@/auth/intents";
import { recoveryText } from "@/localization/recovery";
export default function Login() {
    const { signIn, phase, unlock, logout, biometric, features } = useSession();
    const router = useRouter();
    const { colors, dark, setMode } = useTheme();
    const { width } = useWindowDimensions();
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
        if (!z.email().safeParse(value.email).success) {
            setError("email", { message: t("validation") });
            setFocus("email");
            return;
        }
        try {
            await signIn(value.email.trim(), value.password);
        } catch (failure) {
            setFailure(failure);
            if (failure instanceof ApiError) {
                setVerification(
                    failure.status === 403 &&
                        !!features["account.verification.enabled"],
                );
                for (const field of ["email", "password"] as const)
                    if (failure.fields[field]?.[0]) {
                        setError(field, {
                            message: failure.fields[field]?.[0],
                        });
                        setFocus(field);
                        break;
                    }
            }
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
                                        setFailure(
                                            new Error(
                                                t("biometricsUnavailable"),
                                            ),
                                        );
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
            contentStyle={{
                paddingHorizontal: 24,
                flexGrow: 1,
                paddingTop: 24,
            }}
        >
            <View
                style={{
                    alignItems: "flex-end",
                    alignSelf: "center",
                    width: "100%",
                    maxWidth: 480,
                }}
            >
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
            <View
                style={{
                    flex: 1,
                    justifyContent: "center",
                    alignSelf: "center",
                    width: "100%",
                    maxWidth: 440,
                    gap: 28,
                    paddingTop: width < 600 ? 16 : 32,
                    paddingBottom: 32,
                }}
            >
                <Brand variant="auth" />
                <Card
                    style={{
                        padding: width < 600 ? 20 : 28,
                        borderRadius: 24,
                        gap: 20,
                        ...tokens.shadows.elevation2,
                    }}
                >
                    <View style={{ gap: 4, marginBottom: 4 }}>
                        <Label accessibilityRole="header" size="h2">
                            {t("signInTitle")}
                        </Label>
                        <Label tone="secondary">{t("signInHint")}</Label>
                    </View>
                    <Controller
                        control={control}
                        name="email"
                        rules={{ required: t("validation") }}
                        render={({
                            field: { value, onChange, ref },
                            fieldState,
                        }) => (
                            <Input
                                testID="auth-email"
                                ref={ref}
                                label={t("email")}
                                leading={
                                    <Mail
                                        size={20}
                                        color={colors.text.tertiary}
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
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="password"
                        rules={{ required: t("validation") }}
                        render={({
                            field: { value, onChange, ref },
                            fieldState,
                        }) => (
                            <Input
                                testID="auth-password"
                                ref={ref}
                                label={t("password")}
                                leading={
                                    <LockKeyhole
                                        size={20}
                                        color={colors.text.tertiary}
                                    />
                                }
                                trailing={
                                    <IconButton
                                        inField
                                        label={t(
                                            show
                                                ? "hidePassword"
                                                : "showPassword",
                                        )}
                                        onPress={() => setShow((old) => !old)}
                                    >
                                        {show ? (
                                            <EyeOff
                                                size={20}
                                                color={colors.text.secondary}
                                            />
                                        ) : (
                                            <Eye
                                                size={20}
                                                color={colors.text.secondary}
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
                        <View style={{ alignItems: "flex-end" }}>
                            <Button
                                variant="tertiary"
                                label={t("forgot")}
                                onPress={() =>
                                    router.push("/(auth)/forgot-password")
                                }
                            />
                        </View>
                    )}
                    {!!error && <ErrorState error={error} />}
                    {resetNotice && (
                        <Label accessibilityLiveRegion="polite">
                            {recoveryText.complete}
                        </Label>
                    )}
                    <View style={{ marginTop: 4 }}>
                        <Button
                            testID="sign-in"
                            label={t("signIn")}
                            onPress={() => void submit()}
                            loading={isSubmitting}
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
                <Label
                    size="caption"
                    tone="secondary"
                    style={{
                        textAlign: "center",
                        maxWidth: 320,
                        alignSelf: "center",
                    }}
                >
                    {t("administratorAccounts")}
                </Label>
            </View>
        </Screen>
    );
}
