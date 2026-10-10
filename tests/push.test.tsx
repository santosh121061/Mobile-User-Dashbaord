import React, { useEffect } from "react";
import { AppState, Text } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as fence from "../src/storage/fence";
import { SessionProvider, useSession } from "../src/auth/session";
import { PushProvider, usePush } from "../src/push/provider";
import { PushPreferences } from "../src/push/preferences";
import { clearNativePush, preparePush } from "../src/push/native";
import { createPrivateWork } from "../src/auth/private-work";
import { discardPushIntent } from "../src/push/intents";
import {
  notificationId,
  pushDestinationSchema,
  pushPreferencesSchema,
  pushRegistrationSchema,
} from "../src/push/contracts";
import { queryClient, queryKey } from "../src/api/query";
import { bootstrapSchema, auditSchema } from "../src/api/runtime";
import AuditDetail from "../src/app/(app)/activity/[id]";
import { ThemeProvider } from "../src/theme";
import { ErrorState } from "../src/components/ui";
import { ApiError } from "../src/api/client";
import fixtures from "../api/fixtures.json";
import pushFixtures from "../api/push-fixtures.json";

jest.setTimeout(30000);
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
jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0" }));
jest.mock("expo-router", () => ({
  useNavigation: () => ({ setOptions: jest.fn() }),
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ id: "9" }),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "4a9a27b7-5cbb-4b21-b9a1-45dde5c5adbf",
}));
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  setAutoServerRegistrationEnabledAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({
    data: "ExpoPushToken[SyntheticFirst]",
    type: "expo",
  })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  addPushTokenListener: jest.fn((callback) => {
    mockTokenChanged = callback;
    return { remove: jest.fn() };
  }),
  addNotificationResponseReceivedListener: jest.fn((callback) => {
    mockTapped = callback;
    return { remove: jest.fn() };
  }),
  addNotificationReceivedListener: jest.fn((callback) => {
    mockReceived = callback;
    return { remove: jest.fn() };
  }),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(async () => undefined),
  setBadgeCountAsync: jest.fn(async () => true),
  unregisterForNotificationsAsync: jest.fn(async () => undefined),
}));

