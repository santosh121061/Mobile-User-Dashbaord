import { useTitle } from "@/components/forms";
import { ShieldCheck, Smartphone, Laptop } from "lucide-react-native";
import { FormIntro } from "@/components/form-intro";
import { KeyRow } from "@/components/details";
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
import { useFeatureAction } from "@/features/use-feature-action";
import { useFeatureWork } from "@/features/use-feature-work";
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
  const runAction = useFeatureAction();
  const work = useFeatureWork();
  const { error, busy } = work;
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
  const revoke = (id: string, current = false) =>
    work.run(async (scope) => {
      await runAction(
        scope,
        "DELETE",
        browser
          ? `/api/v1/profile/sessions/${id}`
          : `/api/v1/profile/mobile-sessions/${id}`,
        async (signal) =>
          check(
            browser
              ? await api.DELETE("/v1/profile/sessions/{id}", {
                  params: { path: { id } },
                  signal,
                })
              : await api.DELETE("/v1/profile/mobile-sessions/{id}", {
                  params: { path: { id } },
                  signal,
                }),
          ),
        true,
      );
      scope.assertCurrent();
      if (current) await session.logout();
      else {
        if (browser) await web.refetch();
        else await mobile.refetch();
        scope.assertCurrent();
        setSelected(null);
      }
    });
  const selectedMobile = !browser
    ? mobile.rows.find((row) => row.id === selected)
    : undefined;
  const selectedWeb = browser
    ? web.data?.find((row) => row.id === selected)
    : undefined;
  return (
    <Screen>
      <FormIntro
        icon={ShieldCheck}
        title={t("devicesIntro")}
        subtitle={t("devicesIntroHint")}
        tone="mint"
      />
      <Label size="section">{browser ? t("webSessions") : "This device"}</Label>
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
                    size="section"
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
          closeDisabled={busy}
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
          {selectedMobile && (
            <>
              <KeyRow
                label="Type"
                value={selectedMobile.current ? "This device" : "Other device"}
              />
              <KeyRow label="Created" value={date(selectedMobile.created_at)} />
              {selectedMobile.last_used_at && (
                <KeyRow
                  label="Last active"
                  value={date(selectedMobile.last_used_at)}
                />
              )}
              {selectedMobile.expires_at && (
                <KeyRow
                  label={t("expires")}
                  value={date(selectedMobile.expires_at)}
                />
              )}
            </>
          )}
          {selectedWeb && (
            <>
              <KeyRow label="Type" value={t("webSessions")} />
              {selectedWeb.ip_address && (
                <KeyRow label="IP address" value={selectedWeb.ip_address} />
              )}
              <KeyRow
                label="Last active"
                value={date(
                  new Date(selectedWeb.last_activity * 1000).toISOString(),
                )}
              />
            </>
          )}
          <Button
            variant="danger"
            label={t("revoke")}
            disabled={!!busy}
            loading={busy}
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
