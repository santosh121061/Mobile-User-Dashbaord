import React from "react";
import { Alert, AppState, BackHandler, Text } from "react-native";
import { Stack, router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import * as fence from "../src/storage/fence";
import { api } from "../src/api/client";
import { SessionProvider, useSession } from "../src/auth/session";
import { queryClient } from "../src/api/query";
import { storageNamespace } from "../src/config/environment";
import fixtures from "../api/fixtures.json";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { shareBytes } from "../src/features/exports";
import { useDiscard } from "../src/components/forms";
import { date } from "../src/localization";

jest.mock("../src/storage/fence", () => ({
    activate: jest.fn(),
    revoke: jest.fn(),
    matches: jest.fn(),
}));
jest.mock("expo-network", () => ({
    addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock("expo-local-authentication", () => ({
    authenticateAsync: jest.fn(async () => ({ success: true })),
    hasHardwareAsync: jest.fn(async () => true),
    isEnrolledAsync: jest.fn(async () => true),
}));
jest.mock("expo-file-system", () => ({
    Paths: { cache: "private-cache" },
    File: jest.fn().mockImplementation(() => ({
        exists: false,
        uri: "private-cache/owned.xlsx",
        create: jest.fn(),
        write: jest.fn(),
        delete: jest.fn(),
    })),
}));
jest.mock("expo-sharing", () => ({
    isAvailableAsync: jest.fn(async () => true),
    shareAsync: jest.fn(async () => undefined),
}));
const wrapper = ({ children }: React.PropsWithChildren) => (
    <SessionProvider>{children}</SessionProvider>
);
const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
    });
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
const sessionKey = storageNamespace + ".session";
let values: Map<string, string>, marker: string | null;
let onState: (state: "active" | "background") => void;
let handler: ((request: Request) => Promise<Response> | Response) | null;
let fetcher: jest.SpyInstance;
let account = 2;
let needsSync = false;
const calls = (path: string) =>
    fetcher.mock.calls
        .map(([request]) => request as Request)
        .filter((request) => new URL(request.url).pathname.endsWith(path));
async function ready() {
    const hook = renderHook(useSession, { wrapper });
    await waitFor(() => expect(hook.result.current.phase).toBe("signedOut"));
    await act(async () => {
        await hook.result.current.signIn(
            "synthetic@example.test",
            "SyntheticPassword",
        );
    });
    expect(hook.result.current.phase).toBe("ready");
    return hook;
}
beforeEach(() => {
    values = new Map();
    marker = null;
    handler = null;
    account = 2;
    needsSync = false;
    queryClient.clear();
    jest.clearAllMocks();
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(SecureStore.getItemAsync).mockImplementation(
        async (key) => values.get(key) ?? null,
    );
    jest.mocked(SecureStore.setItemAsync).mockImplementation(
        async (key, value) => {
            values.set(key, value);
        },
    );
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
        values.delete(key);
    });
    jest.mocked(fence.activate).mockImplementation((nonce) => {
        marker = nonce;
    });
    jest.mocked(fence.revoke).mockImplementation(() => {
        marker = null;
    });
    jest.mocked(fence.matches).mockImplementation((nonce) => marker === nonce);
    jest.spyOn(AppState, "addEventListener").mockImplementation(
        (_name, listener) => {
            onState = listener as typeof onState;
            return { remove: jest.fn() };
        },
    );
    fetcher = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
        const request = input as Request;
        if (handler) return handler(request);
        return defaultResponse(request);
    });
});
afterEach(() => {
    queryClient.clear();
    jest.restoreAllMocks();
});
function defaultResponse(request: Request): Response {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/mobile/config")) return json(fixtures.configuration);
    if (path.endsWith("/auth/login") || path.endsWith("/session/sync"))
        return json({
            access_token: needsSync ? "rotated-session" : "session-" + account,
            token_type: "Bearer",
            expires_at: new Date(Date.now() + 3600000).toISOString(),
        });
    if (path.endsWith("/mobile/bootstrap"))
        return json({
            data: {
                ...fixtures.bootstrap.data,
                account: { ...fixtures.bootstrap.data.account, id: account },
                session_needs_sync: needsSync,
            },
        });
    if (path.endsWith("/token") && request.method === "DELETE")
        return new Response(null, { status: 204 });
    if (path.endsWith("/profile")) return json(fixtures.profile);
    throw new Error("Unexpected synthetic request: " + path);
}
it("sends the captured bearer for locked logout while withholding it from ordinary locked reads", async () => {
    marker = "restore-marker";
    values.set(
        sessionKey,
        JSON.stringify({
            token: "restored-session",
            expires: new Date(Date.now() + 3600000).toISOString(),
            nonce: marker,
        }),
    );
    const hook = renderHook(useSession, { wrapper });
    await waitFor(() => expect(hook.result.current.phase).toBe("locked"));
    expect(calls("/mobile/bootstrap")).toHaveLength(0);
    await api.GET("/v1/profile");
    expect(calls("/profile")[0]!.headers.get("Authorization")).toBeNull();
    await act(async () => {
        await hook.result.current.logout();
    });
    expect(calls("/token")[0]!.headers.get("Authorization")).toBe(
        "Bearer restored-session",
    );
    expect(hook.result.current.phase).toBe("signedOut");
    expect(values.has(sessionKey)).toBe(false);
    hook.unmount();
});
it("aborts a delayed bootstrap and never opens private UI after a three-minute background lock", async () => {
    const hook = await ready();
    const held = deferred<Response>();
    handler = (request) =>
        new URL(request.url).pathname.endsWith("/mobile/bootstrap")
            ? held.promise
            : defaultResponse(request);
    let refresh!: Promise<void>;
    act(() => {
        refresh = hook.result.current.refresh();
    });
    await waitFor(() => expect(calls("/mobile/bootstrap")).toHaveLength(2));
    const request = calls("/mobile/bootstrap")[1]!;
    act(() => onState("background"));
    expect(request.signal.aborted).toBe(true);
    const later = Date.now() + 180001;
    jest.spyOn(Date, "now").mockReturnValue(later);
    act(() => onState("active"));
    expect(hook.result.current.phase).toBe("locked");
    await act(async () => {
        held.resolve(defaultResponse(request));
        await refresh;
    });
    expect(hook.result.current.phase).toBe("locked");
    expect(hook.result.current.bootstrap).toBeNull();
    hook.unmount();
});
it("blocks login on failed deletion and cannot restore a leftover keychain credential after restart", async () => {
    const hook = await ready();
    handler = (request) => {
        if (new URL(request.url).pathname.endsWith("/token"))
            throw new Error("Offline");
        return defaultResponse(request);
    };
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValue(
        new Error("Keychain unavailable"),
    );
    await act(async () => {
        await hook.result.current.logout();
    });
    expect(hook.result.current.phase).toBe("storageBlocked");
    expect(values.has(sessionKey)).toBe(true);
    expect(marker).toBeNull();
    await act(async () => {
        await expect(
            hook.result.current.signIn("other@example.test", "Password"),
        ).rejects.toThrow("storage cleanup");
    });
    expect(calls("/auth/login")).toHaveLength(1);
    hook.unmount();
    const restarted = renderHook(useSession, { wrapper });
    await waitFor(() =>
        expect(restarted.result.current.phase).toBe("storageBlocked"),
    );
    expect(restarted.result.current.bootstrap).toBeNull();
    expect(calls("/mobile/bootstrap")).toHaveLength(1);
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
        values.delete(key);
    });
    await act(async () => {
        await restarted.result.current.logout();
    });
    expect(restarted.result.current.phase).toBe("signedOut");
    expect(values.size).toBe(0);
    restarted.unmount();
});
it("refuses restoration when a reinstall marker is absent even if a keychain token remains", async () => {
    values.set(
        sessionKey,
        JSON.stringify({
            token: "leftover",
            expires: new Date(Date.now() + 3600000).toISOString(),
            nonce: "old-installation",
        }),
    );
    const hook = renderHook(useSession, { wrapper });
    await waitFor(() => expect(hook.result.current.phase).toBe("signedOut"));
    expect(calls("/mobile/bootstrap")).toHaveLength(0);
    expect(values.size).toBe(0);
    hook.unmount();
});
it("does not let delayed logout cleanup remove a newly signed-in account", async () => {
    const hook = await ready();
    const unlink = deferred<Response>();
    const revoke = deferred<Response>();
    handler = (request) => {
        if (request.method !== "DELETE") return defaultResponse(request);
        return new URL(request.url).pathname.endsWith("/mobile/devices/current")
            ? unlink.promise
            : revoke.promise;
    };
    let logout!: Promise<void>;
    act(() => {
        logout = hook.result.current.logout();
    });
    await waitFor(() =>
        expect(calls("/mobile/devices/current")).toHaveLength(1),
    );
    expect(calls("/token")).toHaveLength(0);
    await waitFor(() => expect(values.has(sessionKey)).toBe(false));
    account = 3;
    await act(async () => {
        await hook.result.current.signIn("second@example.test", "Password");
    });
    expect(hook.result.current.bootstrap?.account.id).toBe("3");
    await act(async () => {
        unlink.resolve(new Response(null, { status: 204 }));
        await Promise.resolve();
    });
    await waitFor(() => expect(calls("/token")).toHaveLength(1));
    await act(async () => {
        revoke.resolve(new Response(null, { status: 204 }));
        await logout;
    });
    expect(hook.result.current.phase).toBe("ready");
    expect(JSON.parse(values.get(sessionKey)!).token).toBe("session-3");
    expect(calls("/token")[0]!.headers.get("Authorization")).toBe(
        "Bearer session-2",
    );
    expect(
        calls("/mobile/devices/current")[0]!.headers.get("Authorization"),
    ).toBe("Bearer session-2");
    hook.unmount();
});
it.each([204, 503])(
    "cannot restore after restart while remote logout is unresolved, including late HTTP %s",
    async (status) => {
        const hook = await ready();
        const held = deferred<Response>();
        handler = (request) =>
            request.method === "DELETE"
                ? held.promise
                : defaultResponse(request);
        let logout!: Promise<void>;
        act(() => {
            logout = hook.result.current.logout();
        });
        expect(marker).toBeNull();
        await waitFor(() => expect(values.has(sessionKey)).toBe(false));
        hook.unmount();
        const restarted = renderHook(useSession, { wrapper });
        await waitFor(() =>
            expect(restarted.result.current.phase).toBe("signedOut"),
        );
        expect(calls("/mobile/bootstrap")).toHaveLength(1);
        await act(async () => {
            held.resolve(new Response(null, { status }));
            await logout;
        });
        expect(restarted.result.current.phase).toBe("signedOut");
        restarted.unmount();
    },
);
it("reports fence write failure while deleting credentials before remote logout completes", async () => {
    const hook = await ready();
    const held = deferred<Response>();
    handler = (request) =>
        request.method === "DELETE" ? held.promise : defaultResponse(request);
    jest.mocked(fence.revoke).mockImplementation(() => {
        throw new Error("File write failed");
    });
    let logout!: Promise<void>;
    act(() => {
        logout = hook.result.current.logout();
    });
    await waitFor(() =>
        expect(hook.result.current.phase).toBe("storageBlocked"),
    );
    expect(values.has(sessionKey)).toBe(false);
    hook.unmount();
    const restarted = renderHook(useSession, { wrapper });
    await waitFor(() =>
        expect(restarted.result.current.phase).toBe("storageBlocked"),
    );
    expect(calls("/mobile/bootstrap")).toHaveLength(1);
    await act(async () => {
        held.resolve(new Response(null, { status: 204 }));
        await logout;
    });
    expect(restarted.result.current.phase).toBe("storageBlocked");
    jest.mocked(fence.revoke).mockImplementation(() => {
        marker = null;
    });
    await act(async () => {
        await restarted.result.current.logout();
    });
    expect(restarted.result.current.phase).toBe("signedOut");
    restarted.unmount();
});
it("serializes a delayed rotation write before logout deletion and cannot restore it later", async () => {
    const hook = await ready();
    needsSync = true;
    const held = deferred<void>();
    let saving = false;
    jest.mocked(SecureStore.setItemAsync).mockImplementation(
        async (key, value) => {
            saving = true;
            await held.promise;
            values.set(key, value);
        },
    );
    let refresh!: Promise<void>, logout!: Promise<void>;
    act(() => {
        refresh = hook.result.current.refresh();
    });
    await waitFor(() => expect(saving).toBe(true));
    act(() => {
        logout = hook.result.current.logout();
    });
    await waitFor(() => expect(calls("/token")).toHaveLength(1));
    await act(async () => {
        held.resolve();
        await Promise.all([refresh, logout]);
    });
    expect(hook.result.current.phase).toBe("signedOut");
    expect(values.has(sessionKey)).toBe(false);
    expect(marker).toBeNull();
    hook.unmount();
});
it("fails closed and revokes the rotated token when its secure storage write fails", async () => {
    const hook = await ready();
    needsSync = true;
    jest.mocked(SecureStore.setItemAsync).mockRejectedValue(
        new Error("Keychain write failed"),
    );
    await act(async () => {
        await hook.result.current.refresh();
    });
    expect(hook.result.current.phase).toBe("signedOut");
    expect(hook.result.current.bootstrap).toBeNull();
    expect(calls("/token")[0]!.headers.get("Authorization")).toBe(
        "Bearer rotated-session",
    );
    expect(values.has(sessionKey)).toBe(false);
    hook.unmount();
});
it("cancels captured private work on account logout and provider disposal", async () => {
    const hook = await ready();
    const work = hook.result.current.captureWork();
    await act(async () => {
        await hook.result.current.logout();
    });
    expect(work.signal.aborted).toBe(true);
    expect(() => work.assertCurrent()).toThrow("cancelled");
    await act(async () => {
        await hook.result.current.signIn("second@example.test", "Password");
    });
    const next = hook.result.current.captureWork();
    hook.unmount();
    expect(next.signal.aborted).toBe(true);
});
it.each(["logout", "switch", "unmount"] as const)(
    "discards a delayed authenticated binary download after %s before writing or sharing",
    async (event) => {
        const hook = await ready();
        const scope = hook.result.current.captureWork();
        const held = deferred<Response>();
        handler = (request) =>
            new URL(request.url).pathname.endsWith("/download")
                ? held.promise
                : defaultResponse(request);
        const pending = api.GET("/v1/operations/{id}/download", {
            params: {
                path: { id: "fixture" },
                query: { expires: 123, signature: "a".repeat(64) },
            },
            parseAs: "arrayBuffer",
            signal: scope.signal,
        });
        await waitFor(() => expect(calls("/download")).toHaveLength(1));
        expect(calls("/download")[0]!.headers.get("Authorization")).toBe(
            "Bearer session-2",
        );
        if (event === "unmount") hook.unmount();
        else
            await act(async () => {
                if (event === "logout") await hook.result.current.logout();
                else {
                    account = 3;
                    await hook.result.current.signIn(
                        "second@example.test",
                        "Password",
                    );
                }
            });
        expect(calls("/download")[0]!.signal.aborted).toBe(true);
        held.resolve(new Response(new Uint8Array([1, 2, 3])));
        const response = await pending;
        await expect(
            shareBytes(response.data as ArrayBuffer, { current: null }, scope),
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(File).not.toHaveBeenCalled();
        expect(Sharing.shareAsync).not.toHaveBeenCalled();
        if (event !== "unmount") hook.unmount();
    },
);
it("rechecks authority after delayed sharing availability and never creates a file after logout", async () => {
    const hook = await ready();
    const scope = hook.result.current.captureWork();
    const held = deferred<boolean>();
    jest.mocked(Sharing.isAvailableAsync).mockReturnValue(held.promise);
    const pending = shareBytes(
        new Uint8Array([1, 2]).buffer,
        { current: null },
        scope,
    );
    const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
    });
    await act(async () => {
        await hook.result.current.logout();
    });
    held.resolve(true);
    await rejected;
    expect(File).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    hook.unmount();
});
it("uses refreshed account date preferences and clears them on logout before another sign-in", async () => {
    let format: "m/d/Y" | "d/m/Y" = "m/d/Y";
    handler = (request) =>
        new URL(request.url).pathname.endsWith("/mobile/bootstrap")
            ? json({
                  data: {
                      ...fixtures.bootstrap.data,
                      account: {
                          ...fixtures.bootstrap.data.account,
                          id: account,
                      },
                      appearance: {
                          ...fixtures.bootstrap.data.appearance,
                          timezone: "America/Los_Angeles",
                          date_format: format,
                      },
                  },
              })
            : defaultResponse(request);
    const hook = await ready();
    expect(date("2026-10-05T02:30:00Z")).toBe("10/04/2026, 19:30");
    format = "d/m/Y";
    await act(async () => {
        await hook.result.current.refresh();
    });
    expect(date("2026-10-05T02:30:00Z")).toBe("04/10/2026, 19:30");
    await act(async () => {
        await hook.result.current.logout();
    });
    expect(date("2026-10-05T02:30:00Z")).toBe("05 Oct 2026, 02:30");
    account = 3;
    await act(async () => {
        await hook.result.current.signIn("other@example.test", "Password");
    });
    expect(date("2026-10-05T02:30:00Z")).toBe("04/10/2026, 19:30");
    hook.unmount();
    expect(date("2026-10-05T02:30:00Z")).toBe("05 Oct 2026, 02:30");
});
it("retains the current unavailable cause after bootstrap503 and clears it on successful revalidation", async () => {
    const hook = await ready();
    handler = (request) =>
        new URL(request.url).pathname.endsWith("/mobile/bootstrap")
            ? json({}, 503)
            : defaultResponse(request);
    await act(async () => {
        await hook.result.current.refresh();
    });
    expect(hook.result.current.phase).toBe("unavailable");
    expect(hook.result.current.unavailableError).toMatchObject({ status: 503 });
    expect(hook.result.current.bootstrap).toBeNull();
    handler = null;
    await act(async () => {
        await hook.result.current.refresh();
    });
    expect(hook.result.current.phase).toBe("ready");
    expect(hook.result.current.unavailableError).toBeUndefined();
    hook.unmount();
});
it("preserves a dirty route on hardware Back during a delayed ordinary refresh and allows forced logout", async () => {
    let controls!: ReturnType<typeof useSession>;
    let hardwareBack!: Parameters<typeof BackHandler.addEventListener>[1];
    jest.spyOn(BackHandler, "addEventListener").mockImplementation(
        (_event, callback) => {
            hardwareBack = callback;
            return { remove: jest.fn() };
        },
    );
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    function Home() {
        controls = useSession();
        return <Text>Home</Text>;
    }
    function Edit() {
        controls = useSession();
        useDiscard(true);
        return <Text>Dirty form</Text>;
    }
    const screen = renderRouter(
        {
            _layout: () => (
                <SessionProvider>
                    <Stack screenOptions={{ animation: "none" }} />
                </SessionProvider>
            ),
            index: Home,
            edit: Edit,
        },
        { initialUrl: "/" },
    );
    await waitFor(() => expect(controls.phase).toBe("signedOut"));
    await act(async () => {
        await controls.signIn("synthetic@example.test", "Password");
    });
    act(() => router.push("/edit"));
    await waitFor(() => expect(screen.getPathname()).toBe("/edit"));
    const held = deferred<Response>();
    handler = (request) =>
        new URL(request.url).pathname.endsWith("/mobile/bootstrap")
            ? held.promise
            : defaultResponse(request);
    let refresh!: Promise<void>;
    act(() => {
        refresh = controls.refresh();
    });
    await waitFor(() => expect(controls.phase).toBe("checking"));
    expect(controls.bootstrap).not.toBeNull();
    act(() => {
        expect(
            hardwareBack({ type: "hardwareBackPress", timeStamp: Date.now() }),
        ).toBe(true);
    });
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(screen.getPathname()).toBe("/edit");
    act(() => alert.mock.calls[0]![2]![0]!.onPress?.());
    expect(screen.getPathname()).toBe("/edit");
    await act(async () => {
        await controls.logout();
    });
    act(() => {
        hardwareBack({ type: "hardwareBackPress", timeStamp: Date.now() });
    });
    await waitFor(() => expect(screen.getPathname()).toBe("/"));
    expect(alert).toHaveBeenCalledTimes(1);
    await act(async () => {
        held.resolve(json(fixtures.bootstrap));
        await refresh;
    });
    expect(controls.phase).toBe("signedOut");
    screen.unmount();
});