let session: ReturnType<typeof useSession>;
let push: ReturnType<typeof usePush>;
let values: Map<string, string>;
let marker: string | null;
let onState: (state: "active" | "background") => void;
let mockTokenChanged: ((value: unknown) => void) | null;
let mockTapped: ((value: unknown) => void) | null;
let mockReceived: ((value: unknown) => void) | null;
let fetcher: jest.SpyInstance;
let handler: ((request: Request) => Response | Promise<Response>) | null;
let enabled: boolean;
let readyProvider: boolean;
let account: string;
let auditEnabled: boolean;
let destinationPath: string;
const notice = "cb7a3412-46a8-4183-8d17-2a2c24df5a3c";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const calls = (suffix: string) =>
  fetcher.mock.calls
    .map(([request]) => request as Request)
    .filter((request) => new URL(request.url).pathname.endsWith(suffix));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function response(request: Request) {
  const path = new URL(request.url).pathname;
  if (path.endsWith("/mobile/config")) return json(fixtures.configuration);
  if (path.endsWith("/auth/login"))
    return json({
      access_token: "synthetic-session-" + account,
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
  if (path.endsWith("/mobile/bootstrap")) {
    const bootstrap = bootstrapSchema.parse(
      structuredClone(fixtures.bootstrap.data),
    );
    bootstrap.account.id = account;
    bootstrap.modules.notifications = true;
    bootstrap.features["notifications.in_app.enabled"] = true;
    bootstrap.modules.activity = auditEnabled;
    bootstrap.features["audit.capture.enabled"] = auditEnabled;
    bootstrap.configuration_revision += auditEnabled
      ? ":audit-on"
      : ":audit-off";
    bootstrap.session_needs_sync = false;
    return json({ data: bootstrap });
  }
  if (path.endsWith("/mobile/push/preferences")) {
    if (request.method === "PATCH") {
      enabled = JSON.parse(await request.text()).enabled;
      return new Response(null, { status: 204 });
    }
    return json({
      data: {
        ...pushFixtures.push_preferences.data,
        enabled,
        provider: {
          ...pushFixtures.push_preferences.data.provider,
          status: readyProvider ? "ready" : "unconfigured",
          project_id: readyProvider
            ? pushFixtures.push_preferences.data.provider.project_id
            : null,
        },
      },
    });
  }
  if (path.endsWith("/mobile/devices"))
    return json(pushFixtures.push_registration);
  if (path.endsWith("/destination"))
    return account === "1"
      ? json({ data: { notification_id: notice, path: destinationPath } })
      : json({}, 404);
  if (path.endsWith("/mobile/devices/current") || path.endsWith("/token"))
    return new Response(null, { status: 204 });
  throw new Error("Unexpected mocked app request: " + path);
}
function Probe({ children }: React.PropsWithChildren) {
  const liveSession = useSession();
  const livePush = usePush();
  useEffect(() => {
    session = liveSession;
    push = livePush;
  }, [liveSession, livePush]);
  return (
    <>
      <Text testID="phase">{liveSession.phase}</Text>
      <PushPreferences />
      {liveSession.phase === "ready" && liveSession.bootstrap && children}
    </>
  );
}
const view = (children?: React.ReactNode) => (
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <ThemeProvider>
        <PushProvider>
          <Probe>{children}</Probe>
        </PushProvider>
      </ThemeProvider>
    </SessionProvider>
  </QueryClientProvider>
);
async function signedIn() {
  const screen = render(view());
  await waitFor(() => expect(session.phase).toBe("signedOut"), {
    timeout: 10000,
  });
  await act(async () => {
    await session.signIn("fixture@example.test", "SyntheticPassword");
  });
  await waitFor(
    () =>
      expect(push?.preferences).toEqual(expect.objectContaining({ enabled })),
    { timeout: 10000 },
  );
  await waitFor(() => expect(push?.busy).toBe(false));
  return screen;
}
async function optIn() {
  const screen = await signedIn();
  fireEvent.press(screen.getByRole("switch", { name: "Push notifications" }));
  await waitFor(() => expect(push?.registered).toBe(true), {
    timeout: 10000,
  });
  return screen;
}
beforeEach(async () => {
  await clearNativePush();
  jest.clearAllMocks();
  queryClient.clear();
  discardPushIntent();
  values = new Map();
  marker = null;
  handler = null;
  enabled = false;
  readyProvider = true;
  account = "1";
  auditEnabled = true;
  destinationPath = "/profile";
  mockTokenChanged = null;
  mockTapped = null;
  mockReceived = null;
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
    data: "ExpoPushToken[SyntheticFirst]",
    type: "expo",
  });
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => values.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      values.set(key, value);
    });
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
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, callback) => {
      onState = callback;
      return { remove: jest.fn() };
    });
  fetcher = jest
    .spyOn(global, "fetch")
    .mockImplementation(async (input) =>
      handler ? handler(input as Request) : response(input as Request),
    );
});
afterEach(async () => {
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  discardPushIntent();
  await clearNativePush();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it.each([
  {},
  { notification_id: "not-uuid" },
  { notification_id: notice, url: "https://attacker.invalid" },
  { notification_id: notice, token: "private" },
])("rejects unapproved push payload %j", (data) =>
  expect(notificationId(data)).toBeNull(),
);
it("validates actual guarded response fixtures without accepting untyped registration success", () => {
  expect(
    pushPreferencesSchema.parse(pushFixtures.push_preferences.data).enabled,
  ).toBe(true);
  expect(
    pushRegistrationSchema.parse(pushFixtures.push_registration.data)
      .registered,
  ).toBe(true);
  expect(
    pushDestinationSchema.parse(pushFixtures.push_destination.data).path,
  ).toBe("/profile");
  expect(() =>
    pushRegistrationSchema.parse({ id: notice, registered: false }),
  ).toThrow();
});
it("uses the mocked native boundary only inside a live private-work scope", async () => {
  const scope = createPrivateWork(
    () => true,
    () => {},
  );
  try {
    expect(
      (
        await preparePush(
          scope,
          pushFixtures.push_preferences.data.provider.project_id,
          false,
        )
      ).push_token,
    ).toBe("ExpoPushToken[SyntheticFirst]");
  } finally {
    scope.release();
  }
});
it("never requests permission or an Expo token when provider configuration is unavailable", async () => {
  readyProvider = false;
  const screen = await signedIn();
  await act(async () => {
    await push!.change(true);
  });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(calls("/mobile/devices")).toHaveLength(0);
  expect(
    screen.getByText(
      "Push notifications are unavailable for this app. Contact your administrator.",
    ),
  ).toBeTruthy();
});
it("registers after explicit opt-in, disables SDK auto-registration and never persists the Expo token", async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
  } as Notifications.NotificationPermissionsStatus);
  const screen = await optIn();
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
    projectId: pushFixtures.push_preferences.data.provider.project_id,
    url: "https://exp.host/--/api/v2/push/getExpoPushToken",
  });
  expect(
    Notifications.setAutoServerRegistrationEnabledAsync,
  ).not.toHaveBeenCalledWith(true);
  const request = calls("/mobile/devices")[0]!;
  expect(request.headers.get("X-App-Version")).toBe("0.1.0");
  expect(JSON.parse(await request.clone().text()).push_token).toBe(
    "ExpoPushToken[SyntheticFirst]",
  );
  expect(
    [...values.values()].some((value) => value.includes("ExpoPushToken")),
  ).toBe(false);
  expect(
    screen.getByText("This device is registered for push notifications."),
  ).toBeTruthy();
});
it("does not enable or register when OS permission is denied", async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
  } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
    granted: false,
  } as Notifications.NotificationPermissionsStatus);
  const screen = await signedIn();
  await act(async () => {
    await push!.change(true);
  });
  expect(enabled).toBe(false);
  expect(calls("/mobile/devices")).toHaveLength(0);
  expect(
    screen.getByText(
      "Allow notifications in your device settings, then try again.",
    ),
  ).toBeTruthy();
});
it("reconciles a denied restored permission without another permission prompt or token registration", async () => {
  enabled = true;
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
  } as Notifications.NotificationPermissionsStatus);
  await signedIn();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(calls("/mobile/devices/current")).toHaveLength(1);
  expect(push?.registered).toBe(false);
});
it("refreshes a native token while preserving its opaque installation identifier", async () => {
  await optIn();
  const first = JSON.parse(await calls("/mobile/devices")[0]!.clone().text());
  jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
    data: "ExpoPushToken[SyntheticRotated]",
    type: "expo",
  });
  act(() =>
    mockTokenChanged?.({
      type: "ios",
      data: "native-token-not-a-router-value",
    }),
  );
  await waitFor(() => expect(calls("/mobile/devices")).toHaveLength(2));
  const next = JSON.parse(await calls("/mobile/devices")[1]!.clone().text());
  expect(next.installation_id).toBe(first.installation_id);
  expect(next.push_token).toBe("ExpoPushToken[SyntheticRotated]");
});
it("cancels delayed native issuance at logout and unlinks before revocation without retaining a cleanup credential", async () => {
  const screen = await signedIn();
  const token = deferred<Notifications.ExpoPushToken>();
  jest
    .mocked(Notifications.getExpoPushTokenAsync)
    .mockReturnValue(token.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = push!.change(true);
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled(),
  );
  await act(async () => {
    await session.logout();
  });
  await act(async () => {
    token.resolve({ data: "ExpoPushToken[StaleSynthetic]", type: "expo" });
    await pending;
  });
  expect(calls("/mobile/devices")).toHaveLength(0);
  const deletes = fetcher.mock.calls
    .map(([request]) => request as Request)
    .filter((request) => request.method === "DELETE");
  expect(deletes.map((request) => new URL(request.url).pathname)).toEqual([
    "/api/v1/mobile/devices/current",
    "/api/v1/token",
  ]);
  expect(
    deletes.every(
      (request) =>
        request.headers.get("Authorization") === "Bearer synthetic-session-1",
    ),
  ).toBe(true);
  expect(
    [...values.keys()].filter((key) => key.endsWith(".session")),
  ).toHaveLength(0);
  expect(screen.getByTestId("phase").props.children).toBe("signedOut");
});
it("bounds a failed unlink, wipes locally first, and still revokes the captured session", async () => {
  await optIn();
  let aborted = false;
  handler = (request) => {
    if (!new URL(request.url).pathname.endsWith("/mobile/devices/current"))
      return response(request);
    return new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(new Error("Synthetic offline unlink"));
        },
        { once: true },
      );
    });
  };
  let logout!: Promise<void>;
  act(() => {
    logout = session.logout();
  });
  await waitFor(() =>
    expect(
      [...values.keys()].filter((key) => key.endsWith(".session")),
    ).toHaveLength(0),
  );
  expect(session.phase).toBe("signedOut");
  expect(calls("/token")).toHaveLength(0);
  await act(async () => {
    await logout;
  });
  expect(aborted).toBe(true);
  expect(calls("/token")).toHaveLength(1);
  expect(calls("/token")[0]!.headers.get("Authorization")).toBe(
    "Bearer synthetic-session-1",
  );
  expect(
    [...values.values()].some((value) => value.includes("synthetic-session-1")),
  ).toBe(false);
});
it("aborts an in-flight registration and ignores its late response after switching account", async () => {
  await signedIn();
  const registered = deferred<Response>();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/devices")
      ? registered.promise
      : response(request);
  let change!: Promise<void>;
  act(() => {
    change = push!.change(true);
  });
  await waitFor(() => expect(calls("/mobile/devices")).toHaveLength(1));
  const request = calls("/mobile/devices")[0]!;
  await act(async () => {
    await session.logout();
  });
  expect(request.signal.aborted).toBe(true);
  enabled = false;
  account = "2";
  await act(async () => {
    await session.signIn("other@example.test", "SyntheticPassword");
  });
  await waitFor(() => expect(push?.preferences?.enabled).toBe(false));
  await act(async () => {
    registered.resolve(json(pushFixtures.push_registration));
    await change;
  });
  expect(session.bootstrap?.account.id).toBe("2");
  expect(push?.registered).toBe(false);
  expect(calls("/mobile/devices")).toHaveLength(1);
});
it("confirms server opt-out and clears native registration without persisting cleanup work", async () => {
  await optIn();
  let optOutBody: unknown;
  handler = async (request) => {
    if (request.method === "PATCH")
      optOutBody = JSON.parse(await request.clone().text());
    return response(request);
  };
  const unregisters = jest.mocked(Notifications.unregisterForNotificationsAsync)
    .mock.calls.length;
  await act(async () => {
    await push!.change(false);
  });
  await waitFor(() =>
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(
      unregisters + 1,
    ),
  );
  expect(push?.preferences?.enabled).toBe(false);
  expect(push?.registered).toBe(false);
  const writes = calls("/mobile/push/preferences").filter(
    (request) => request.method === "PATCH",
  );
  expect(writes).toHaveLength(2);
  expect(optOutBody).toEqual({ enabled: false });
  expect(
    [...values.keys()].every(
      (key) => key.endsWith(".session") || key.endsWith(".push-installation"),
    ),
  ).toBe(true);
});
it("resolves only an owned allowlisted tap and drops malformed data", async () => {
  await optIn();
  const bootstraps = calls("/mobile/bootstrap").length;
  const configs = calls("/mobile/config").length;
  act(() =>
    mockTapped?.({
      notification: {
        request: {
          content: {
            data: {
              notification_id: notice,
              url: "https://attacker.invalid",
            },
          },
        },
      },
    }),
  );
  expect(calls("/destination")).toHaveLength(0);
  act(() =>
    mockTapped?.({
      notification: {
        request: { content: { data: { notification_id: notice } } },
      },
    }),
  );
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/profile"));
  expect(calls("/mobile/bootstrap")).toHaveLength(bootstraps + 1);
  expect(calls("/mobile/config")).toHaveLength(configs + 1);
  const paths = fetcher.mock.calls.map(
    ([request]) => new URL((request as Request).url).pathname,
  );
  expect(paths.lastIndexOf("/api/v1/mobile/bootstrap")).toBeLessThan(
    paths.findIndex((path) => path.endsWith("/destination")),
  );
});
it("purges fresh cached Activity detail and denies its tap when audit is disabled before navigation", async () => {
  const screen = await optIn();
  const key = queryKey(session.bootstrap!, "audit-detail", "9");
  act(() =>
    queryClient.setQueryData(
      key,
      auditSchema.parse({
        id: "9",
        public_id: "synthetic-audit",
        action: "Synthetic cached activity",
        outcome: "success",
        created_at: new Date().toISOString(),
        actor: { name: "Synthetic actor", public_id: null },
      }),
    ),
  );
  screen.rerender(view(<AuditDetail />));
  expect(screen.getByText("Synthetic cached activity")).toBeTruthy();
  expect(calls("/mobile/audit/9")).toHaveLength(0);
  const bootstraps = calls("/mobile/bootstrap").length;
  destinationPath = "/activity/9";
  auditEnabled = false;
  act(() =>
    mockTapped?.({
      notification: {
        request: { content: { data: { notification_id: notice } } },
      },
    }),
  );
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/unavailable"));
  expect(router.push).not.toHaveBeenCalledWith("/activity/9");
  expect(calls("/mobile/bootstrap")).toHaveLength(bootstraps + 1);
  expect(calls("/destination")).toHaveLength(1);
  expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(screen.queryByText("Synthetic cached activity")).toBeNull();
  expect(calls("/mobile/audit/9")).toHaveLength(0);
});
it("discards a delayed tap refresh when its initiating account signs out and another signs in", async () => {
  await optIn();
  const held = deferred<Response>();
  let oldSnapshot!: Response;
  let holdOnce = true;
  handler = async (request) => {
    if (
      holdOnce &&
      new URL(request.url).pathname.endsWith("/mobile/bootstrap")
    ) {
      holdOnce = false;
      oldSnapshot = await response(request);
      return held.promise;
    }
    return response(request);
  };
  const bootstraps = calls("/mobile/bootstrap").length;
  act(() =>
    mockTapped?.({
      notification: {
        request: { content: { data: { notification_id: notice } } },
      },
    }),
  );
  await waitFor(() =>
    expect(calls("/mobile/bootstrap")).toHaveLength(bootstraps + 1),
  );
  await act(async () => {
    await session.logout();
  });
  account = "2";
  enabled = false;
  await act(async () => {
    await session.signIn("other@example.test", "SyntheticPassword");
  });
  await waitFor(() => expect(session.bootstrap?.account.id).toBe("2"));
  await act(async () => {
    held.resolve(oldSnapshot);
    await Promise.resolve();
  });
  expect(calls("/destination")).toHaveLength(0);
  expect(router.push).not.toHaveBeenCalled();
  expect(session.bootstrap?.account.id).toBe("2");
});
it("drops a failed tap refresh and does not replay it when authority becomes available again", async () => {
  await optIn();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/config")
      ? json({}, 503)
      : response(request);
  act(() =>
    mockTapped?.({
      notification: {
        request: { content: { data: { notification_id: notice } } },
      },
    }),
  );
  await waitFor(() => expect(session.phase).toBe("unavailable"));
  handler = null;
  await act(async () => {
    await session.refresh();
  });
  await waitFor(() => expect(session.phase).toBe("ready"));
  expect(calls("/destination")).toHaveLength(0);
  expect(router.push).not.toHaveBeenCalled();
});
it("aborts a freshly scoped destination lookup on lock and never replays its late response after resume", async () => {
  await optIn();
  const held = deferred<Response>();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/destination")
      ? held.promise
      : response(request);
  act(() =>
    mockTapped?.({
      notification: {
        request: { content: { data: { notification_id: notice } } },
      },
    }),
  );
  await waitFor(() => expect(calls("/destination")).toHaveLength(1));
  const request = calls("/destination")[0]!;
  act(() => onState("background"));
  expect(request.signal.aborted).toBe(true);
  handler = null;
  await act(async () => {
    onState("active");
    held.resolve(json({ data: { notification_id: notice, path: "/profile" } }));
    await Promise.resolve();
  });
  await waitFor(() => expect(session.phase).toBe("ready"));
  expect(calls("/destination")).toHaveLength(1);
  expect(router.push).not.toHaveBeenCalled();
});
it("keeps a locked tap opaque and checks recipient ownership after account change", async () => {
  await optIn();
  act(() => onState("background"));
  act(() =>
    mockTapped?.({
      notification: {
        request: { content: { data: { notification_id: notice } } },
      },
    }),
  );
  expect(calls("/destination")).toHaveLength(0);
  await act(async () => {
    onState("active");
    await Promise.resolve();
  });
  await waitFor(() => expect(session.phase).toBe("ready"));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/profile"));
  await act(async () => {
    await session.logout();
  });
  account = "2";
  await act(async () => {
    await session.signIn("other@example.test", "SyntheticPassword");
  });
  await waitFor(() => expect(session.phase).toBe("ready"));
  act(() =>
    mockTapped?.({
      notification: {
        request: { content: { data: { notification_id: notice } } },
      },
    }),
  );
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/unavailable"));
});
it("invalidates only the private inbox while active and never publishes a foreground lock-screen banner", async () => {
  await optIn();
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  act(() =>
    mockReceived?.({
      request: { content: { data: { notification_id: notice } } },
    }),
  );
  expect(invalidate).toHaveBeenCalledTimes(2);
  act(() => onState("background"));
  invalidate.mockClear();
  act(() =>
    mockReceived?.({
      request: { content: { data: { notification_id: notice } } },
    }),
  );
  expect(invalidate).not.toHaveBeenCalled();
  const handler = jest
    .mocked(Notifications.setNotificationHandler)
    .mock.calls.at(-1)![0]!;
  expect(
    await handler.handleNotification({} as Notifications.Notification),
  ).toMatchObject({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldSetBadge: false,
  });
});
it("presents an explicit version-update state without inventing an external download destination", () => {
  const screen = render(
    <ErrorState
      error={new ApiError(426, {}, null, "MOBILE_UPDATE_REQUIRED")}
      retry={jest.fn()}
    />,
  );
  expect(screen.getByText("App update required")).toBeTruthy();
  expect(router.push).not.toHaveBeenCalled();
  screen.unmount();
});
