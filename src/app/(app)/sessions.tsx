import { useTitle } from "@/components/forms";
import { ShieldCheck, Smartphone, Laptop } from "lucide-react-native";
import { FormIntro } from "@/components/form-intro";
import { View } from "react-native";
import { useState } from "react";
import { z } from "zod";
import { api, check, unwrap } from "@/api/client";
import { usePages, useRead } from "@/api/hooks";
import { envelope, idSchema, pageSchema } from "@/api/runtime";
import { useSession } from "@/auth/session";
import { Button, Chip, ErrorState, Label, Row, Screen } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { useTheme } from "@/theme";
import { Records } from "@/components/records";
import { date, t } from "@/localization";
const nativeSchema = z.object({
  id: idSchema,
  name: z.string(),
  current: z.boolean(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});
const browserSchema = z.object({
  id: z.string(),
  ip_address: z.string().nullable(),
  last_activity: z.number(),
});
export default function Sessions() {
  useTitle(t("sessions"));
  const session = useSession();
  const [browser, setBrowser] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { colors } = useTheme();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mobile = usePages(
    "mobile-sessions",
    null,
    async (page, signal) =>
      unwrap(
        await api.GET("/v1/profile/mobile-sessions", {
          params: { query: { page } },
          signal,
        }),
        pageSchema(nativeSchema),
      ),
    !browser,
  );
  const web = useRead(
    "web-sessions",
    null,
    async (signal) =>
      unwrap(
        await api.GET("/v1/profile/sessions", { signal }),
        envelope(z.array(browserSchema)),
      ).data,
    browser,
  );
  const revoke = async (id: string, current = false) => {
    setBusy(id);
    setError(null);
    try {
      check(
        browser
          ? await api.DELETE("/v1/profile/sessions/{id}", {
              params: { path: { id } },
            })
          : await api.DELETE("/v1/profile/mobile-sessions/{id}", {
              params: { path: { id } },
            }),
      );
      if (current) await session.logout();
      else if (browser) await web.refetch();
      else await mobile.refetch();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      <FormIntro
        icon={ShieldCheck}
        title={t("devicesIntro")}
        subtitle={t("devicesIntroHint")}
        tone="mint"
      />
      <Label size="title">{browser ? t("webSessions") : "This device"}</Label>
      {!!error && <ErrorState error={error} />}{" "}
      {browser ? (
        <Records
          rows={web.data ?? []}
          pending={web.isPending}
          error={web.error}
          retry={() => void web.refetch()}
          refreshing={web.isRefetching}
          render={(row) => (
            <Row
              title={t("webSessions")}
              subtitle={date(new Date(row.last_activity * 1000).toISOString())}
              leading={<Laptop size={22} color={colors.accent.purple} />}
              onPress={() => setSelected(row.id)}
            />
          )}
        />
      ) : (
        <Records
          rows={mobile.rows}
          pending={mobile.isPending}
          error={mobile.error}
          retry={() => void mobile.refetch()}
          refreshing={mobile.isRefetching}
          more={mobile.hasNextPage}
          loadingMore={mobile.isFetchingNextPage}
          next={() => void mobile.fetchNextPage()}
          render={(row) => (
            <View>
              {!row.current &&
                mobile.rows.find((item) => !item.current)?.id === row.id && (
                  <Label
                    size="title"
                    style={{ marginTop: 14, marginBottom: 12 }}
                  >
                    Other sessions
                  </Label>
                )}
              <Row
                title={row.current ? "This device" : row.name}
                subtitle={
                  row.last_used_at
                    ? `Last active ${date(row.last_used_at)}`
                    : `${t("expires")}: ${date(row.expires_at)}`
                }
                leading={
                  row.current ? (
                    <Smartphone size={22} color={colors.accent.mint} />
                  ) : (
                    <Laptop size={22} color={colors.accent.purple} />
                  )
                }
                onPress={() => setSelected(row.id)}
                trailing={
                  row.current ? (
                    <Label
                      size="captionMedium"
                      style={{
                        color: colors.status.successText,
                        backgroundColor: colors.status.successSoft,
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 9,
                      }}
                    >
                      Current
                    </Label>
                  ) : undefined
                }
              />
            </View>
          )}
        />
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Chip
          label={t("mobileSessions")}
          selected={!browser}
          onPress={() => {
            setBrowser(false);
            setSelected(null);
          }}
        />
        <Chip
          label={t("webSessions")}
          selected={browser}
          onPress={() => {
            setBrowser(true);
            setSelected(null);
          }}
        />
      </View>
      {!!selected && (
        <Sheet
          title={
            browser
              ? t("webSessions")
              : (mobile.rows.find((row) => row.id === selected)?.name ??
                t("sessions"))
          }
          close={() => {
            if (!busy) setSelected(null);
          }}
        >
          <Button
            variant="danger"
            label={t("revoke")}
            disabled={!!busy}
            loading={busy === selected}
            onPress={() =>
              void revoke(
                selected,
                !browser &&
                  mobile.rows.some((row) => row.id === selected && row.current),
              )
            }
          />
          <Button
            variant="tertiary"
            label={t("back")}
            disabled={!!busy}
            onPress={() => setSelected(null)}
          />
        </Sheet>
      )}
    </Screen>
  );
}
