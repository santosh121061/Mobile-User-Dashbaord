import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { router } from "expo-router";
import { api, check, unwrap } from "@/api/client";
import { envelope } from "@/api/runtime";
import { queryClient, queryKey } from "@/api/query";
import { useSession } from "@/auth/session";
import type { PrivateWork } from "@/auth/private-work";
import { permitsIntent, routeForIntent } from "@/utils/links";
import { t } from "@/localization";
import {
    notificationId,
    pushDestinationSchema,
    pushPreferencesSchema,
    pushRegistrationSchema,
    type PushPreferences,
} from "./contracts";
import {
    clearNativePush,
    listenPush,
    nativePushSupported,
    preparePush,
    PushPermissionDenied,
} from "./native";
import { discardPushIntent, receivePushIntent, usePushIntent } from "./intents";

type State = {
    owner: string;
    preferences: PushPreferences | null;
    busy: boolean;
    error: string | null;
    registered: boolean;
};
const context = createContext<
    | (State & {
          change: (enabled: boolean) => Promise<void>;
          retry: () => void;
          supported: boolean;
      })
    | null
>(null);
export const usePush = () => useContext(context);
export function PushProvider({ children }: React.PropsWithChildren) {
    const session = useSession();
    const { phase, bootstrap, captureWork, refresh } = session;
    const current = useRef(session);
    current.current = session;
    const owner = [
        session.bootstrap?.account.id,
        session.bootstrap?.access_revision,
        session.bootstrap?.configuration_revision,
    ].join(":");
    const [state, setState] = useState<State>({
        owner: "",
        preferences: null,
        busy: false,
        error: null,
        registered: false,
    });
    const [revision, setRevision] = useState(0);
    const active = useRef<PrivateWork | null>(null);
    const listeners = useRef<(() => void) | null>(null);
    const mounted = useRef(true);
    const tap = useRef<{ id: string; account: string } | null>(null);
    const [checkedTap, setCheckedTap] = useState<{
        id: string;
        account: string;
    } | null>(null);
    const pending = usePushIntent();
    const callbacks = useRef({
        changed: () => {},
        received: (_data: unknown) => {},
    });
    callbacks.current = {
        changed: () => setRevision((value) => value + 1),
        received: (data) => {
            const live = current.current;
            if (
                !notificationId(data) ||
                live.phase !== "ready" ||
                !live.bootstrap?.modules.notifications
            )
                return;
            for (const module of ["notifications", "notification-summary"]) {
                void queryClient.invalidateQueries({
                    queryKey: queryKey(live.bootstrap, module).slice(0, 5),
                });
            }
        },
    };
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (tap.current) discardPushIntent(tap.current.id);
            tap.current = null;
            active.current?.cancel();
            active.current?.release();
            listeners.current?.();
            listeners.current = null;
            void clearNativePush().catch(() => {});
        };
    }, []);
    const allowed = useCallback(
        (preferences: PushPreferences) =>
            nativePushSupported() &&
            preferences.provider.status === "ready" &&
            !!preferences.provider.project_id &&
            !!current.current.bootstrap?.modules.notifications &&
            !!current.current.bootstrap.features[
                "notifications.in_app.enabled"
            ],
        [],
    );
    const register = useCallback(
        async (
            scope: PrivateWork,
            preferences: PushPreferences,
            prompt: boolean,
        ) => {
            scope.assertCurrent();
            if (!allowed(preferences)) return false;
            if (!listeners.current) {
                const cleanup = await listenPush(
                    scope,
                    () => callbacks.current.changed(),
                    receivePushIntent,
                    (data) => callbacks.current.received(data),
                );
                if (!scope.isCurrent()) {
                    cleanup();
                    scope.assertCurrent();
                }
                listeners.current = cleanup;
            }
            const body = await preparePush(
                scope,
                preferences.provider.project_id!,
                prompt,
            );
            scope.assertCurrent();
            if (prompt) {
                check(
                    await api.PATCH("/v1/mobile/push/preferences", {
                        body: { enabled: true },
                        signal: scope.signal,
                    }),
                );
                scope.assertCurrent();
                setState((old) => ({
                    ...old,
                    owner,
                    preferences: { ...preferences, enabled: true },
                }));
            }
            unwrap(
                await api.POST("/v1/mobile/devices", {
                    body,
                    signal: scope.signal,
                }),
                envelope(pushRegistrationSchema),
            );
            scope.assertCurrent();
            return true;
        },
        [allowed, owner],
    );
    useEffect(() => {
        if (phase !== "ready") return;
        let scope: PrivateWork;
        try {
            scope = captureWork();
        } catch {
            return;
        }
        active.current = scope;
        void (async () => {
            try {
                const preferences = unwrap(
                    await api.GET("/v1/mobile/push/preferences", {
                        signal: scope.signal,
                    }),
                    envelope(pushPreferencesSchema),
                ).data;
                scope.assertCurrent();
                setState({
                    owner,
                    preferences,
                    busy: true,
                    registered: false,
                    error: null,
                });
                let registered = false;
                if (preferences.enabled && allowed(preferences))
                    registered = await register(scope, preferences, false);
                scope.assertCurrent();
                setState({
                    owner,
                    preferences,
                    busy: false,
                    registered,
                    error: null,
                });
            } catch (error) {
                if (!scope.isCurrent()) return;
                if (error instanceof PushPermissionDenied) {
                    try {
                        check(
                            await api.DELETE("/v1/mobile/devices/current", {
                                signal: scope.signal,
                            }),
                        );
                    } catch {
                        /* no local success claim for failed unlink */
                    }
                }
                if (scope.isCurrent())
                    setState((old) => ({
                        ...old,
                        owner,
                        busy: false,
                        registered: false,
                        error: t(
                            error instanceof PushPermissionDenied
                                ? "pushPermissionDenied"
                                : "pushUnavailable",
                        ),
                    }));
            } finally {
                if (active.current === scope) active.current = null;
                scope.release();
            }
        })();
        return () => {
            scope.cancel();
            scope.release();
            if (active.current === scope) active.current = null;
        };
    }, [owner, phase, revision, captureWork, register, allowed]);
    // Refresh exactly once for this tap. The checking phase retains the initiating
    // account, while logout/lock/account changes discard the work instead of replaying it.
    useEffect(() => {
        if (
            !pending ||
            phase !== "ready" ||
            !bootstrap ||
            tap.current?.id === pending
        )
            return;
        const request = { id: pending, account: bootstrap.account.id };
        tap.current = request;
        void refresh()
            .then(() => {
                if (mounted.current && tap.current === request)
                    setCheckedTap(request);
            })
            .catch(() => {
                if (tap.current === request) {
                    discardPushIntent(request.id);
                    tap.current = null;
                }
            });
    }, [pending, phase, bootstrap, refresh]);
    useEffect(() => {
        const request = tap.current;
        if (!pending || !request) return;
        if (
            request.id !== pending ||
            !bootstrap ||
            bootstrap.account.id !== request.account ||
            !["ready", "checking"].includes(phase)
        ) {
            tap.current = null;
            discardPushIntent(request.id);
        }
    }, [pending, phase, bootstrap]);
    useEffect(() => {
        const request = tap.current;
        if (
            !pending ||
            !request ||
            checkedTap !== request ||
            phase !== "ready" ||
            !bootstrap ||
            bootstrap.account.id !== request.account
        )
            return;
        let scope: PrivateWork;
        try {
            // The initiating scope cannot survive a legitimate authority revision;
            // capture only after the refreshed bootstrap has committed.
            scope = captureWork();
        } catch {
            discardPushIntent(request.id);
            tap.current = null;
            return;
        }
        void (async () => {
            let denied = false;
            try {
                if (!bootstrap.modules.notifications)
                    throw new Error("Unavailable destination");
                const response = await api.GET(
                    "/v1/mobile/notifications/{id}/destination",
                    {
                        params: { path: { id: request.id } },
                        signal: scope.signal,
                    },
                );
                scope.assertCurrent();
                if ([403, 404].includes(response.response.status)) {
                    // Show only the generic denied route before unwrap starts the
                    // shared authority refresh and invalidates this private scope.
                    denied = true;
                    router.push("/unavailable");
                }
                const result = unwrap(
                    response,
                    envelope(pushDestinationSchema),
                ).data;
                scope.assertCurrent();
                if (
                    tap.current !== request ||
                    result.notification_id !== request.id
                )
                    throw new Error("Unexpected notification");
                const route = routeForIntent(result.path);
                if (!permitsIntent(route, current.current.bootstrap!))
                    throw new Error("Unavailable destination");
                discardPushIntent(request.id);
                router.push(route);
            } catch {
                if (!denied && scope.isCurrent()) {
                    discardPushIntent(request.id);
                    router.push("/unavailable");
                }
            } finally {
                if (tap.current === request) {
                    tap.current = null;
                    discardPushIntent(request.id);
                }
                scope.release();
            }
        })();
        return () => {
            scope.cancel();
            scope.release();
            if (tap.current === request) {
                tap.current = null;
                discardPushIntent(request.id);
            }
        };
    }, [pending, checkedTap, phase, bootstrap, captureWork]);
    const change = async (enabled: boolean) => {
        if (
            active.current ||
            session.phase !== "ready" ||
            state.owner !== owner ||
            !state.preferences
        )
            return;
        let scope: PrivateWork;
        try {
            scope = session.captureWork();
        } catch {
            return;
        }
        active.current = scope;
        setState((old) => ({ ...old, busy: true, error: null }));
        try {
            let registered = false;
            if (enabled) {
                if (!allowed(state.preferences))
                    throw new Error("Push unavailable");
                registered = await register(scope, state.preferences, true);
            } else {
                check(
                    await api.PATCH("/v1/mobile/push/preferences", {
                        body: { enabled: false },
                        signal: scope.signal,
                    }),
                );
                scope.assertCurrent();
                // Local cleanup has no auth credential and cannot dispatch an app write.
                void clearNativePush().catch(() => {});
            }
            const preferences = unwrap(
                await api.GET("/v1/mobile/push/preferences", {
                    signal: scope.signal,
                }),
                envelope(pushPreferencesSchema),
            ).data;
            scope.assertCurrent();
            setState({
                owner,
                preferences,
                busy: false,
                error: null,
                registered,
            });
        } catch (error) {
            if (scope.isCurrent())
                setState((old) => ({
                    ...old,
                    busy: false,
                    registered: false,
                    error: t(
                        error instanceof PushPermissionDenied
                            ? "pushPermissionDenied"
                            : "pushUnavailable",
                    ),
                }));
        } finally {
            if (active.current === scope) active.current = null;
            scope.release();
        }
    };
    const visible = state.owner === owner && session.phase === "ready";
    return (
        <context.Provider
            value={{
                ...(visible
                    ? state
                    : {
                          owner,
                          preferences: null,
                          busy: false,
                          registered: false,
                          error: null,
                      }),
                change,
                retry: () => setRevision((value) => value + 1),
                supported: nativePushSupported(),
            }}
        >
            {children}
        </context.Provider>
    );
}
