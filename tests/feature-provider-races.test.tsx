import React, { useEffect, useState } from "react";
import { AppState, Pressable, Text } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import * as fence from "../src/storage/fence";
import { SessionProvider, useSession } from "../src/auth/session";
import { AuthenticatedActionProvider } from "../src/auth/authenticated-actions";
import { queryClient } from "../src/api/query";
import { ThemeProvider } from "../src/theme";
import { AdminAvatar } from "../src/features/admin-avatar";
import Notifications from "../src/app/(app)/notifications";
import More from "../src/app/(app)/(tabs)/more";
import UserForm from "../src/features/user-form";
import fixtures from "../api/fixtures.json";

// Only device/navigation surfaces are mocked. Session, authenticated actions, feature work,
// query hooks, request construction and response middleware are the real modules.
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
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock("../src/components/forms", () => ({
  ...jest.requireActual("../src/components/forms"),
  useDiscard: jest.fn(),
}));
jest.mock("../src/features/exports", () => ({ ExportButton: () => null }));

let session: ReturnType<typeof useSession>;
let listener: (state: "active" | "background") => void;
let handler: ((request: Request) => Promise<Response> | Response) | null;
let fetcher: jest.SpyInstance;
let marker: string | null;
let values: Map<string, string>;
const refreshed = jest.fn(async () => undefined);
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
const requests = (suffix: string) =>
  fetcher.mock.calls
    .map(([request]) => request as Request)
    .filter((request) => new URL(request.url).pathname.endsWith(suffix));
const deferred = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
function defaultResponse(request: Request) {
  const path = new URL(request.url).pathname;
  if (path.endsWith("/mobile/config")) return json(fixtures.configuration);
  if (path.endsWith("/auth/login"))
    return json({
      access_token: "synthetic-session",
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
  if (path.endsWith("/mobile/bootstrap"))
    return json({
      data: {
        ...fixtures.bootstrap.data,
        session_needs_sync: false,
        features: {
          ...fixtures.bootstrap.data.features,
          "notifications.in_app.enabled": true,
          "users.avatar.enabled": true,
        },
        modules: {
          ...fixtures.bootstrap.data.modules,
          notifications: true,
        },
      },
    });
  if (path.endsWith("/mobile/step-up"))
    return json({ approval: "approved-once" });
  if (path.endsWith("/users/2/avatar"))
    return json({ data: fixtures.profile.data });
  if (path.endsWith("/mobile/users/2/context"))
    return json({
      data: {
        user: { ...fixtures.profile.data, id: 2, roles: [] },
        actions: {
          update: true,
          reset: true,
          owner: false,
          roles: false,
        },
        role_options: [],
        action_reasons: {},
        governance: null,
        avatar_available: false,
      },
    });
  if (path.endsWith("/users/2") && request.method === "PUT")
    return json({ data: { ...fixtures.profile.data, id: 2 } });
  if (path.endsWith("/notifications/summary"))
    return json({ data: { unread: 3 } });
  if (path.endsWith("/notifications"))
    return json({
      data: [
        {
          id: "94d3a85f-3fe9-4636-b09e-c574fe7e04f6",
          read_at: null,
          created_at: "2026-10-08T00:00:00Z",
          data: { title: "Synthetic notice", path: "/users/2" },
        },
      ],
      current_page: 1,
      last_page: 1,
    });
  throw new Error("Unexpected synthetic request: " + path);
}
function Harness({ kind }: { kind: "avatar" | "inbox" | "more" | "user" }) {
  const current = useSession();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    session = current;
  }, [current]);
  return (
    <>
      <Text testID="phase">{current.phase}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leave feature"
        onPress={() => setShown(false)}
      >
        <Text>Leave feature</Text>
      </Pressable>
      {shown &&
        current.bootstrap &&
        ["ready", "checking"].includes(current.phase) &&
        (kind === "avatar" ? (
          <AdminAvatar id="2" available permitted refresh={refreshed} />
        ) : kind === "inbox" ? (
          <Notifications />
        ) : kind === "user" ? (
          <UserForm id="2" />
        ) : (
          <More />
        ))}
    </>
  );
}
const view = (kind: "avatar" | "inbox" | "more" | "user") => (
  <SessionProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthenticatedActionProvider>
          <Harness kind={kind} />
        </AuthenticatedActionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </SessionProvider>
);
async function ready(kind: "avatar" | "inbox" | "more" | "user") {
  const screen = render(view(kind));
  await waitFor(
    () => expect(screen.getByTestId("phase").props.children).toBe("signedOut"),
    { timeout: 10000 },
  );
  await act(async () => {
    await session.signIn("synthetic@example.test", "SyntheticPassword");
  });
  expect(session.phase).toBe("ready");
  return screen;
}
function submit(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
  expect(screen.queryByLabelText("Current password")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
}
beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  values = new Map();
  marker = null;
  handler = null;
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
      listener = callback as typeof listener;
      return { remove: jest.fn() };
    });
  fetcher = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    return handler ? handler(request) : defaultResponse(request);
  });
});
afterEach(async () => {
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  jest.restoreAllMocks();
});

