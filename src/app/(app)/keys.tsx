import { Sheet } from "@/components/sheet";
import { useTitle } from "@/components/forms";
import { KeyRound, Plus, LockKeyhole, Ellipsis } from "lucide-react-native";
import { FormIntro } from "@/components/form-intro";
import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { KeyRow } from "@/components/details";
import { View } from "react-native";
import { z } from "zod";
import { api, ApiError, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope, idSchema } from "@/api/runtime";
import { useBootstrap, useSession } from "@/auth/session";
import { useFeatureAction } from "@/features/use-feature-action";
import { useFeatureWork } from "@/features/use-feature-work";
import { Access } from "@/components/access";
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Input,
  Label,
  Loading,
  Row,
  Screen,
} from "@/components/ui";
import { date, t } from "@/localization";
import { useTheme } from "@/theme";
const keySchema = z.object({
  id: idSchema,
  name: z.string(),
  abilities: z.array(z.string()),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
});
export default function Keys() {
  const snapshot = useBootstrap();
  const { phase } = useSession();
  if (!snapshot.features["api.enabled"])
    return (
      <Screen>
        <ErrorState error={new ApiError(403, {}, null)} />
      </Screen>
    );
  return (
    <KeyManager
      key={[
        snapshot.account.id,
        snapshot.access_revision,
        snapshot.configuration_revision,
        snapshot.availability_revision,
        ["ready", "checking"].includes(phase) ? "active" : phase,
      ].join(":")}
    />
  );
}
function KeyManager() {
  const { colors } = useTheme();
  useTitle(t("keys"));
  const snapshot = useBootstrap();
  const runAction = useFeatureAction();
  const work = useFeatureWork();
  const { error, busy } = work;
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
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  const [abilities, setAbilities] = useState<string[]>(["account.read"]);
  const [secret, setSecret] = useState<string | null>(null);
  const secretRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(
    () => () => {
      secretRef.current = null;
    },
    [],
  );
  const closeCreation = () => {
    secretRef.current = null;
    setSecret(null);
    setCopied(false);
    setCreating(false);
  };
  const choices = [
    ...new Set([
      "account.read",
      "account.update",
      "account.password",
      ...(snapshot.modules.notifications
        ? ["notifications.read", "notifications.update"]
        : []),
      ...Object.keys(snapshot.actions).filter((key) => snapshot.actions[key]),
    ]),
  ];
  const create = () =>
    work.run(async (scope) => {
      const issued = await runAction(
        scope,
        "POST",
        "/api/v1/keys",
        async (signal) =>
          unwrap(
            await api.POST("/v1/keys", {
              body: {
                name: name.trim(),
                days: Number(days),
                abilities: abilities.filter((value) => choices.includes(value)),
              },

              signal,
            }),
            z.object({ access_token: z.string().min(1) }),
          ),
      );
      scope.assertCurrent();
      secretRef.current = issued.access_token;
      setSecret(issued.access_token);
      setCopied(false);
      setName("");
      await query.refetch();
      scope.assertCurrent();
    });
  const copy = () =>
    work.run(async (scope) => {
      scope.assertCurrent();
      const value = secretRef.current;
      if (!value) throw new Error("This secret is no longer available.");
      const saved = await Clipboard.setStringAsync(value);
      scope.assertCurrent();
      if (!saved)
        throw new Error(
          "Clipboard unavailable. You can select and copy the key.",
        );
      setCopied(true);
    });
  const revoke = (id: string) =>
    work.run(async (scope) => {
      await runAction(scope, "DELETE", `/api/v1/keys/${id}`, async (signal) =>
        check(
          await api.DELETE("/v1/keys/{id}", {
            params: { path: { id } },

            signal,
          }),
        ),
      );
      scope.assertCurrent();
      await query.refetch();
      scope.assertCurrent();
      setSelected(null);
    });
  const selectedKey = query.data?.find((key) => key.id === selected);
  return (
    <Access module="keys">
      <Screen scroll>
        <FormIntro
          icon={KeyRound}
          title={t("keysIntro")}
          subtitle={t("keysIntroHint")}
          tone="gold"
        />
        <Button
          label={t("createKey")}
          displayLabel="Create API key"
          icon={<Plus size={20} color="#FFFFFF" />}
          onPress={() => setCreating(true)}
          disabled={busy}
        />
        {creating && (
          <Sheet
            title={t("createKey")}
            closeDisabled={busy}
            close={() => {
              if (!busy) closeCreation();
            }}
          >
            {secret ? (
              <Card>
                <Label>{t("keySecret")}</Label>
                <Label selectable>{secret}</Label>
                <Button
                  label="Copy key"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void copy()}
                />
                {copied && (
                  <Label accessibilityLiveRegion="polite">Key copied</Label>
                )}
                <Button
                  label={t("close")}
                  disabled={busy}
                  onPress={closeCreation}
                />
              </Card>
            ) : (
              <Card>
                <Input
                  label={t("keyName")}
                  required
                  value={name}
                  onChangeText={setName}
                  maxLength={80}
                  editable={!busy}
                  error={
                    error instanceof ApiError
                      ? error.fields.name?.[0]
                      : undefined
                  }
                />
                <Input
                  label={t("days")}
                  value={days}
                  onChangeText={setDays}
                  keyboardType="number-pad"
                  editable={!busy}
                  error={
                    error instanceof ApiError
                      ? error.fields.days?.[0]
                      : undefined
                  }
                />
                <View>
                  {choices.map((key) => (
                    <Chip
                      key={key}
                      label={key}
                      selected={abilities.includes(key)}
                      disabled={busy}
                      onPress={() =>
                        setAbilities((old) =>
                          old.includes(key)
                            ? old.filter((value) => value !== key)
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
                    !abilities.some((value) => choices.includes(value)) ||
                    !Number.isInteger(Number(days)) ||
                    Number(days) < 1 ||
                    Number(days) > 365
                  }
                  onPress={() => void create()}
                />
              </Card>
            )}
            <Button
              label={t("cancel")}
              variant="secondary"
              disabled={busy}
              onPress={closeCreation}
            />
            {!!error && <ErrorState error={error} />}
          </Sheet>
        )}
        <Label size="title">Active keys</Label>
        {query.isPending && <Loading />}
        {!!error && !creating && <ErrorState error={error} />}
        {query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          query.data?.map((key) => (
            <Row
              key={key.id}
              title={key.name}
              subtitle={`${key.abilities.join(", ")} · ${date(key.expires_at)}`}
              onPress={() => {
                if (!busy) setSelected(key.id);
              }}
              trailing={<Ellipsis size={20} color={colors.text.secondary} />}
            />
          ))
        )}
        {selectedKey && (
          <Sheet
            title={selectedKey.name}
            closeDisabled={busy}
            close={() => setSelected(null)}
          >
            <KeyRow label="Scope" value={selectedKey.abilities.join(", ")} />
            <KeyRow label="Last used" value={date(selectedKey.last_used_at)} />
            <KeyRow label="Expires" value={date(selectedKey.expires_at)} />
            <KeyRow label="Secret" value="Not available after creation" />
            <Button
              label={t("revoke")}
              variant="danger"
              disabled={busy}
              onPress={() => void revoke(selectedKey.id)}
            />
            {!!error && <ErrorState error={error} />}
          </Sheet>
        )}
        {!query.isPending && !query.error && query.data?.length === 0 && (
          <Label tone="secondary" size="secondary">
            No active keys. Create one when you need to connect a service.
          </Label>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderRadius: 13,
            backgroundColor: colors.brand.primarySoft,
            gap: 8,
            marginTop: 3,
          }}
        >
          <LockKeyhole size={14} color={colors.brand.primary} />
          <Label tone="secondary" size="caption" style={{ flex: 1 }}>
            A secret is shown once, when you create its key.
          </Label>
        </View>
      </Screen>
    </Access>
  );
}
