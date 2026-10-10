import { FileCheck2, CircleAlert, FileDown } from "lucide-react-native";
import { View } from "react-native";
import { KeyRow } from "@/components/details";
import { GradientFill } from "@/components/gradient";
import { useTheme } from "@/theme";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { File } from "expo-file-system";
import { api, check, ApiError, unwrap } from "@/api/client";
import { operationSchema } from "@/api/contracts";
import { queryClient, queryKey } from "@/api/query";
import { useBootstrap, useSession } from "@/auth/session";
import { exportLocation, shareBytes, bytes } from "@/features/exports";
import { useOperation } from "@/features/use-operation";
import { FeaturePane } from "@/features/feature-pane";
import type { PrivateWork } from "@/auth/private-work";
import {
  Button,
  Card,
  ErrorState,
  Label,
  Loading,
  Screen,
} from "@/components/ui";
import { useTitle } from "@/components/forms";
import { number, t } from "@/localization";

export default function Operation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const snapshot = useBootstrap();
  return (
    <OperationDetail
      key={[
        id,
        snapshot.account.id,
        snapshot.access_revision,
        snapshot.configuration_revision,
      ].join(":")}
      id={id}
    />
  );
}
function OperationDetail({ id }: { id: string }) {
  const snapshot = useBootstrap();
  const { colors, dark } = useTheme();
  const { captureWork } = useSession();
  const active = useRef<PrivateWork | null>(null);
  const mounted = useRef(true);
  const file = useRef<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const query = useOperation(id);
  let linkExpires: number | null = null;
  if (query.data?.download_url) {
    try {
      linkExpires = exportLocation(query.data.download_url, id).expires * 1000;
    } catch {
      linkExpires = 0;
    }
  }
  const expired = linkExpires !== null && linkExpires <= clock;
  useTitle("Operation details");
  useEffect(() => {
    const holder = file;
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
      if (holder.current?.exists) holder.current.delete();
    };
  }, []);
  useEffect(() => {
    if (linkExpires === null || linkExpires <= clock) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(Math.max(0, linkExpires - Date.now()), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [linkExpires, clock]);
  const download = async () => {
    if (busy || active.current || !query.data?.download_url) return;
    let scope: PrivateWork;
    try {
      scope = captureWork();
    } catch {
      return;
    }
    active.current = scope;
    const cancelled = () => {
      if (mounted.current && active.current === scope) setBusy(false);
    };
    scope.signal.addEventListener("abort", cancelled);
    setBusy(true);
    setError(null);
    try {
      // Revalidate current ownership/state and obtain a fresh short-lived link on each explicit download.
      const current = unwrap(
        await api.GET("/v1/operations/{id}", {
          params: { path: { id } },
          signal: scope.signal,
        }),
        operationSchema,
      );
      scope.assertCurrent();
      if (current.id !== id) throw new Error("Unexpected operation response");
      queryClient.setQueryData(queryKey(snapshot, "operation", id), current);
      if (!current.download_url) return;
      const signed = exportLocation(current.download_url, id);
      if (signed.expires * 1000 <= Date.now()) {
        setClock(Date.now());
        return;
      }
      const response = await api.GET("/v1/operations/{id}/download", {
        params: { path: { id }, query: signed },
        parseAs: "arrayBuffer",
        signal: scope.signal,
      });
      scope.assertCurrent();
      check(response);
      await shareBytes(bytes(response.data), file, scope);
    } catch (failure) {
      if (scope.isCurrent()) setError(failure);
    } finally {
      scope.signal.removeEventListener("abort", cancelled);
      if (mounted.current && active.current === scope) setBusy(false);
      scope.release();
      if (active.current === scope) active.current = null;
    }
  };
  const missingFile = error instanceof ApiError && error.status === 410;
  return (
    <Screen scroll>
      <FeaturePane>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          query.data && (
            <>
              <Card
                style={{
                  overflow: "hidden",
                  padding: 20,
                  minHeight: 309,
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <GradientFill
                  colors={
                    dark ? ["#213B53", "#173D37"] : ["#E8F2FF", "#E4FAF1"]
                  }
                />
                <View
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 24,
                    backgroundColor: colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {query.data.status === "completed" ? (
                    <FileCheck2 size={34} color={colors.status.successText} />
                  ) : ["failed", "cancelled"].includes(query.data.status) ? (
                    <CircleAlert size={34} color={colors.status.dangerText} />
                  ) : (
                    <FileDown size={34} color={colors.brand.primary} />
                  )}
                </View>
                <Label
                  size="captionMedium"
                  accessibilityLiveRegion="polite"
                  style={{ color: colors.brand.primary }}
                >
                  {t(query.data.status)}
                </Label>
                <Label size="h1" style={{ textAlign: "center" }}>
                  {t(
                    query.data.kind === "bulk"
                      ? "bulk"
                      : query.data.status === "completed"
                        ? "reportReady"
                        : query.data.status === "failed"
                          ? "operationFailed"
                          : "reportPreparing",
                  )}
                </Label>
                <Label size="secondary" tone="secondary">
                  {query.data.action_label ??
                    t(query.data.kind === "bulk" ? "bulk" : "reports")}
                </Label>
              </Card>
              <Label size="title">Details</Label>
              <Card
                style={{ gap: 0, paddingHorizontal: 16, paddingVertical: 2 }}
              >
                <KeyRow label="Operation ID" value={id} />
                <KeyRow label="Records" value={number(query.data.total)} />
                <KeyRow
                  label="Processed"
                  value={number(query.data.updated_count)}
                />
                <KeyRow
                  label={t("operationSkipped")}
                  last={!query.data.action_label}
                  value={number(query.data.skipped_count)}
                />
                {query.data.action_label && (
                  <KeyRow label="Action" value={query.data.action_label} last />
                )}
              </Card>
              {query.data.message && (
                <Label
                  accessibilityRole={
                    query.data.status === "failed" ? "alert" : undefined
                  }
                >
                  {query.data.message}
                </Label>
              )}
              {expired && !missingFile && (
                <Label accessibilityRole="alert">
                  {t("exportLinkExpired")}
                </Label>
              )}
              {missingFile && (
                <Label accessibilityRole="alert">{t("exportExpired")}</Label>
              )}
              {query.data.download_url && !missingFile && (
                <Button
                  label={t("download")}
                  loading={busy}
                  onPress={() => void download()}
                />
              )}
              <Button
                label={t("exportLinkRefresh")}
                variant="secondary"
                loading={query.isRefetching}
                disabled={busy}
                onPress={() => {
                  setError(null);
                  void query.refetch();
                }}
              />
              {query.data.status === "failed" && !query.data.message && (
                <Label accessibilityRole="alert">{t("serverError")}</Label>
              )}
              {!!error && !missingFile && <ErrorState error={error} />}
            </>
          )
        )}
      </FeaturePane>
    </Screen>
  );
}
