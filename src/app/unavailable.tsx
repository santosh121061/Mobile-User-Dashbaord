import { View } from "react-native";
import { Link2Off, House, RotateCw } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/theme";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Button, ErrorState, Label, Screen } from "@/components/ui";
import { useSession } from "@/auth/session";
import { ApiError } from "@/api/client";
import { permitsIntent, routeForIntent } from "@/utils/links";
import { readIntent } from "@/features/intent-retry";
import type { PrivateWork } from "@/auth/private-work";
import { BackHeader } from "@/components/chrome";
import { t } from "@/localization";
export default function Unavailable() {
  const router = useRouter();
  const { colors } = useTheme();
  const session = useSession();
  const current = useRef(session);
  useEffect(() => {
    current.current = session;
  }, [session]);
  const params = useLocalSearchParams<{ retry?: string; account?: string }>();
  const candidate =
    typeof params.retry === "string" &&
    routeForIntent(params.retry) === params.retry
      ? params.retry
      : null;
  const identity = [
    session.bootstrap?.account.id ?? params.account,
    ["ready", "checking", "unavailable"].includes(session.phase)
      ? "read"
      : session.phase,
  ].join(":");
  const active = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<{
    identity: string;
    busy: boolean;
    error: unknown;
  }>({ identity, busy: false, error: null });
  const canRetry =
    !!candidate &&
    typeof params.account === "string" &&
    (["ready", "unavailable"].includes(session.phase) ||
      (session.phase === "checking" &&
        status.identity === identity &&
        status.busy)) &&
    (!session.bootstrap || session.bootstrap.account.id === params.account);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [identity],
  );
  const retry = async () => {
    if (!canRetry || active.current || !candidate) return;
    const request = new AbortController();
    active.current = request;
    setStatus({ identity, busy: true, error: null });
    let scope: PrivateWork | undefined;
    const abort = () => scope?.cancel();
    request.signal.addEventListener("abort", abort);
    try {
      const snapshot = await session.refreshForRead();
      if (request.signal.aborted || active.current !== request) return;
      if (
        snapshot.account.id !== params.account ||
        !permitsIntent(candidate, snapshot)
      )
        throw new ApiError(403, {}, null);
      scope = current.current.captureWork();
      await readIntent(candidate, scope.signal);
      scope.assertCurrent();
      if (!request.signal.aborted && active.current === request)
        router.replace(candidate as Href);
    } catch (failure) {
      if (
        !request.signal.aborted &&
        active.current === request &&
        (!scope || scope.isCurrent())
      )
        setStatus({ identity, busy: false, error: failure });
    } finally {
      request.signal.removeEventListener("abort", abort);
      scope?.release();
      if (active.current === request) {
        active.current = null;
        if (!request.signal.aborted)
          setStatus((old) =>
            old.identity === identity ? { ...old, busy: false } : old,
          );
      }
    }
  };
  return (
    <Screen
      safeTop
      header={<BackHeader title="Link unavailable" fallback="/" />}
      contentStyle={{
        flex: 1,
        gap: 15,
        maxWidth: 550,
      }}
    >
      <View
        style={{
          alignItems: "center",
          gap: 0,
          paddingTop: 52,
          paddingHorizontal: 10,
        }}
      >
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 24,
            backgroundColor: colors.status.successSoft,
            marginBottom: 23,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Link2Off size={34} color={colors.brand.primary} />
        </View>
        <Label size="h1" style={{ textAlign: "center" }}>
          This link isn’t available
        </Label>
        <Label
          tone="secondary"
          style={{ textAlign: "center", marginTop: 12, marginBottom: 24 }}
        >
          {t("unavailableHint")}
        </Label>
        <View style={{ width: "100%" }}>
          <Button
            label="Go to Home"
            icon={<House size={20} color="#FFFFFF" />}
            onPress={() => router.replace("/")}
          />
          {canRetry && (
            <Button
              label="Try again"
              variant="secondary"
              loading={status.identity === identity && status.busy}
              icon={<RotateCw size={20} color={colors.brand.primary} />}
              onPress={() => void retry()}
            />
          )}
          {status.identity === identity && !!status.error && (
            <ErrorState error={status.error} />
          )}
        </View>
      </View>
    </Screen>
  );
}
