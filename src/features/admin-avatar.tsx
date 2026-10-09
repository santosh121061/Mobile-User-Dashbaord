import { useState } from "react";
import { api, ApiError, check } from "@/api/client";
import { useBootstrap } from "@/auth/session";
import { useFeatureConfirmation } from "@/features/use-feature-confirmation";
import { useDiscard } from "@/components/forms";
import { Button, ErrorState, Label } from "@/components/ui";
import { t } from "@/localization";
import { AvatarPicker, appendAvatar, type AvatarAsset } from "./avatar";
import { useFeatureWork } from "./use-feature-work";
export function AdminAvatar({
    id,
    permitted,
    available,
    refresh,
}: {
    id: string;
    permitted: boolean;
    available: boolean;
    refresh: () => Promise<unknown>;
}) {
    const snapshot = useBootstrap();
    const confirm = useFeatureConfirmation();
    const work = useFeatureWork();
    const [avatar, setAvatar] = useState<AvatarAsset | null>(null);
    const [message, setMessage] = useState("");
    const enabled = permitted && !!snapshot.features["users.avatar.enabled"];
    useDiscard(enabled && !!avatar);
    return (
        <>
            <AvatarPicker
                enabled={enabled}
                value={avatar}
                onChange={setAvatar}
                disabled={work.busy}
            />
            {enabled && !!avatar && (
                <Button
                    label={t("save")}
                    loading={work.busy}
                    onPress={() =>
                        void work.run(async (scope) => {
                            const data = new FormData();
                            appendAvatar(data, avatar);
                            await confirm(
                                scope,
                                "POST",
                                `/api/v1/users/${id}/avatar`,
                                async (approval, signal) =>
                                    check(
                                        await api.POST(
                                            "/v1/users/{user}/avatar",
                                            {
                                                params: {
                                                    path: { user: Number(id) },
                                                },
                                                body: { avatar: avatar.uri },
                                                bodySerializer: () => data,
                                                headers: {
                                                    "X-Mobile-Step-Up":
                                                        approval,
                                                },
                                                signal,
                                            },
                                        ),
                                    ),
                            );
                            scope.assertCurrent();
                            setAvatar(null);
                            setMessage(t("saved"));
                            await refresh();
                        })
                    }
                />
            )}
            {enabled && available && !avatar && (
                <Button
                    variant="secondary"
                    label={t("removeAvatar")}
                    loading={work.busy}
                    onPress={() =>
                        void work.run(async (scope) => {
                            const data = new FormData();
                            data.append("remove_avatar", "1");
                            await confirm(
                                scope,
                                "POST",
                                `/api/v1/users/${id}/avatar`,
                                async (approval, signal) =>
                                    check(
                                        await api.POST(
                                            "/v1/users/{user}/avatar",
                                            {
                                                params: {
                                                    path: { user: Number(id) },
                                                },
                                                body: { remove_avatar: true },
                                                bodySerializer: () => data,
                                                headers: {
                                                    "X-Mobile-Step-Up":
                                                        approval,
                                                },
                                                signal,
                                            },
                                        ),
                                    ),
                            );
                            scope.assertCurrent();
                            setMessage(t("saved"));
                            await refresh();
                        })
                    }
                />
            )}
            {enabled && !!message && (
                <Label accessibilityLiveRegion="polite">{message}</Label>
            )}
            {enabled && !!work.error && <ErrorState error={work.error} />}
            {enabled &&
                work.error instanceof ApiError &&
                !!work.error.fields.avatar?.[0] && (
                    <Label accessibilityLiveRegion="polite">
                        {work.error.fields.avatar[0]}
                    </Label>
                )}
        </>
    );
}
