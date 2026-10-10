import { useEffect, useRef, useState } from "react";
import { Redirect, router, type Href } from "expo-router";
import { useSession } from "@/auth/session";
import { currentIntent, discardIntent, useIntent } from "@/auth/intents";
import { permitsIntent, type MobileIntent } from "@/utils/links";
import { Loading } from "@/components/ui";

export default function IntentGate() {
  const intent = useIntent();
  const { phase, bootstrap, refresh, captureWork } = useSession();
  const refreshing = useRef<MobileIntent | null>(null);
  const mounted = useRef(true);
  const [checked, setChecked] = useState<MobileIntent | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      intent?.kind !== "record" ||
      phase !== "ready" ||
      refreshing.current === intent
    )
      return;
    refreshing.current = intent;
    void refresh().then(() => {
      if (mounted.current && currentIntent() === intent) setChecked(intent);
    });
  }, [intent, phase, refresh]);
  useEffect(() => {
    if (
      intent?.kind !== "record" ||
      checked !== intent ||
      phase !== "ready" ||
      !bootstrap
    )
      return;
    let scope;
    try {
      scope = captureWork();
      scope.assertCurrent();
      const route = permitsIntent(intent.route, bootstrap)
        ? intent.route
        : "/unavailable";
      router.replace(route as Href);
      discardIntent(intent);
    } catch {
      router.replace("/unavailable");
    } finally {
      scope?.release();
    }
  }, [intent, checked, phase, bootstrap, captureWork]);
  if (
    phase === "signedOut" ||
    phase === "locked" ||
    phase === "unavailable" ||
    phase === "storageBlocked"
  )
    return <Redirect href="/(auth)/login" />;
  if (!intent && !checked) return <Redirect href="/unavailable" />;
  return <Loading />;
}
