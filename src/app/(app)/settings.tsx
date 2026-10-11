import { View } from "react-native";
import { router } from "expo-router";
import { ToggleRow } from "@/components/details";
import { FeaturePane } from "@/features/feature-pane";
import { Settings2 } from "lucide-react-native";
import { FormIntro } from "@/components/form-intro";
import { useState } from "react";
import { z } from "zod";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { useBootstrap, useSession } from "@/auth/session";
import { useAuthenticatedAction } from "@/auth/authenticated-actions";
import { useDiscard, useTitle } from "@/components/forms";
import { Access } from "@/components/access";
import {
  Button,
  Card,
  ErrorState,
  Input,
  Loading,
  Label,
  Screen,
} from "@/components/ui";
import { t } from "@/localization";
const schema = z.object({
  values: z.record(z.string(), z.unknown()),
  defaults: z.record(z.string(), z.unknown()),
  version: z.string().length(64),
});
export default function Settings() {
  useTitle("Workspace settings");
  const snapshot = useBootstrap();
  const query = useRead(
    "settings",
    null,
    async (signal) =>
      unwrap(await api.GET("/v1/settings", { signal }), envelope(schema)).data,
    !!snapshot.modules.settings,
  );
  return (
    <Access module="settings">
      {query.isPending ? (
        <Screen>
          <Loading />
        </Screen>
      ) : query.error ? (
        <Screen>
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        </Screen>
      ) : (
        query.data && (
          <SettingsEditor
            key={query.data.version}
            initial={query.data}
            refresh={() => query.refetch()}
          />
        )
      )}
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
  const runAction = useAuthenticatedAction();
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
      await runAction("PATCH", "/api/v1/settings", async (signal) =>
        check(
          await api.PATCH("/v1/settings", {
            body: { values, version: initial.version },

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
  const title = (key: string) =>
    ({
      "account.email.enabled": "Security email",
      "account.recovery.enabled": "Password recovery",
      "account.verification.enabled": "Email verification",
      "account.require_verified": "Require verified email",
      "api.enabled": "API access",
      "branding.name": "Workspace name",
      "notifications.in_app.enabled": "Workspace notifications",
      "notifications.security_email.enabled": "Security alerts",
      "exports.enabled": "Data exports",
    })[key] ??
    key
      .replaceAll(".", " ")
      .replaceAll("_", " ")
      .replace(/^./, (c) => c.toUpperCase());
  const groups = [
    {
      label: "Account access",
      keys: Object.keys(values).filter((key) => key.startsWith("account.")),
    },
    {
      label: "Connected services",
      keys: Object.keys(values).filter((key) =>
        /^(api|notifications|exports)\./.test(key),
      ),
    },
    {
      label: "Workspace identity",
      keys: Object.keys(values).filter((key) => key.startsWith("branding.")),
    },
    {
      label: "Additional settings",
      keys: Object.keys(values).filter(
        (key) => !/^(account|api|notifications|exports|branding)\./.test(key),
      ),
    },
  ];
  return (
    <Screen
      scroll
      footer={
        canEdit && (
          <Button
            label={t("save")}
            disabled={!dirty || invalidKeys.length > 0}
            loading={busy}
            onPress={() => void save()}
          />
        )
      }
    >
      <FeaturePane wide>
        <FormIntro
          icon={Settings2}
          title={t("settingsIntro")}
          subtitle={t("settingsIntroHint")}
          tone="purple"
        />
        {groups
          .filter((group) => group.keys.length)
          .map((group) => (
            <View key={group.label} style={{ gap: 10, marginTop: 3 }}>
              <Label size="section" accessibilityRole="header">
                {group.label}
              </Label>
              <Card style={{ gap: 0, paddingVertical: 3 }}>
                {group.keys.map((key) => {
                  const value = values[key];
                  return (
                    <View
                      key={key}
                      style={{
                        paddingVertical: typeof value === "boolean" ? 0 : 14,
                      }}
                    >
                      {typeof value === "boolean" ? (
                        <ToggleRow
                          label={title(key)}
                          value={value}
                          disabled={!canEdit || busy}
                          onChange={(next) => change(key, next)}
                        />
                      ) : typeof value === "string" ||
                        typeof value === "number" ? (
                        <Input
                          label={title(key)}
                          value={String(value)}
                          editable={canEdit && !busy}
                          multiline={
                            key.includes("body") || key.includes("template")
                          }
                          onChangeText={(text) =>
                            change(
                              key,
                              typeof value === "number" ? Number(text) : text,
                            )
                          }
                        />
                      ) : (
                        <StructuredSetting
                          name={key}
                          value={value}
                          editable={canEdit && !busy}
                          onChange={(next) => change(key, next)}
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
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
        {!!error && <ErrorState error={error} />}
        <Button
          label="View settings activity"
          variant="secondary"
          onPress={() => router.push("/(app)/(tabs)/activity")}
        />
        <Button
          label={t("refresh")}
          variant="secondary"
          disabled={busy || dirty}
          onPress={() => void refresh()}
        />
      </FeaturePane>
    </Screen>
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
          if (!parsed || typeof parsed !== "object") throw new Error();
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
