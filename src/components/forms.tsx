import { useEffect } from "react";
import { Alert } from "react-native";
import { usePreventRemove } from "expo-router/react-navigation";
import { useNavigation } from "expo-router";
import { ApiError } from "@/api/client";
import { t } from "@/localization";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { useSession } from "@/auth/session";
export function useDiscard(dirty: boolean) {
    const navigation = useNavigation();
    const { phase, bootstrap } = useSession();
    const retained = phase === "ready" || (phase === "checking" && !!bootstrap);
    usePreventRemove(dirty && retained, ({ data }) =>
        Alert.alert(t("discard"), t("discardHint"), [
            { text: t("cancel"), style: "cancel" },
            {
                text: t("discardAction"),
                style: "destructive",
                onPress: () => navigation.dispatch(data.action),
            },
        ]),
    );
}
export function applyFieldErrors<T extends FieldValues>(
    form: UseFormReturn<T>,
    error: unknown,
    allowed: readonly string[],
) {
    if (!(error instanceof ApiError) || error.status !== 422) return;
    let first: Path<T> | undefined;
    for (const [name, messages] of Object.entries(error.fields)) {
        if (!allowed.includes(name)) continue;
        const path = name as Path<T>;
        form.setError(path, { message: messages[0] ?? t("validation") });
        first ??= path;
    }
    if (first) form.setFocus(first);
}
export function useTitle(title: string) {
    const navigation = useNavigation();
    useEffect(() => {
        navigation.setOptions({ title });
    }, [navigation, title]);
}
