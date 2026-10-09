import { useState } from "react";
import { z } from "zod";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { useBootstrap, useSession } from "@/auth/session";
import { useConfirmation } from "@/auth/confirmation";
import { useDiscard } from "@/components/forms";
import { Access } from "@/components/access";
import {
    Button,
    Card,
    Chip,
    ErrorState,
    Input,
    Loading,
    Screen,
} from "@/components/ui";
import { t } from "@/localization";
const schema = z.object({
    values: z.record(z.string(), z.unknown()),
    defaults: z.record(z.string(), z.unknown()),
    version: z.string().length(64),
});
export default function Settings() {
    const snapshot = useBootstrap();
    const query = useRead(
        "settings",
        null,
        async (signal) =>
            unwrap(await api.GET("/v1/settings", { signal }), envelope(schema))
                .data,
        !!snapshot.modules.settings,
    );
    return (
        <Access module="settings">
            <Screen scroll>
                {query.isPending ? (
                    <Loading />
                ) : query.error ? (
                    <ErrorState
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
                ) : (
                    query.data && (
                        <SettingsEditor
                            key={query.data.version}
                            initial={query.data}
                            refresh={() => query.refetch()}
                        />
                    )
                )}
            </Screen>
        </Access>
    );
}
function SettingsEditor({
    initial,
    refresh,
}: {
    initial: z.infer<typeof schema>;
    refresh: () => Promise<unknown>;
}) {
    const snapshot = useBootstrap();
    const session = useSession();
    const confirm = useConfirmation();
    const [values, setValues] = useState(initial.values);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [invalidKeys, setInvalidKeys] = useState<string[]>([]);
    useDiscard(dirty);
    const canEdit = !!snapshot.actions["settings.manage"];
    const change = (key: string, value: unknown) => {
        setValues((old) => ({ ...old, [key]: value }));
        setDirty(true);
    };
    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            await confirm(
                "PATCH",
                "/api/v1/settings",
                async (approval, signal) =>
                    check(
                        await api.PATCH("/v1/settings", {
                            body: { values, version: initial.version },
                            headers: { "X-Mobile-Step-Up": approval },
                            signal,
                        }),
                    ),
            );
            setDirty(false);
            await session.refresh();
            await refresh();
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            {Object.entries(values).map(([key, value]) => (
                <Card key={key}>
                    {typeof value === "boolean" ? (
                        <Chip
                            label={key.replaceAll(".", " ")}
                            selected={value}
                            onPress={() => {
                                if (canEdit && !busy) change(key, !value);
                            }}
                        />
                    ) : typeof value === "string" ||
                      typeof value === "number" ? (
                        <Input
                            label={key.replaceAll(".", " ")}
                            value={String(value)}
                            editable={canEdit && !busy}
                            multiline={
                                key.includes("body") || key.includes("template")
                            }
                            onChangeText={(text) =>
                                change(
                                    key,
                                    typeof value === "number"
                                        ? Number(text)
                                        : text,
                                )
                            }
                        />
                    ) : (
                        <StructuredSetting
                            name={key}
                            value={value}
                            editable={canEdit && !busy}
                            onChange={(value) => change(key, value)}
                            onValidity={(valid) => {
                                setInvalidKeys((old) =>
                                    valid
                                        ? old.filter((item) => item !== key)
                                        : [...new Set([...old, key])],
                                );
                                setDirty(true);
                            }}
                        />
                    )}
                </Card>
            ))}
            {!!error && <ErrorState error={error} />}
            {canEdit && (
                <Button
                    label={t("save")}
                    disabled={!dirty || invalidKeys.length > 0}
                    loading={busy}
                    onPress={() => void save()}
                />
            )}
            <Button
                label={t("refresh")}
                variant="secondary"
                disabled={busy || dirty}
                onPress={() => void refresh()}
            />
        </>
    );
}
function StructuredSetting({
    name,
    value,
    editable,
    onChange,
    onValidity,
}: {
    name: string;
    value: unknown;
    editable: boolean;
    onChange: (value: unknown) => void;
    onValidity: (valid: boolean) => void;
}) {
    const [text, setText] = useState(JSON.stringify(value, null, 2));
    const [invalid, setInvalid] = useState(false);
    return (
        <Input
            label={name.replaceAll(".", " ")}
            multiline
            editable={editable}
            value={text}
            error={invalid ? t("validation") : undefined}
            onChangeText={(next) => {
                setText(next);
                try {
                    const parsed: unknown = JSON.parse(next);
                    if (!parsed || typeof parsed !== "object")
                        throw new Error();
                    setInvalid(false);
                    onValidity(true);
                    onChange(parsed);
                } catch {
                    setInvalid(true);
                    onValidity(false);
                }
            }}
        />
    );
}
