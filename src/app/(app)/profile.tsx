import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
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
    useTitle(t("profile"));
    const snapshot = useBootstrap();
    const query = useRead(
        "profile",
        null,
        async (signal) =>
            unwrap(
                await api.GET("/v1/profile", { signal }),
                envelope(profileSchema),
            ).data,
    );
    return (
        <Screen scroll>
            <FeaturePane>
                {query.isPending ? (
                    <Loading />
                ) : query.error ? (
                    <ErrorState
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
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
    const { colors } = useTheme();
    const work = useFeatureWork();
    const [avatar, setAvatar] = useState<AvatarAsset | null>(null);
    const [removeAvatar, setRemoveAvatar] = useState(false);
    const changeAvatar = useCallback((asset: AvatarAsset | null) => {
        setAvatar(asset);
        setRemoveAvatar(false);
    }, []);
    const [message, setMessage] = useState("");
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
                    ...(removeAvatar &&
                    snapshot.features["users.avatar.enabled"]
                        ? { remove_avatar: true }
                        : {}),
                };
                const data = new FormData();
                Object.entries(body).forEach(([key, value]) =>
                    data.append(
                        key,
                        typeof value === "boolean"
                            ? value
                                ? "1"
                                : "0"
                            : (value ?? ""),
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
                applyFieldErrors(form, failure, [
                    "first_name",
                    "last_name",
                    "phone",
                ]),
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
    return (
        <>
            <Card>
                <View style={{ alignItems: "center", gap: 8 }}>
                    <AvatarView
                        available={profile.avatar_available}
                        version={version}
                        name={profile.name}
                        size={56}
                    />
                    <Label size="title" style={{ textAlign: "center" }}>
                        {profile.name}
                    </Label>
                    <Label tone="secondary" style={{ textAlign: "center" }}>
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
                            size="captionMedium"
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
                {(["first_name", "last_name", "phone"] as const).map((key) => (
                    <Controller
                        key={key}
                        name={key}
                        control={form.control}
                        rules={{
                            required:
                                key === "first_name" ? t("validation") : false,
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
                                keyboardType={
                                    key === "phone" ? "phone-pad" : "default"
                                }
                                autoCapitalize={
                                    key === "phone" ? "none" : "words"
                                }
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
                                removeAvatar
                                    ? "cancelAvatarRemoval"
                                    : "removeAvatar",
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
                    disabled={
                        !Object.keys(dirty).length && !avatar && !removeAvatar
                    }
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
            </Card>
            <Card>
                <Button
                    label={t("changePassword")}
                    variant="secondary"
                    disabled={work.busy}
                    onPress={() => router.push("/password")}
                />
                {!profile.email_verified_at &&
                    snapshot.features["account.verification.enabled"] && (
                        <Button
                            label={t("verification")}
                            variant="secondary"
                            disabled={work.busy}
                            onPress={() => void verify()}
                        />
                    )}
                <Button
                    label={t("sessions")}
                    variant="secondary"
                    disabled={work.busy}
                    onPress={() => router.push("/sessions")}
                />
            </Card>
        </>
    );
}