it("completes a confirmed feature write and its refresh/message through real delayed session revalidation", async () => {
  const screen = await ready("avatar");
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/bootstrap")
      ? held.promise
      : defaultResponse(request);
  submit(screen);
  await waitFor(() => expect(requests("/mobile/bootstrap")).toHaveLength(2));
  expect(screen.getByTestId("phase").props.children).toBe("checking");
  expect(requests("/mobile/step-up")).toHaveLength(0);
  await act(async () =>
    held.resolve(defaultResponse(requests("/mobile/bootstrap")[1]!)),
  );
  await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
  expect(requests("/users/2/avatar")).toHaveLength(1);
  expect(screen.getByText("Changes saved.")).toBeTruthy();
  screen.unmount();
});
it("opens the inbox's allowlisted related record after real delayed revalidation", async () => {
  const screen = await ready("inbox");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /^Synthetic notice,/ }),
    ).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: /^Synthetic notice,/ }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Open related record" }),
    ).toBeTruthy(),
  );
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/bootstrap")
      ? held.promise
      : defaultResponse(request);
  fireEvent.press(screen.getByRole("button", { name: "Open related record" }));
  await waitFor(() => expect(requests("/mobile/bootstrap")).toHaveLength(2));
  expect(router.push).not.toHaveBeenCalled();
  await act(async () =>
    held.resolve(defaultResponse(requests("/mobile/bootstrap")[1]!)),
  );
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/users/2"));
  screen.unmount();
});
it("resets a user form and navigates back after direct save without revalidation or a password prompt", async () => {
  const screen = await ready("user");
  await waitFor(() => expect(screen.getByLabelText("First name")).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText("First name"), "Edited name");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  expect(screen.queryByLabelText("Current password")).toBeNull();
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  expect(requests("/users/2")).toHaveLength(1);
  expect(requests("/mobile/bootstrap")).toHaveLength(1);
  expect(requests("/mobile/step-up")).toHaveLength(0);
  expect(
    screen.getByRole("button", { name: "Save changes" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  screen.unmount();
});
it("aborts pending authorization refresh and closes the shared dialog when its feature unmounts", async () => {
  const screen = await ready("avatar");
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/bootstrap")
      ? held.promise
      : defaultResponse(request);
  submit(screen);
  await waitFor(() => expect(requests("/mobile/bootstrap")).toHaveLength(2));
  const approval = requests("/mobile/bootstrap")[1]!;
  fireEvent.press(screen.getByRole("button", { name: "Leave feature" }));
  await waitFor(() => expect(approval.signal.aborted).toBe(false));
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  await act(async () => held.resolve(defaultResponse(approval)));
  expect(requests("/users/2/avatar")).toHaveLength(0);
  expect(refreshed).not.toHaveBeenCalled();
  screen.unmount();
});
it("aborts an executing confirmed write on feature unmount and suppresses its late result", async () => {
  const screen = await ready("avatar");
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/users/2/avatar")
      ? held.promise
      : defaultResponse(request);
  submit(screen);
  await waitFor(() => expect(requests("/users/2/avatar")).toHaveLength(1));
  const mutation = requests("/users/2/avatar")[0]!;
  fireEvent.press(screen.getByRole("button", { name: "Leave feature" }));
  await waitFor(() => expect(mutation.signal.aborted).toBe(true));
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  await act(async () => held.resolve(defaultResponse(mutation)));
  expect(refreshed).not.toHaveBeenCalled();
  expect(screen.queryByText("Changes saved.")).toBeNull();
  screen.unmount();
});
it("clears cancelled busy state on a real background fence abort and allows a fresh confirmation after resume", async () => {
  const screen = await ready("avatar");
  fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
  act(() => listener("background"));
  await waitFor(() =>
    expect(screen.queryByLabelText("Current password")).toBeNull(),
  );
  await act(async () => listener("active"));
  await waitFor(() => expect(session.phase).toBe("ready"));
  expect(
    screen.getByRole("button", { name: "Remove photo" }).props
      .accessibilityState.disabled,
  ).toBe(false);
  fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
  expect(screen.getByTestId("confirm-action")).toBeTruthy();
  screen.unmount();
});
it("exposes the real unread summary in the More row's focused accessible label", async () => {
  const screen = await ready("more");
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Notifications, 3 unread notifications",
      }),
    ).toBeTruthy(),
  );
  screen.unmount();
});
