import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Network from "expo-network";
import { z } from "zod";
import {
  api,
  attachSession,
  revokeCurrentSession,
  unlinkCurrentPushSession,
  unwrap,
} from "@/api/client";
import { clearNativePush } from "@/push/native";
import { discardPushIntent } from "@/push/intents";
import {
  bootstrapSchema,
  brandingSchema,
  envelope,
  sessionSchema,
  type Bootstrap,
  type Branding,
} from "@/api/runtime";
import { queryClient } from "@/api/query";
import { configured } from "@/config/environment";
import { attachDatePreferences } from "@/localization";
import { requiresLocalLock } from "@/utils/layout";
import {
  clearSession,
  loadSession,
  loadBiometric,
  saveSession,
  saveBiometric,
  StorageCleanupError,
  StorageWriteError,
} from "@/storage/session-state";
import {
  createPrivateWork,
  cancelledWork,
  type PrivateWork,
} from "./private-work";
type Phase =
  | "checking"
  | "signedOut"
  | "ready"
  | "locked"
  | "unavailable"
  | "loggingOut"
  | "storageBlocked";
type State = {
  phase: Phase;
  bootstrap: Bootstrap | null;
  biometric: boolean;
  features: Record<string, boolean>;
  branding?: Branding;
  unavailableError?: unknown;
};
type Context = State & {
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  unlock: () => Promise<boolean>;
  setBiometric: (enabled: boolean) => Promise<boolean>;
  captureWork: () => PrivateWork;
};
const context = createContext<Context | null>(null);
export function SessionProvider({ children }: React.PropsWithChildren) {
  const [state, setState] = useState<State>({
    phase: "checking",
    bootstrap: null,
    biometric: false,
    features: {},
  });
  const stateRef = useRef(state);
  const phase = useRef<Phase>("checking");
  const token = useRef<string | null>(null);
  const pendingRevocation = useRef<string | null>(null);
  const expires = useRef(0);
  const localLock = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const foreground = useRef(AppState.currentState === "active");
  const signingIn = useRef(false);
  const deniedPaths = useRef(new Set<string>());
  const refreshTask = useRef<Promise<void> | null>(null);
  const refreshAbort = useRef<AbortController | null>(null);
  const privateWorks = useRef(new Set<PrivateWork>());
  const update = useCallback((value: Partial<State>) => {
    stateRef.current = { ...stateRef.current, ...value };
    if (value.phase) phase.current = value.phase;
    if (mounted.current) setState(stateRef.current);
  }, []);
  const invalidate = useCallback(() => {
    epoch.current++;
    refreshTask.current = null;
    refreshAbort.current?.abort();
    refreshAbort.current = null;
    for (const work of privateWorks.current) work.cancel();
    privateWorks.current.clear();
    void queryClient.cancelQueries();
  }, []);
  const captureWork = useCallback(() => {
    const generation = epoch.current;
    const bearer = token.current;
    const account = stateRef.current.bootstrap;
    const current = () =>
      mounted.current &&
      foreground.current &&
      !localLock.current &&
      phase.current === "ready" &&
      generation === epoch.current &&
      bearer === token.current &&
      !!account &&
      account.account.id === stateRef.current.bootstrap?.account.id &&
      account.access_revision === stateRef.current.bootstrap?.access_revision &&
      account.configuration_revision ===
        stateRef.current.bootstrap?.configuration_revision;
    if (!current()) throw cancelledWork();
    const work = createPrivateWork(current, () =>
      privateWorks.current.delete(work),
    );
    privateWorks.current.add(work);
    return work;
  }, []);
  const wipe = useCallback(
    async (keepLogin = false) => {
      void clearNativePush().catch(() => {});
      token.current = null;
      expires.current = 0;
      localLock.current = false;
      invalidate();
      deniedPaths.current.clear();
      queryClient.clear();
      const generation = epoch.current;
      update({
        phase: keepLogin ? "signedOut" : "loggingOut",
        bootstrap: null,
        biometric: false,
        unavailableError: undefined,
      });
      try {
        await clearSession();
        if (mounted.current && generation === epoch.current) {
          pendingRevocation.current = null;
          update({ phase: "signedOut" });
        }
        return true;
      } catch {
        if (mounted.current && generation === epoch.current)
          update({ phase: "storageBlocked" });
        return false;
      }
    },
    [invalidate, update],
  );
  const discardUnpersisted = useCallback(
    async (captured: string) => {
      if (mounted.current && token.current === captured) {
        pendingRevocation.current = captured;
        await wipe();
      }
      try {
        await revokeCurrentSession(captured);
      } catch {
        /* Cleanup prevents restoring this credential when remote revocation is unavailable. */
      }
    },
    [wipe],
  );
  const refresh = useCallback(async () => {
    if (
      !mounted.current ||
      !foreground.current ||
      signingIn.current ||
      ["loggingOut", "storageBlocked"].includes(phase.current)
    )
      return;
    if (refreshTask.current) return refreshTask.current;
    const generation = epoch.current;
    const abort = new AbortController();
    refreshAbort.current = abort;
    const current = () =>
      mounted.current &&
      foreground.current &&
      generation === epoch.current &&
      !abort.signal.aborted;
    const privateCurrent = () =>
      current() &&
      !localLock.current &&
      !!token.current &&
      expires.current > Date.now();
    const work = async () => {
      let persisting: string | null = null;
      update({ phase: "checking", unavailableError: undefined });
      await queryClient.cancelQueries();
      if (!current()) return;
      try {
        if (!configured) {
          queryClient.clear();
          update({ phase: "unavailable", bootstrap: null });
          return;
        }
        const config = unwrap(
          await api.GET("/v1/mobile/config", {
            signal: abort.signal,
          }),
          envelope(
            z.object({
              features: z.record(z.string(), z.boolean()),
              branding: brandingSchema.optional(),
            }),
          ),
        ).data;
        if (!current()) return;
        update({
          features: config.features,
          branding: config.branding,
        });
        if (!config.features["api.enabled"]) {
          queryClient.clear();
          update({ phase: "unavailable", bootstrap: null });
          return;
        }
        if (!token.current) {
          update({ phase: "signedOut", bootstrap: null });
          return;
        }
        if (expires.current <= Date.now()) {
          await wipe();
          return;
        }
        if (localLock.current) {
          update({ phase: "locked", bootstrap: null });
          return;
        }
        let snapshot = unwrap(
          await api.GET("/v1/mobile/bootstrap", {
            signal: abort.signal,
          }),
          envelope(bootstrapSchema),
        ).data;
        if (!privateCurrent()) return;
        if (snapshot.session_needs_sync) {
          const synchronized = unwrap(
            await api.POST("/v1/mobile/session/sync", {
              signal: abort.signal,
            }),
            sessionSchema,
          );
          if (!privateCurrent()) return;
          token.current = synchronized.access_token;
          persisting = synchronized.access_token;
          expires.current = new Date(synchronized.expires_at).getTime();
          if (
            !(await saveSession(
              synchronized.access_token,
              synchronized.expires_at,
              privateCurrent,
            ))
          ) {
            await discardUnpersisted(synchronized.access_token);
            return;
          }
          if (!privateCurrent()) return;
          snapshot = unwrap(
            await api.GET("/v1/mobile/bootstrap", {
              signal: abort.signal,
            }),
            envelope(bootstrapSchema),
          ).data;
        }
        if (!privateCurrent()) return;
        const old = stateRef.current.bootstrap;
        if (
          !old ||
          old.account.id !== snapshot.account.id ||
          old.configuration_revision !== snapshot.configuration_revision ||
          old.access_revision !== snapshot.access_revision
        ) {
          queryClient.clear();
          deniedPaths.current.clear();
          for (const item of privateWorks.current) item.cancel();
          privateWorks.current.clear();
        }
        update({
          bootstrap: snapshot,
          phase: "ready",
          unavailableError: undefined,
        });
      } catch (failure) {
        if (failure instanceof StorageWriteError && persisting) {
          await discardUnpersisted(persisting);
          return;
        }
        if (current()) {
          queryClient.clear();
          update({
            phase: token.current ? "unavailable" : "signedOut",
            bootstrap: null,
            unavailableError: failure,
          });
        }
      }
    };
    const pending = work();
    refreshTask.current = pending;
    try {
      await pending;
    } finally {
      if (refreshTask.current === pending) refreshTask.current = null;
      if (refreshAbort.current === abort) refreshAbort.current = null;
    }
  }, [discardUnpersisted, update, wipe]);
  useEffect(() => {
    mounted.current = true;
    const detachDatePreferences = attachDatePreferences(
      () => stateRef.current.bootstrap?.appearance,
    );
    const detach = attachSession(
      () =>
        foreground.current &&
        !localLock.current &&
        ["ready", "checking", "loggingOut"].includes(phase.current)
          ? token.current
          : null,
      () => {
        void wipe();
      },
      (path) => {
        if (phase.current === "ready" && !deniedPaths.current.has(path)) {
          deniedPaths.current.add(path);
          queryClient.clear();
          void refresh();
        }
      },
    );
    let disposed = false;
    const generation = epoch.current;
    void (async () => {
      try {
        const restored = await loadSession();
        const biometric = await loadBiometric();
        if (disposed || generation !== epoch.current) return;
        if (restored && new Date(restored.expires).getTime() > Date.now()) {
          token.current = restored.token;
          expires.current = new Date(restored.expires).getTime();
          localLock.current = true;
          update({ biometric });
        } else if (!(await wipe())) return;
      } catch {
        if (!disposed && !(await wipe())) return;
      }
      if (!disposed) await refresh();
    })();
    return () => {
      disposed = true;
      mounted.current = false;
      invalidate();
      token.current = null;
      expires.current = 0;
      localLock.current = true;
      detachDatePreferences();
      if (detach()) queryClient.clear();
    };
  }, [invalidate, refresh, update, wipe]);
  useEffect(() => {
    let background: number | null = null,
      wall: number | null = null;
    const subscription = AppState.addEventListener("change", (next) => {
      foreground.current = next === "active";
      if (next !== "active") {
        background ??= performance.now();
        wall ??= Date.now();
        invalidate();
        if (
          token.current &&
          !["loggingOut", "storageBlocked", "locked"].includes(phase.current)
        )
          update({ phase: "checking" });
      } else {
        const mustLock =
          background !== null &&
          (requiresLocalLock(background, performance.now()) ||
            requiresLocalLock(wall ?? Date.now(), Date.now()));
        background = null;
        wall = null;
        if (token.current && (mustLock || localLock.current)) {
          invalidate();
          localLock.current = true;
          queryClient.clear();
          update({ phase: "locked", bootstrap: null });
        } else void refresh();
      }
    });
    return () => subscription.remove();
  }, [invalidate, refresh, update]);
  useEffect(() => {
    if (!token.current) return;
    const timer = setTimeout(
      () => {
        if (token.current && expires.current <= Date.now()) void wipe();
      },
      Math.max(0, expires.current - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.phase, wipe]);
  useEffect(() => {
    let disconnected = false;
    const subscription = Network.addNetworkStateListener((next) => {
      if (
        next.isConnected === false &&
        !["loggingOut", "storageBlocked"].includes(phase.current)
      ) {
        disconnected = true;
        invalidate();
        queryClient.clear();
        update({ phase: "unavailable", bootstrap: null });
      } else if (next.isConnected && disconnected && foreground.current) {
        disconnected = false;
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [invalidate, refresh, update]);
  const signIn = useCallback(
    async (email: string, password: string) => {
      if (signingIn.current) throw cancelledWork();
      signingIn.current = true;
      const generation = epoch.current + 1;
      const current = () =>
        mounted.current && foreground.current && generation === epoch.current;
      try {
        // Preserve the form so pending state and request failures stay visible.
        if (!(await wipe(true))) throw new StorageCleanupError();
        if (!current()) throw cancelledWork();
        const issued = unwrap(
          await api.POST("/v1/auth/login", {
            body: {
              email,
              password,
              device_name: "User Dashboard",
              client: "mobile",
            },
          }),
          sessionSchema,
        );
        if (!current()) {
          try {
            await revokeCurrentSession(issued.access_token);
          } catch {
            /* Stale issuance is never installed in the local session. */
          }
          throw cancelledWork();
        }
        token.current = issued.access_token;
        expires.current = new Date(issued.expires_at).getTime();
        localLock.current = false;
        try {
          if (
            !(await saveSession(
              issued.access_token,
              issued.expires_at,
              current,
            ))
          ) {
            await discardUnpersisted(issued.access_token);
            return;
          }
        } catch {
          await discardUnpersisted(issued.access_token);
          throw new StorageCleanupError();
        }
      } finally {
        signingIn.current = false;
      }
      if (current()) await refresh();
    },
    [discardUnpersisted, refresh, wipe],
  );
  const logout = useCallback(async () => {
    discardPushIntent();
    const captured = token.current ?? pendingRevocation.current;
    pendingRevocation.current = captured;
    const cleanup = wipe();
    const remote = (async () => {
      try {
        if (captured) {
          try {
            await unlinkCurrentPushSession(captured);
          } catch {
            /* Local cleanup and revocation continue even when unlink cannot be confirmed. */
          }
          await revokeCurrentSession(captured);
        }
      } catch {
        /* Durable local removal is independent of remote availability. */
      }
    })();
    await cleanup;
    await remote;
  }, [wipe]);
  const unlock = useCallback(async () => {
    const captured = token.current;
    if (!captured || !stateRef.current.biometric || phase.current !== "locked")
      return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock User Dashboard",
      disableDeviceFallback: true,
    });
    if (
      !result.success ||
      captured !== token.current ||
      !mounted.current ||
      expires.current <= Date.now()
    )
      return false;
    localLock.current = false;
    await refresh();
    return stateRef.current.phase === "ready";
  }, [refresh]);
  const setBiometric = useCallback(
    async (enabled: boolean) => {
      const captured = token.current;
      if (!captured || phase.current !== "ready") return false;
      if (
        enabled &&
        (!(await LocalAuthentication.hasHardwareAsync()) ||
          !(await LocalAuthentication.isEnrolledAsync()))
      )
        return false;
      if (
        enabled &&
        !(
          await LocalAuthentication.authenticateAsync({
            promptMessage: "Enable biometric unlock",
            disableDeviceFallback: true,
          })
        ).success
      )
        return false;
      const current = () =>
        mounted.current &&
        captured === token.current &&
        !["loggingOut", "storageBlocked", "signedOut"].includes(phase.current);
      if (!(await saveBiometric(enabled, current)) || !current()) return false;
      update({ biometric: enabled });
      return true;
    },
    [update],
  );
  return (
    <context.Provider
      value={{
        ...state,
        signIn,
        logout,
        refresh,
        unlock,
        setBiometric,
        captureWork,
      }}
    >
      {children}
    </context.Provider>
  );
}
export function useSession() {
  const value = useContext(context);
  if (!value) throw new Error("Session provider missing");
  return value;
}
export function useBootstrap() {
  const { bootstrap } = useSession();
  if (!bootstrap) throw new Error("Authenticated bootstrap missing");
  return bootstrap;
}
