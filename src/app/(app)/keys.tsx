import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope, idSchema } from "@/api/runtime";
import { useBootstrap } from "@/auth/session";
import { useConfirmation } from "@/auth/confirmation";
import { Access } from "@/components/access";
import {
    Button,
    Card,
    Chip,
    ErrorState,
    Input,
    Label,
    Row,
    Screen,
} from "@/components/ui";
import { date, t } from "@/localization";
const keySchema = z.object({
    id: idSchema,
    name: z.string(),
    abilities: z.array(z.string()),
    expires_at: z.string().nullable(),
    last_used_at: z.string().nullable(),
});
export default function Keys() {
    const snapshot = useBootstrap();
    const confirm = useConfirmation();
    const query = useRead(
        "keys",
        null,
        async (signal) =>
            unwrap(
                await api.GET("/v1/keys", { signal }),
                envelope(z.array(keySchema)),
            ).data,
        !!snapshot.modules.keys,
    );
    const [name, setName] = useState("");
    const [days, setDays] = useState("30");
    const [abilities, setAbilities] = useState<string[]>(["account.read"]);
    const [secret, setSecret] = useState<string | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [busy, setBusy] = useState(false);
    const choices = [
        "account.read",
        "account.update",
        "account.password",
        ...(snapshot.modules.notifications
            ? ["notifications.read", "notifications.update"]
            : []),
        ...Object.keys(snapshot.actions).filter((key) => snapshot.actions[key]),
    ];
    const create = async () => {
        setBusy(true);
        setError(null);
        try {
            const issued = await confirm(
                "POST",
                "/api/v1/keys",
                async (approval, signal) =>
                    unwrap(
                        await api.POST("/v1/keys", {
                            body: { name, days: Number(days), abilities },
                            headers: { "X-Mobile-Step-Up": approval },
                            signal,
                        }),
                        z.object({ access_token: z.string() }),
                    ),
            );
            setSecret(issued.access_token);
            setName("");
            await query.refetch();
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(false);
        }
    };
    const revoke = async (id: string) => {
        setBusy(true);
        setError(null);
        try {
            await confirm(
                "DELETE",
                `/api/v1/keys/${id}`,
                async (approval, signal) =>
                    check(
                        await api.DELETE("/v1/keys/{id}", {
                            params: { path: { id } },
                            headers: { "X-Mobile-Step-Up": approval },
                            signal,
                        }),
                    ),
            );
            await query.refetch();
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Access module="keys">
            <Screen scroll>
                <Label size="h1">{t("keys")}</Label>
                {secret ? (
                    <Card>
                        <Label>{t("keySecret")}</Label>
                        <Label selectable>{secret}</Label>
                        <Button
                            label={t("close")}
                            onPress={() => setSecret(null)}
                        />
                    </Card>
                ) : (
                    <Card>
                        <Input
                            label={t("keyName")}
                            value={name}
                            onChangeText={setName}
                            maxLength={80}
                        />
                        <Input
                            label={t("days")}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <View>
                            {choices.map((key) => (
                                <Chip
                                    key={key}
                                    label={key}
                                    selected={abilities.includes(key)}
                                    onPress={() =>
                                        setAbilities((old) =>
                                            old.includes(key)
                                                ? old.filter(
                                                      (value) => value !== key,
                                                  )
                                                : [...old, key],
                                        )
                                    }
                                />
                            ))}
                        </View>
                        <Button
                            label={t("createKey")}
                            loading={busy}
                            disabled={
                                !name.trim() ||
                                !abilities.length ||
                                !Number.isInteger(Number(days)) ||
                                Number(days) < 1 ||
                                Number(days) > 365
                            }
                            onPress={() => void create()}
                        />
                    </Card>
                )}
                {!!error && <ErrorState error={error} />}{" "}
                {query.error ? (
                    <ErrorState
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
                ) : (
                    query.data?.map((key) => (
                        <Row
                            key={key.id}
                            title={key.name}
                            subtitle={`${key.abilities.join(", ")} · ${date(key.expires_at)}`}
                            trailing={
                                <Button
                                    label={t("revoke")}
                                    variant="danger"
                                    disabled={busy}
                                    onPress={() => void revoke(key.id)}
                                />
                            }
                        />
                    ))
                )}{" "}
            </Screen>
        </Access>
    );
}
