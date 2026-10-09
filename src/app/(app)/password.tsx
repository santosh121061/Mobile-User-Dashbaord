import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { api, check } from "@/api/client";
import { useSession } from "@/auth/session";
import { Button, Card, ErrorState, Input, Screen } from "@/components/ui";
import { applyFieldErrors, useDiscard, useTitle } from "@/components/forms";
import { t } from "@/localization";
type Values = {
    current_password: string;
    password: string;
    password_confirmation: string;
};
export default function Password() {
    const session = useSession();
    const [error, setError] = useState<unknown>(null);
    useTitle(t("changePassword"));
    const form = useForm<Values>({
        defaultValues: {
            current_password: "",
            password: "",
            password_confirmation: "",
        },
    });
    useDiscard(form.formState.isDirty);
    const save = form.handleSubmit(async (body) => {
        setError(null);
        try {
            check(await api.PUT("/v1/profile/password", { body }));
            form.reset();
            await session.logout();
        } catch (failure) {
            setError(failure);
            applyFieldErrors(form, failure, Object.keys(body));
        } finally {
            form.setValue("current_password", "");
            form.setValue("password", "");
            form.setValue("password_confirmation", "");
        }
    });
    return (
        <Screen scroll>
            <Card>
                {(
                    [
                        "current_password",
                        "password",
                        "password_confirmation",
                    ] as const
                ).map((key) => (
                    <Controller
                        key={key}
                        name={key}
                        control={form.control}
                        rules={{
                            required: t("validation"),
                            validate:
                                key === "password_confirmation"
                                    ? (value) =>
                                          value ===
                                              form.getValues("password") ||
                                          t("validation")
                                    : key === "password"
                                      ? (value) =>
                                            (value.length >= 12 &&
                                                /[a-z]/.test(value) &&
                                                /[A-Z]/.test(value) &&
                                                /\d/.test(value) &&
                                                /[^\w\s]/.test(value)) ||
                                            t("passwordHint")
                                      : undefined,
                        }}
                        render={({
                            field: { ref, value, onChange, onBlur },
                            fieldState,
                        }) => (
                            <Input
                                ref={ref}
                                label={t(
                                    key === "current_password"
                                        ? "currentPassword"
                                        : key === "password"
                                          ? "newPassword"
                                          : "confirmPassword",
                                )}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                secureTextEntry
                                autoComplete={
                                    key === "current_password"
                                        ? "current-password"
                                        : "new-password"
                                }
                                error={fieldState.error?.message}
                                help={
                                    key === "password"
                                        ? t("passwordHint")
                                        : undefined
                                }
                            />
                        )}
                    />
                ))}
                {!!error && <ErrorState error={error} />}
                <Button
                    label={t("save")}
                    loading={form.formState.isSubmitting}
                    onPress={() => void save()}
                />
            </Card>
        </Screen>
    );
}
