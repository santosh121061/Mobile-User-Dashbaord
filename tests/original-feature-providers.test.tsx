import React, { useEffect, useState } from "react";
import {
  AppState,
  BackHandler,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import * as fence from "../src/storage/fence";
import { SessionProvider, useSession } from "../src/auth/session";
import { AuthenticatedActionProvider } from "../src/auth/authenticated-actions";
import { bootstrapSchema, type Bootstrap } from "../src/api/runtime";
import { queryClient } from "../src/api/query";
import { ThemeProvider } from "../src/theme";
import { shareBytes } from "../src/features/exports";
import {
  clearSessionOperations,
  rememberOperation,
  useSessionOperations,
} from "../src/features/session-operations";
import Search from "../src/app/(app)/search";
import Home from "../src/app/(app)/(tabs)/index";
import Users from "../src/app/(app)/(tabs)/users";
import Activity from "../src/app/(app)/(tabs)/activity";
import Reports from "../src/app/(app)/reports";
import Operation from "../src/app/(app)/operations/[id]";
import RoleForm from "../src/features/role-form";
import UserForm from "../src/features/user-form";
import Keys from "../src/app/(app)/keys";
import Unavailable from "../src/app/unavailable";
import UserAccess from "../src/app/(app)/users/[id]/access";
import * as Clipboard from "expo-clipboard";
import fixtures from "../api/fixtures.json";
import { apiUrl } from "../src/config/environment";
import { Card } from "../src/components/ui";
import { HomeSkeleton } from "../src/components/visuals";

// Real-provider startup and confirmed refresh chains have a suite-local deadline.
jest.setTimeout(30000);

// Auth/actions/query/transport modules are real. Only device, navigation,
// virtual-list rendering and the native file-share boundary are substituted.
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
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useRouter: () => jest.requireMock("expo-router").router,
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ setOptions: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
jest.mock("../src/components/forms", () => ({
  ...jest.requireActual("../src/components/forms"),
  useDiscard: jest.fn(),
}));
jest.mock("../src/features/exports", () => ({
  ...jest.requireActual("../src/features/exports"),
  shareBytes: jest.fn(async () => undefined),
}));
jest.mock("../src/components/records", () => ({
  Records: ({ rows, render: row, pending }: any) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { View, Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(
      View,
      { testID: "record-list" },
      pending
        ? React.createElement(Text, {}, "Loading.")
        : rows.length
          ? rows.map((item: any) =>
              React.createElement(React.Fragment, { key: item.id }, row(item)),
            )
          : React.createElement(Text, {}, "Nothing here yet"),
    );
  },
}));

type Kind =
  | "search"
  | "home"
  | "users"
  | "activity"
  | "reports"
  | "operation"
  | "role"
  | "new-role"
  | "keys"
  | "unavailable"
  | "access"
  | "new-user";
let session: ReturnType<typeof useSession>;
let mockParams: Record<string, string>;
let mockBoot: Bootstrap;
let marker: string | null;
let stored: Map<string, string>;
let handler: ((request: Request) => Promise<Response> | Response) | null;
let fetcher: jest.SpyInstance;
let backListeners: Set<() => boolean>;
let newer: boolean;
let emptyAudit: boolean;
let roleName: string;
let rolePhone: boolean;
let loginCount: number;
const operationId = "94d3a85f-3fe9-4636-b09e-c574fe7e04f6";
// Announced source additions are synthetic here; actual-response fixtures stay unchanged.
const availability = () => ({
  capability_availability: mockBoot.capability_availability,
  availability_revision: mockBoot.availability_revision,
});
const json = (data: any, status = 200) => {
  const context = data?.data;
  if (
    context &&
    typeof context === "object" &&
    !Array.isArray(context) &&
    (context.catalog || (context.grants && context.fields))
  ) {
    data = { ...data, data: { ...availability(), ...context } };
    if (context.presets)
      data.data = {
        field_catalog: Object.fromEntries(
          Object.entries(mockBoot.fields).map(([key, rule]) => [
            key,
            rule.label,
          ]),
        ),
        field_delegatable: Object.fromEntries(
          Object.keys(mockBoot.fields).map((key) => [
            key,
            { view: true, edit: true },
          ]),
        ),
        delegatable: Object.fromEntries(
          Object.keys(mockBoot.actions).map((key) => [
            key,
            ["self", "created", "assigned", "all"],
          ]),
        ),
        ...data.data,
      };
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};
const requests = (suffix: string) =>
  fetcher.mock.calls
    .map(([request]) => request as Request)
    .filter((request) => new URL(request.url).pathname.endsWith(suffix));
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
const event = (id: number) => ({
  id,
  public_id: "audit-" + id,
  action: id === 10 ? "old.activity" : "new.activity",
  outcome: "success",
  created_at: "2026-10-08T12:00:00Z",
  actor: { name: "Permitted actor", public_id: "actor" },
});
const page = (data: unknown[]) => ({
  data,
  current_page: 1,
  last_page: 1,
  total: data.length,
});
const operation = (
  id = operationId,
  status = "queued",
  download_url: string | null = null,
) => ({
  id,
  kind: "export",
  status,
  total: 100,
  updated_count: status === "completed" ? 100 : 10,
  skipped_count: 0,
  message: null,
  download_url,
});
const signed = (expires: number, signature = "a".repeat(64)) =>
  new URL(apiUrl).pathname.replace(/\/$/, "") +
  `/v1/operations/${operationId}/download?expires=${expires}&signature=${signature}`;
function defaultResponse(request: Request): Response {
  const path = new URL(request.url).pathname;
  if (path.endsWith("/mobile/config")) return json(fixtures.configuration);
  if (path.endsWith("/auth/login"))
    return json({
      access_token: "fixture-session-" + ++loginCount,
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
  if (path.endsWith("/mobile/bootstrap")) return json({ data: mockBoot });
  if (path.endsWith("/mobile/step-up"))
    return json({ approval: "approved-once" });
  if (path.endsWith("/token")) return new Response(null, { status: 204 });
  if (path.endsWith("/dashboard")) return json(fixtures.dashboard);
  if (path.endsWith("/notifications/summary"))
    return json({ data: { unread: 120 } });
  if (path.endsWith("/profile")) return json(fixtures.profile);
  if (path.endsWith("/keys")) return json({ data: [] });
  if (path.endsWith("/exports/users")) return json(operation(), 202);
  if (path.endsWith("/users"))
    return json(
      page(
        Array.from({ length: 7 }, (_, index) => ({
          id: index + 2,
          public_id: "user-" + index,
          name: "Owned user " + (index + 2),
          status: "enabled",
        })),
      ),
    );
  if (path.endsWith("/mobile/users/list-context"))
    return json({ data: { role_options: [{ id: 1, name: "Staff" }] } });
  if (path.endsWith("/mobile/users/create-context"))
    return json({ data: { role_options: [], can_create_owner: false } });
  if (path.endsWith("/mobile/users/2/access"))
    return request.method === "GET"
      ? json(fixtures.access)
      : json({ data: {} });
  if (path.endsWith("/users/2/access") || path.endsWith("/users/2/delegation"))
    return json({ data: {} });
  if (path.endsWith("/mobile/roles/create-context"))
    return json({
      data: {
        presets: Object.fromEntries(
          ["viewer", "editor", "manager"].map((key) => [
            key,
            {
              label: key[0]!.toUpperCase() + key.slice(1),
              available: key !== "manager",
              grants: ["users.view"],
              scopes: { "users.view": "self" },
              fields: { name: { view: true, edit: false } },
            },
          ]),
        ),
        catalog: Object.fromEntries(
          Object.keys(mockBoot.actions).map((key) => [key, key]),
        ),
        scope_options: {
          self: "Own",
          created: "Created",
          assigned: "Assigned",
          all: "All",
        },
      },
    });
  if (path.endsWith("/audit"))
    return json(
      page(
        emptyAudit
          ? newer
            ? [event(11)]
            : []
          : newer
            ? [event(11), event(10)]
            : [event(10)],
      ),
    );
  if (path.endsWith("/roles/2"))
    return request.method === "GET"
      ? json({
          data: {
            id: 2,
            name: roleName,
            grants: ["users.view"],
            scopes: [{ name: "users.view", scope: "self" }],
            fields: [
              { field: "name", can_view: true, can_edit: false },
              {
                field: "phone",
                can_view: rolePhone,
                can_edit: false,
              },
            ],
          },
        })
      : json({ data: { id: 2, name: roleName } });
  if (path.endsWith(`/operations/${operationId}/download`))
    return new Response(new Uint8Array([80, 75, 3, 4]));
  const id = path.match(/\/operations\/([a-f\d-]{36})$/i)?.[1];
  if (id) return json(operation(id));
  throw new Error("Unexpected synthetic request: " + path);
}
function Harness({ kind }: { kind: Kind }) {
  const current = useSession();
  const operations = useSessionOperations();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    session = current;
  }, [current]);
  return (
    <>
      <Text testID="phase">{current.phase}</Text>
      <Text testID="session-ids">
        {operations.map((item) => item.id).join(",")}
      </Text>
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
        (kind === "search" ? (
          <Search />
        ) : kind === "home" ? (
          <Home />
        ) : kind === "users" ? (
          <Users />
        ) : kind === "activity" ? (
          <Activity />
        ) : kind === "reports" ? (
          <Reports />
        ) : kind === "operation" ? (
          <Operation />
        ) : kind === "role" ? (
          <RoleForm id="2" />
        ) : kind === "keys" ? (
          <Keys />
        ) : kind === "unavailable" ? (
          <Unavailable />
        ) : kind === "access" ? (
          <UserAccess />
        ) : kind === "new-role" ? (
          <RoleForm />
        ) : (
          <UserForm />
        ))}
    </>
  );
}
const view = (kind: Kind) => (
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
async function ready(kind: Kind) {
  const screen = render(view(kind));
  await waitFor(
    () => expect(screen.getByTestId("phase").props.children).toBe("signedOut"),
    { timeout: 10000 },
  );
  await act(async () => {
    await session.signIn("fixture@example.test", "SyntheticPassword");
  });
  expect(session.phase).toBe("ready");
  return screen;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Clipboard.setStringAsync).mockReset().mockResolvedValue(true);
  queryClient.clear();
  clearSessionOperations();
  stored = new Map();
  marker = null;
  handler = null;
  newer = false;
  emptyAudit = false;
  roleName = "Reviewer";
  rolePhone = false;
  loginCount = 0;
  mockParams = { id: operationId };
  mockBoot = bootstrapSchema.parse(fixtures.bootstrap.data);
  mockBoot.availability_revision = "a".repeat(64);
  mockBoot.capability_availability = Object.fromEntries(
    Object.keys(mockBoot.actions).map((key) => [key, true]),
  );
  mockBoot.session_needs_sync = false;
  mockBoot.account.name = "Synthetic actor";
  for (const key of Object.keys(mockBoot.actions)) mockBoot.actions[key] = true;
  mockBoot.modules = {
    ...mockBoot.modules,
    dashboard: true,
    users: true,
    activity: true,
    roles: true,
    keys: true,
    notifications: true,
    account: true,
  };
  mockBoot.features = {
    ...mockBoot.features,
    "api.enabled": true,
    "exports.enabled": true,
    "users.bulk.enabled": true,
    "users.avatar.enabled": false,
    "notifications.in_app.enabled": true,
  };
  for (const key of Object.keys(mockBoot.fields))
    mockBoot.fields[key] = {
      ...mockBoot.fields[key]!,
      view: true,
      edit: true,
    };
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => stored.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      stored.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    stored.delete(key);
  });
  jest.mocked(fence.activate).mockImplementation((nonce) => {
    marker = nonce;
  });
  jest.mocked(fence.revoke).mockImplementation(() => {
    marker = null;
  });
  jest.mocked(fence.matches).mockImplementation((nonce) => marker === nonce);
  jest.spyOn(AppState, "addEventListener").mockImplementation(() => ({
    remove: jest.fn(),
  }));
  backListeners = new Set();
  jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_event, callback) => {
      backListeners.add(callback as () => boolean);
      return {
        remove: () => {
          backListeners.delete(callback as () => boolean);
        },
      };
    });
  fetcher = jest
    .spyOn(global, "fetch")
    .mockImplementation(async (input) =>
      handler ? handler(input as Request) : defaultResponse(input as Request),
    );
});
afterEach(async () => {
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  clearSessionOperations();
  focusManager.setFocused(undefined);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("searches only approved sources after the shared minimum/debounce and bounds each group", async () => {
  const screen = await ready("search");
  expect(
    screen.getByText("Enter at least 3 characters to search."),
  ).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("Search"), "ab");
  expect(requests("/users")).toHaveLength(0);
  fireEvent.changeText(screen.getByLabelText("Search"), "Owned");
  expect(requests("/users")).toHaveLength(0);
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  expect(screen.queryByText("Owned user 7")).toBeNull();
  expect(screen.getByText("old.activity")).toBeTruthy();
  expect(new URL(requests("/users")[0]!.url).searchParams.get("per_page")).toBe(
    "5",
  );
  expect(new URL(requests("/audit")[0]!.url).searchParams.get("search")).toBe(
    "Owned",
  );
  fireEvent.press(screen.getByRole("button", { name: "See all: Users" }));
  await waitFor(() =>
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: "/(app)/(tabs)/users",
      params: { search: "Owned", account: mockBoot.account.id },
    }),
  );
});
it("never queries revoked search sources or renders an old account's late search response", async () => {
  mockBoot.modules.activity = false;
  const screen = await ready("search");
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/users")
      ? held.promise
      : defaultResponse(request);
  fireEvent.changeText(screen.getByLabelText("Search"), "Private");
  await waitFor(() => expect(requests("/users")).toHaveLength(1));
  const old = requests("/users")[0]!;
  expect(requests("/audit")).toHaveLength(0);
  await act(async () => {
    await session.logout();
  });
  mockBoot.account.id = "99";
  await act(async () => {
    await session.signIn("other@example.test", "SyntheticPassword");
  });
  await act(async () =>
    held.resolve(
      json(page([{ id: 42, public_id: "old", name: "Old private result" }])),
    ),
  );
  expect(old.signal.aborted).toBe(true);
  expect(screen.queryByText("Old private result")).toBeNull();
  expect(screen.getByLabelText("Search").props.value).toBe("");
});
it("renders the Home unread focus label, approved actions and refreshes all relevant queries on compact pull", async () => {
  const window = Dimensions.get("window");
  Dimensions.set({ window: { ...window, width: 390 } });
  const screen = await ready("home");
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Notifications, 120 unread notifications",
      }),
    ).toBeTruthy(),
  );
  expect(screen.getByTestId("home-unread-dot")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add user" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Roles" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reports" })).toBeTruthy();
  await waitFor(() => expect(requests("/dashboard")).toHaveLength(1));
  await waitFor(() =>
    expect(
      screen.getByTestId("account-trend", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy(),
  );
  await act(async () => {
    screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
  });
  await waitFor(() => expect(requests("/dashboard")).toHaveLength(2));
  await waitFor(() =>
    expect(requests("/notifications/summary")).toHaveLength(2),
  );
  act(() => Dimensions.set({ window }));
});
it("keeps an account-only Home free of unsupported search/metrics/actions at enlarged text", async () => {
  const original = Dimensions.get("window");
  Dimensions.set({
    window: { ...original, width: 320, fontScale: 2 },
    screen: { ...Dimensions.get("screen"), width: 320, fontScale: 2 },
  });
  try {
    mockBoot.modules = { account: true, notifications: false };
    mockBoot.actions["users.create"] = false;
    mockBoot.features["exports.enabled"] = false;
    const screen = await ready("home");
    expect(screen.getByText("Your account")).toBeTruthy();
    expect(screen.queryByText("Total accounts")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Search / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add user" })).toBeNull();
    expect(requests("/dashboard")).toHaveLength(0);
    expect(
      screen.queryByTestId("account-trend", {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  } finally {
    act(() => {
      Dimensions.set({
        window: original,
        screen: {
          ...Dimensions.get("screen"),
          width: original.width,
          fontScale: original.fontScale,
        },
      });
    });
  }
});
it("starts loaded-row selection on long press and Back closes the role panel then selection", async () => {
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  expect(
    screen.getByRole("button", { name: "Owned user 2, Enabled" }).props
      .accessibilityState.selected,
  ).toBe(true);
  expect(router.push).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Filter by role" }));
  expect(screen.getByTestId("user-role-selector")).toBeTruthy();
  let consumed = false;
  act(() => {
    consumed = [...backListeners].reverse().some((callback) => callback());
  });
  expect(consumed).toBe(true);
  expect(screen.queryByTestId("user-role-selector")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Owned user 2, Enabled" }).props
      .accessibilityState.selected,
  ).toBe(true);
  act(() => {
    consumed = [...backListeners].reverse().some((callback) => callback());
  });
  expect(consumed).toBe(true);
  expect(
    screen.getByRole("button", { name: "Owned user 2, Enabled" }).props
      .accessibilityState.selected,
  ).toBe(false);
  act(() => {
    consumed = [...backListeners].reverse().some((callback) => callback());
  });
  expect(consumed).toBe(false);
  screen.unmount();
  expect(backListeners.size).toBe(0);
});
it("does not enter selection when the bulk setting is disabled", async () => {
  mockBoot.features["users.bulk.enabled"] = false;
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  expect(
    screen.getByRole("button", { name: "Owned user 2, Enabled" }).props
      .onLongPress,
  ).toBeUndefined();
  expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
});
it("preserves scoped status counts and clears selection when a user sort is chosen", async () => {
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/users")
      ? json({
          ...page([
            {
              id: 2,
              public_id: "user-2",
              name: "Owned user 2",
              status: "enabled",
            },
          ]),
          meta: {
            current_page: 1,
            last_page: 1,
            per_page: 30,
            total: 1,
            status_counts: { active: 0, pending: 3, suspended: 1, disabled: 9 },
          },
        })
      : defaultResponse(request);
  const screen = await ready("users");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Active 0" })).toBeTruthy(),
  );
  expect(screen.getByRole("button", { name: "Pending 3" })).toBeTruthy();
  fireEvent(
    screen.getByRole("button", { name: "Owned user 2, Enabled" }),
    "longPress",
  );
  fireEvent.press(screen.getByRole("button", { name: "Sort users" }));
  fireEvent.press(screen.getByRole("button", { name: "Name Z–A" }));
  await waitFor(() =>
    expect(
      new URL(requests("/users").at(-1)!.url).searchParams.get("sort"),
    ).toBe("name_desc"),
  );
  expect(
    screen.getByRole("button", { name: "Owned user 2, Enabled" }).props
      .accessibilityState.selected,
  ).toBe(false);
  fireEvent.press(screen.getByRole("button", { name: "Pending 3" }));
  await waitFor(() =>
    expect(
      new URL(requests("/users").at(-1)!.url).searchParams.get("state"),
    ).toBe("pending"),
  );
});
it("uses the selected activity category and period for both the feed and new-activity probe", async () => {
  const screen = await ready("activity");
  await waitFor(() => expect(screen.getByText("Old activity")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Filter activity" }));
  fireEvent.press(screen.getByRole("button", { name: "Security" }));
  fireEvent.press(screen.getByRole("button", { name: "Done" }));
  fireEvent.press(screen.getByRole("button", { name: "Activity period" }));
  fireEvent.press(screen.getByRole("button", { name: "Last 7 days" }));
  await waitFor(() =>
    expect(
      new URL(requests("/audit").at(-1)!.url).searchParams.get("period"),
    ).toBe("7d"),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Check for new activity" }).props
        .accessibilityState.disabled,
    ).toBe(false),
  );
  const before = requests("/audit").length;
  fireEvent.press(
    screen.getByRole("button", { name: "Check for new activity" }),
  );
  await waitFor(() => expect(requests("/audit")).toHaveLength(before + 1));
  const params = new URL(requests("/audit").at(-1)!.url).searchParams;
  expect(params.get("category")).toBe("security");
  expect(params.get("period")).toBe("7d");
});
it("stages authorized new activity until requested, without a focus refresh replacing visible rows", async () => {
  const screen = await ready("activity");
  await waitFor(() => expect(screen.getByText("Old activity")).toBeTruthy());
  newer = true;
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  fireEvent.press(
    screen.getByRole("button", { name: "Check for new activity" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "New activity available" }),
    ).toBeTruthy(),
  );
  expect(screen.queryByText("New activity")).toBeNull();
  expect(screen.getByText("Old activity")).toBeTruthy();
  expect(
    StyleSheet.flatten(screen.getByTestId("new-activity-notice").props.style)
      .position,
  ).toBe("absolute");
  expect(requests("/audit")).toHaveLength(2);
  fireEvent.press(
    screen.getByRole("button", { name: "New activity available" }),
  );
  await waitFor(() => expect(screen.getByText("New activity")).toBeTruthy());
  expect(
    screen.queryByRole("button", { name: "New activity available" }),
  ).toBeNull();
});
it("detects new activity from an initially empty authorized feed", async () => {
  emptyAudit = true;
  const screen = await ready("activity");
  await waitFor(() =>
    expect(screen.getByText("Nothing here yet")).toBeTruthy(),
  );
  newer = true;
  fireEvent.press(
    screen.getByRole("button", { name: "Check for new activity" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "New activity available" }),
    ).toBeTruthy(),
  );
  expect(screen.queryByText("New activity")).toBeNull();
});
it("cancels a late activity probe when its permitted module/revision is revoked", async () => {
  const screen = await ready("activity");
  await waitFor(() => expect(screen.getByText("Old activity")).toBeTruthy());
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/audit")
      ? held.promise
      : defaultResponse(request);
  fireEvent.press(
    screen.getByRole("button", { name: "Check for new activity" }),
  );
  await waitFor(() => expect(requests("/audit")).toHaveLength(2));
  const probe = requests("/audit")[1]!;
  mockBoot.modules.activity = false;
  mockBoot.access_revision++;
  await act(async () => {
    await session.refresh();
  });
  await act(async () => held.resolve(json(page([event(11), event(10)]))));
  expect(probe.signal.aborted).toBe(true);
  expect(
    screen.queryByRole("button", { name: "New activity available" }),
  ).toBeNull();
  expect(screen.queryByText("New activity")).toBeNull();
});
it("uses real daily metrics and activity counts without substituting legacy or masked values", async () => {
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/dashboard")
      ? json({
          data: {
            ...fixtures.dashboard.data,
            daily_metrics: {
              total_users: 0,
              active_today: null,
              events_today: 12,
              roles: null,
            },
            activity_series: [{ date: "2026-10-11", label: "Sun", count: 12 }],
            activity_precision_seconds: 60,
          },
        })
      : defaultResponse(request);
  const screen = await ready("home");
  await waitFor(() =>
    expect(screen.getByText("Workspace activity")).toBeTruthy(),
  );
  expect(screen.getByText("Total users")).toBeTruthy();
  expect(screen.getByText("Events today")).toBeTruthy();
  expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  expect(screen.queryByText("Active today")).toBeNull();
  expect(screen.queryByText("Enabled")).toBeNull();
  expect(screen.queryByText("New accounts")).toBeNull();
  expect(screen.getByLabelText("Sun, 12")).toBeTruthy();
});
it("keeps a server-declared read-only role read-only even for a role manager", async () => {
  handler = async (request) => {
    const response = defaultResponse(request);
    if (
      request.method !== "GET" ||
      !new URL(request.url).pathname.endsWith("/roles/2")
    )
      return response;
    const body = await response.json();
    return json({ data: { ...body.data, can_edit: false } });
  };
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  expect(screen.getByLabelText("Role name").props.editable).toBe(false);
  expect(
    screen.getByRole("switch", { name: "Change status of users" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete role" })).toBeNull();
  expect(
    requests("/roles/2").every((request) => request.method === "GET"),
  ).toBe(true);
});
it("groups and filters role permissions while preserving edited values and refreshing untouched fields", async () => {
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  expect(screen.getByTestId("permission-group-users")).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("Role name"), "Local name");
  fireEvent.press(
    screen.getByRole("switch", { name: "Change status of users" }),
  );
  fireEvent.changeText(
    screen.getByLabelText("Search permissions or fields"),
    "phone",
  );
  expect(screen.queryByTestId("permission-group-users")).toBeNull();
  expect(screen.getByRole("button", { name: "View: Phone No." })).toBeTruthy();
  fireEvent.changeText(
    screen.getByLabelText("Search permissions or fields"),
    "",
  );
  expect(
    screen.getByRole("switch", { name: "Change status of users" }).props
      .accessibilityState.selected,
  ).toBe(true);
  roleName = "Fresh server name";
  rolePhone = true;
  await act(async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[4] === "role",
    });
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "View: Phone No." }).props
        .accessibilityState.selected,
    ).toBe(true),
  );
  expect(screen.getByLabelText("Role name").props.value).toBe("Local name");
  expect(
    screen.getByRole("switch", { name: "Change status of users" }).props
      .accessibilityState.selected,
  ).toBe(true);
});
it("binds a direct role save to its caller and suppresses late completion after leaving the form", async () => {
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  const held = deferred();
  handler = (request) =>
    request.method === "PUT" &&
    new URL(request.url).pathname.endsWith("/roles/2")
      ? held.promise
      : defaultResponse(request);
  fireEvent.changeText(screen.getByLabelText("Role name"), "Updated role");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  expect(screen.queryByLabelText("Current password")).toBeNull();
  await waitFor(() =>
    expect(
      requests("/roles/2").filter((request) => request.method === "PUT"),
    ).toHaveLength(1),
  );
  const write = requests("/roles/2").find(
    (request) => request.method === "PUT",
  )!;
  fireEvent.press(screen.getByRole("button", { name: "Leave feature" }));
  await waitFor(() => expect(write.signal.aborted).toBe(true));
  await act(async () => held.resolve(defaultResponse(write)));
  expect(requests("/mobile/bootstrap")).toHaveLength(1);
  expect(requests("/mobile/step-up")).toHaveLength(0);
  expect(router.back).not.toHaveBeenCalled();
});
it("saves role edits directly through the bearer contract and completes navigation without reauthentication", async () => {
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  fireEvent.changeText(screen.getByLabelText("Role name"), "Updated role");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  const writes = requests("/roles/2").filter(
    (request) => request.method === "PUT",
  );
  expect(writes).toHaveLength(1);
  expect(await writes[0]!.clone().json()).toMatchObject({
    name: "Updated role",
  });
  expect(writes[0]!.headers.get("Authorization")).toMatch(/^Bearer /);
  expect(writes[0]!.headers.get("X-Mobile-Step-Up")).toBeNull();
  expect(requests("/mobile/bootstrap")).toHaveLength(1);
  expect(requests("/mobile/step-up")).toHaveLength(0);
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  expect(screen.queryByLabelText("Current password")).toBeNull();
});
it("omits inactive role rules and hidden fields so the server can preserve them", async () => {
  delete mockBoot.actions["settings.manage"];
  mockBoot.capability_availability!["settings.manage"] = false;
  handler = async (request) => {
    const response = defaultResponse(request);
    if (
      request.method !== "GET" ||
      !new URL(request.url).pathname.endsWith("/roles/2")
    )
      return response;
    const body = await response.json();
    return json({
      data: {
        ...body.data,
        grants: [...body.data.grants, "settings.manage"],
        scopes: [
          ...body.data.scopes,
          { name: "settings.manage", scope: "all" },
        ],
        fields: [
          ...body.data.fields,
          { field: "dormant_field", can_view: true, can_edit: false },
          { field: "dormant_inherited", can_view: null, can_edit: null },
        ],
      },
    });
  };
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  expect(
    screen.queryByRole("button", { name: "View: dormant_field" }),
  ).toBeNull();
  fireEvent.changeText(screen.getByLabelText("Role name"), "Metadata edit");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  const write = requests("/roles/2").find(
    (request) => request.method === "PUT",
  )!;
  const payload = await write.clone().json();
  expect(payload).toMatchObject({
    grants: ["users.view"],
    availability_revision: mockBoot.availability_revision,
  });
  expect(payload.scopes).not.toHaveProperty("settings.manage");
  expect(payload.fields).not.toHaveProperty("dormant_field");
  expect(payload.fields).not.toHaveProperty("dormant_inherited");
  expect(payload).not.toHaveProperty("update_mode");
});
const omittedOptionAccess = () => ({
  effects: { "users.view": "deny", "settings.manage": "allow" },
  scopes: { "users.view": "self", "settings.manage": "all" },
  fields: [{ field: "dormant_field", can_view: true, can_edit: false }],
  assigned_ids: [8],
  revision: 1,
  effective: [],
  catalog: { "users.view": "View users" },
  field_catalog: {},
  delegatable: { "users.view": ["self", "created"] },
  field_delegatable: {},
  delegation: {
    rules: [{ name: "settings.manage", scope: "all" }],
    fields: [{ field: "dormant_field", can_view: true, can_edit: false }],
  },
});
it.each([false, true])(
  "omits inactive access rules and hidden fields during a visible edit with delegation=%s",
  async (delegation) => {
    mockParams = { id: "2" };
    mockBoot.capability_availability!["settings.manage"] = false;
    handler = (request) =>
      new URL(request.url).pathname.endsWith("/mobile/users/2/access")
        ? json({ data: omittedOptionAccess() })
        : defaultResponse(request);
    const screen = await ready("access");
    await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
    expect(screen.queryByText("dormant_field")).toBeNull();
    if (delegation)
      fireEvent.press(
        screen.getByRole("button", { name: "Delegation ceiling" }),
      );
    fireEvent.press(screen.getByRole("button", { name: "Allow" }));
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    const suffix = delegation ? "/users/2/delegation" : "/users/2/access";
    await waitFor(() =>
      expect(
        requests(suffix).filter((request) => request.method === "PUT"),
      ).toHaveLength(1),
    );
    const body = await requests(suffix)
      .find((request) => request.method === "PUT")!
      .clone()
      .json();
    expect(body.scopes).not.toHaveProperty("settings.manage");
    expect(body.fields).not.toHaveProperty("dormant_field");
    expect(body.availability_revision).toBe(mockBoot.availability_revision);
    if (delegation) {
      expect(body).not.toHaveProperty("update_mode");
      expect(body.grants).toEqual(["users.view"]);
    } else {
      expect(body.update_mode).toBe("patch");
      expect(body.effects).not.toHaveProperty("settings.manage");
      expect(body.assigned_ids).toEqual([8]);
    }
  },
);
it("discards access drafts and cancels pending writes on configuration revision, with no new grant after reenablement", async () => {
  mockParams = { id: "2" };
  const held = deferred();
  handler = (request) =>
    request.method === "PUT" &&
    new URL(request.url).pathname.endsWith("/users/2/access")
      ? held.promise
      : new URL(request.url).pathname.endsWith("/mobile/users/2/access")
        ? json({ data: omittedOptionAccess() })
        : defaultResponse(request);
  const screen = await ready("access");
  await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Allow" }));
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      requests("/users/2/access").filter((request) => request.method === "PUT"),
    ).toHaveLength(1),
  );
  const write = requests("/users/2/access").find(
    (request) => request.method === "PUT",
  )!;
  mockBoot.configuration_revision = "catalog-options-disabled";
  mockBoot.actions["access.manage"] = false;
  await act(async () => session.refresh());
  expect(write.signal.aborted).toBe(true);
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  await act(async () => held.resolve(json({ data: {} })));
  mockBoot.configuration_revision = "catalog-options-restored";
  mockBoot.actions["access.manage"] = true;
  await act(async () => session.refresh());
  await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
  expect(
    screen.getByRole("button", { name: "Allow" }).props.accessibilityState
      .selected,
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: "Save changes" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(
    requests("/users/2/access").filter((request) => request.method === "PUT"),
  ).toHaveLength(1);
});
it("uses patch mode for partial active rules and sends the complete existing assignment list", async () => {
  mockParams = { id: "2" };
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/users/2/access")
      ? json({
          data: {
            ...omittedOptionAccess(),
            assigned_ids: [8, 9],
            fields: [{ field: "phone", can_view: true, can_edit: false }],
          },
        })
      : defaultResponse(request);
  const screen = await ready("access");
  await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
  expect(mockBoot.capability_availability!["settings.manage"]).toBe(true);
  expect(screen.getByLabelText("Assigned account IDs").props.value).toBe(
    "8, 9",
  );
  fireEvent.press(screen.getByRole("button", { name: "Allow" }));
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      requests("/users/2/access").filter((r) => r.method === "PUT"),
    ).toHaveLength(1),
  );
  const body = await requests("/users/2/access")
    .find((r) => r.method === "PUT")!
    .clone()
    .json();
  expect(body).toMatchObject({
    update_mode: "patch",
    availability_revision: mockBoot.availability_revision,
    assigned_ids: [8, 9],
    effects: { "users.view": "allow" },
  });
  expect(body.effects).not.toHaveProperty("settings.manage");
  expect(body.scopes).not.toHaveProperty("settings.manage");
  expect(body.fields).not.toHaveProperty("phone");
  expect(body).not.toHaveProperty("grants");
});
it("sends explicit inherit resets for active effects, scopes and both field modes in patch mode", async () => {
  mockParams = { id: "2" };
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/users/2/access")
      ? json({
          data: {
            ...omittedOptionAccess(),
            fields: [{ field: "phone", can_view: true, can_edit: false }],
            field_catalog: { phone: "Phone" },
            field_delegatable: { phone: { view: true, edit: true } },
          },
        })
      : defaultResponse(request);
  const screen = await ready("access");
  await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
  for (const control of screen.getAllByRole("button", { name: "Inherit" }))
    fireEvent.press(control);
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      requests("/users/2/access").filter((r) => r.method === "PUT"),
    ).toHaveLength(1),
  );
  const body = await requests("/users/2/access")
    .find((r) => r.method === "PUT")!
    .clone()
    .json();
  expect(body).toMatchObject({
    update_mode: "patch",
    effects: { "users.view": "inherit" },
    scopes: { "users.view": "inherit" },
    fields: { phone: { view: "inherit", edit: "inherit" } },
    assigned_ids: [8],
  });
});
it("fails closed instead of replacing assignments with an empty default when access context omits assigned_ids", async () => {
  mockParams = { id: "2" };
  const { assigned_ids: _missing, ...missingAssignments } =
    omittedOptionAccess();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/users/2/access")
      ? json({ data: missingAssignments })
      : defaultResponse(request);
  const screen = await ready("access");
  await waitFor(
    () => expect(screen.getByText("Unexpected server response")).toBeTruthy(),
    { timeout: 5000 },
  );
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(screen.queryByLabelText("Assigned account IDs")).toBeNull();
  expect(
    requests("/users/2/access").filter((r) => r.method === "PUT"),
  ).toHaveLength(0);
}, 10000);
it("cancels an access save on availability revision alone and restores options without granting them", async () => {
  mockParams = { id: "2" };
  const held = deferred();
  handler = (request) =>
    request.method === "PUT" &&
    new URL(request.url).pathname.endsWith("/users/2/access")
      ? held.promise
      : new URL(request.url).pathname.endsWith("/mobile/users/2/access")
        ? json({ data: omittedOptionAccess() })
        : defaultResponse(request);
  const screen = await ready("access");
  await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: "Allow" }));
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      requests("/users/2/access").filter((request) => request.method === "PUT"),
    ).toHaveLength(1),
  );
  const write = requests("/users/2/access").find(
    (request) => request.method === "PUT",
  )!;
  const unchangedConfiguration = mockBoot.configuration_revision;
  const unchangedAuthority = mockBoot.access_revision;
  mockBoot.availability_revision = "b".repeat(64);
  mockBoot.capability_availability!["users.view"] = false;
  await act(async () => session.refresh());
  expect(write.signal.aborted).toBe(true);
  await waitFor(() => expect(screen.queryByText("View users")).toBeNull());
  await act(async () => held.resolve(json({ data: {} })));
  mockBoot.availability_revision = "c".repeat(64);
  mockBoot.capability_availability!["users.view"] = true;
  await act(async () => session.refresh());
  await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
  expect(
    screen.getByRole("button", { name: "Allow" }).props.accessibilityState
      .selected,
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: "Save changes" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(mockBoot.configuration_revision).toBe(unchangedConfiguration);
  expect(mockBoot.access_revision).toBe(unchangedAuthority);
  expect(
    requests("/users/2/access").filter((request) => request.method === "PUT"),
  ).toHaveLength(1);
});
it.each(["role", "access", "delegation"] as const)(
  "requires refresh after a stale %s save and never replays it",
  async (kind) => {
    mockParams = { id: "2" };
    const suffix = kind === "role" ? "/roles/2" : `/users/2/${kind}`;
    handler = (request) => {
      const path = new URL(request.url).pathname;
      if (request.method === "PUT" && path.endsWith(suffix)) {
        mockBoot.availability_revision = "b".repeat(64);
        return json(
          {
            message: "Refresh required",
            errors: {
              availability_revision: ["Refresh access options before saving."],
            },
          },
          422,
        );
      }
      if (path.endsWith("/mobile/users/2/access"))
        return json({ data: omittedOptionAccess() });
      return defaultResponse(request);
    };
    const screen = await ready(kind === "role" ? "role" : "access");
    if (kind === "role") {
      await waitFor(() =>
        expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
      );
      fireEvent.changeText(screen.getByLabelText("Role name"), "Stale name");
    } else {
      await waitFor(() => expect(screen.getByText("View users")).toBeTruthy());
      if (kind === "delegation")
        fireEvent.press(
          screen.getByRole("button", { name: "Delegation ceiling" }),
        );
      fireEvent.press(screen.getByRole("button", { name: "Allow" }));
    }
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Refresh access options" }),
      ).toBeTruthy(),
    );
    expect(
      requests(suffix).filter((request) => request.method === "PUT"),
    ).toHaveLength(1);
    expect(requests("/mobile/bootstrap")).toHaveLength(1);
    fireEvent.press(
      screen.getByRole("button", { name: "Refresh access options" }),
    );
    await waitFor(() =>
      expect(session.bootstrap?.availability_revision).toBe("b".repeat(64)),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Refresh access options" }),
      ).toBeNull(),
    );
    expect(
      requests(suffix).filter((request) => request.method === "PUT"),
    ).toHaveLength(1);
    expect(router.back).not.toHaveBeenCalled();
    if (kind === "role")
      expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer");
    else
      expect(
        screen.getByRole("button", { name: "Allow" }).props.accessibilityState
          .selected,
      ).toBe(false);
  },
);
it("uses canonical availability and audit scope/field ceilings in the role editor", async () => {
  mockBoot.capability_availability!["settings.manage"] = false;
  mockBoot.fields.phone!.edit = true;
  handler = async (request) => {
    const response = defaultResponse(request);
    if (!new URL(request.url).pathname.endsWith("/mobile/roles/create-context"))
      return response;
    const body = await response.json();
    return json({
      data: {
        ...body.data,
        catalog: {
          "audit.view": "View activity",
          "settings.manage": "Manage settings",
        },
        delegatable: { "audit.view": ["created", "assigned"] },
        field_catalog: { phone: "Phone" },
        field_delegatable: { phone: { view: true, edit: false } },
      },
    });
  };
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  expect(screen.queryByTestId("permission-group-settings")).toBeNull();
  const audit = within(screen.getByTestId("permission-group-audit"));
  fireEvent.press(audit.getByRole("switch"));
  const scopes = within(screen.getByTestId("role-scopes-audit.view"));
  expect(
    scopes.getByRole("button", { name: "Created by me" }).props
      .accessibilityState.selected,
  ).toBe(true);
  expect(scopes.getByRole("button", { name: "Assigned users" })).toBeTruthy();
  expect(scopes.queryByRole("button", { name: "Self only" })).toBeNull();
  expect(scopes.queryByRole("button", { name: "All users" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Edit: Phone" }).props.accessibilityState
      .disabled,
  ).toBe(true);
});
it("keeps role editing unavailable when bootstrap lacks the new availability metadata", async () => {
  delete mockBoot.availability_revision;
  delete mockBoot.capability_availability;
  const screen = await ready("new-role");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Refresh access options" }),
    ).toBeTruthy(),
  );
  expect(screen.getByLabelText("Role name").props.editable).toBe(false);
  expect(screen.queryByRole("button", { name: "Create role" })).toBeNull();
  expect(requests("/roles")).toHaveLength(0);
});
it("keeps role edits and shows Laravel field validation after a direct save fails", async () => {
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  handler = (request) =>
    request.method === "PUT" &&
    new URL(request.url).pathname.endsWith("/roles/2")
      ? json(
          {
            message: "Validation failed",
            errors: { name: ["Role name is already in use."] },
          },
          422,
        )
      : defaultResponse(request);
  fireEvent.changeText(screen.getByLabelText("Role name"), "Duplicate role");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.getByText("Role name is already in use.")).toBeTruthy(),
  );
  expect(screen.getByLabelText("Role name").props.value).toBe("Duplicate role");
  expect(
    requests("/roles/2").filter((request) => request.method === "PUT"),
  ).toHaveLength(1);
  expect(router.back).not.toHaveBeenCalled();
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  expect(requests("/mobile/step-up")).toHaveLength(0);
});
it("expires a rejected direct save's session without replay, success navigation or password verification", async () => {
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  handler = (request) =>
    request.method === "PUT" &&
    new URL(request.url).pathname.endsWith("/roles/2")
      ? json({ message: "Unauthenticated." }, 401)
      : defaultResponse(request);
  fireEvent.changeText(screen.getByLabelText("Role name"), "Updated role");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.getByTestId("phase").props.children).toBe("signedOut"),
  );
  expect(
    requests("/roles/2").filter((request) => request.method === "PUT"),
  ).toHaveLength(1);
  expect(router.back).not.toHaveBeenCalled();
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  expect(requests("/mobile/step-up")).toHaveLength(0);
});
it("applies revoked Laravel permissions after a denied direct save without replay or password verification", async () => {
  const screen = await ready("role");
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
  );
  handler = (request) => {
    if (
      request.method === "PUT" &&
      new URL(request.url).pathname.endsWith("/roles/2")
    ) {
      mockBoot.actions["roles.manage"] = false;
      mockBoot.access_revision++;
      return json({ message: "Forbidden." }, 403);
    }
    return defaultResponse(request);
  };
  fireEvent.changeText(screen.getByLabelText("Role name"), "Updated role");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.editable).toBe(false),
  );
  expect(
    requests("/roles/2").filter((request) => request.method === "PUT"),
  ).toHaveLength(1);
  expect(router.back).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  expect(requests("/mobile/step-up")).toHaveLength(0);
});
async function fillPasswordLinkUser(screen: Awaited<ReturnType<typeof ready>>) {
  await waitFor(() => expect(screen.getByLabelText("First name")).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText("First name"), "Grace");
  fireEvent.changeText(screen.getByLabelText("Last name"), "Hopper");
  fireEvent.changeText(
    screen.getByLabelText("Work email"),
    "New.Member@Example.test",
  );
  fireEvent.changeText(screen.getByLabelText("Phone number"), "+12025550199");
}
const keyWrites = () =>
  requests("/keys").filter((request) => request.method === "POST");
async function issueFixtureKey(screen: Awaited<ReturnType<typeof ready>>) {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create key" })).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Create key" }));
  fireEvent.changeText(
    screen.getByLabelText("Key name"),
    "Fixture integration",
  );
  fireEvent.press(
    screen.getAllByRole("button", { name: "Create key" }).at(-1)!,
  );
}
it("creates a pending password-link user without passwords or governance escalation", async () => {
  handler = async (request) => {
    if (
      new URL(request.url).pathname.endsWith("/users") &&
      request.method === "POST"
    ) {
      const body = await request.clone().json();
      return json(
        {
          data: {
            id: 8,
            public_id: "new-fixture",
            lifecycle_status: body.lifecycle_status,
            password_setup_required: true,
          },
        },
        201,
      );
    }
    return defaultResponse(request);
  };
  const screen = await ready("new-user");
  await fillPasswordLinkUser(screen);
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.queryByLabelText("Governance owner")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Create user" }));
  fireEvent.press(screen.getByRole("button", { name: "Create user" }));
  await waitFor(() =>
    expect(screen.getByRole("header", { name: "User created" })).toBeTruthy(),
  );
  const writes = requests("/users").filter(
    (request) => request.method === "POST",
  );
  expect(writes).toHaveLength(1);
  expect(await writes[0]!.clone().json()).toEqual({
    first_name: "Grace",
    last_name: "Hopper",
    email: "new.member@example.test",
    phone: "+12025550199",
    role_ids: [],
    lifecycle_status: "pending",
    provisioning: "password_link",
  });
  expect(
    screen.getByText(
      "Pending accounts still require administrator activation after password setup.",
    ),
  ).toBeTruthy();
  expect(requests("/mobile/step-up")).toHaveLength(0);
});
it("validates required provisioning fields and retains server field errors and input for a retry", async () => {
  let writes = 0;
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/users") &&
    request.method === "POST"
      ? ++writes === 1
        ? json(
            {
              message: "Validation",
              errors: { email: ["That email is already assigned."] },
            },
            422,
          )
        : json(
            {
              data: {
                id: 8,
                public_id: "new-fixture",
                lifecycle_status: "pending",
              },
            },
            201,
          )
      : defaultResponse(request);
  const screen = await ready("new-user");
  await fillPasswordLinkUser(screen);
  fireEvent.changeText(screen.getByLabelText("Phone number"), "123");
  fireEvent.press(screen.getByRole("button", { name: "Create user" }));
  await waitFor(() =>
    expect(
      screen.getByText("Use an international number, such as +919876543210."),
    ).toBeTruthy(),
  );
  expect(writes).toBe(0);
  fireEvent.changeText(screen.getByLabelText("Phone number"), "+12025550199");
  fireEvent.press(screen.getByRole("button", { name: "Create user" }));
  await waitFor(() =>
    expect(screen.getByText("That email is already assigned.")).toBeTruthy(),
  );
  expect(screen.getByLabelText("First name").props.value).toBe("Grace");
  fireEvent.changeText(
    screen.getByLabelText("Work email"),
    "another@example.test",
  );
  fireEvent.press(screen.getByRole("button", { name: "Create user" }));
  await waitFor(() =>
    expect(screen.getByRole("header", { name: "User created" })).toBeTruthy(),
  );
  expect(writes).toBe(2);
});
it.each(["account.email.enabled", "account.recovery.enabled"])(
  "does not provision when %s is disabled",
  async (flag) => {
    mockBoot.features[flag] = false;
    const screen = await ready("new-user");
    expect(screen.queryByRole("button", { name: "Create user" })).toBeNull();
    expect(requests("/users")).toHaveLength(0);
  },
);
it.each([403, 401])(
  "handles provisioning %s without replaying the request or claiming success",
  async (status) => {
    handler = (request) => {
      if (
        new URL(request.url).pathname.endsWith("/users") &&
        request.method === "POST"
      ) {
        if (status === 403) {
          mockBoot.actions["users.create"] = false;
          mockBoot.access_revision++;
        }
        return json({ message: "Not permitted" }, status);
      }
      return defaultResponse(request);
    };
    const screen = await ready("new-user");
    await fillPasswordLinkUser(screen);
    fireEvent.press(screen.getByRole("button", { name: "Create user" }));
    await waitFor(() =>
      expect(
        status === 401
          ? session.phase
          : session.bootstrap?.actions["users.create"],
      ).toBe(status === 401 ? "signedOut" : false),
    );
    expect(
      requests("/users").filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(screen.queryByRole("header", { name: "User created" })).toBeNull();
  },
);
it("invalidates a provisioning draft when email delivery is disabled and preserves field limits after reenablement", async () => {
  const screen = await ready("new-user");
  await fillPasswordLinkUser(screen);
  mockBoot.features["account.email.enabled"] = false;
  mockBoot.configuration_revision = "email-disabled";
  await act(async () => session.refresh());
  expect(screen.queryByLabelText("First name")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create user" })).toBeNull();
  mockBoot.features["account.email.enabled"] = true;
  mockBoot.fields.phone!.edit = false;
  mockBoot.access_revision++;
  mockBoot.configuration_revision = "email-restored";
  await act(async () => session.refresh());
  expect(screen.queryByRole("button", { name: "Create user" })).toBeNull();
  expect(requests("/users")).toHaveLength(0);
  mockBoot.fields.phone!.edit = true;
  mockBoot.access_revision++;
  await act(async () => session.refresh());
  await waitFor(() =>
    expect(screen.getByLabelText("First name").props.value).toBe(""),
  );
});
it.each(["new-user", "new-role"] as const)(
  "hides %s and avoids context reads when the bootstrap mobile API gate is disabled",
  async (kind) => {
    mockBoot.features["api.enabled"] = false;
    const screen = await ready(kind);
    expect(screen.queryByLabelText("First name")).toBeNull();
    expect(screen.queryByLabelText("Role name")).toBeNull();
    expect(requests("/mobile/users/create-context")).toHaveLength(0);
    expect(requests("/mobile/roles/create-context")).toHaveLength(0);
  },
);
it("uses only available real role presets and submits their exact grants, scopes and fields", async () => {
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/roles") &&
    request.method === "POST"
      ? json({ data: { id: 8 } }, 201)
      : defaultResponse(request);
  const screen = await ready("new-role");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Viewer" })).toBeTruthy(),
  );
  expect(
    screen.getByRole("button", { name: "Manager" }).props.accessibilityState
      .disabled,
  ).toBe(true);
  fireEvent.press(screen.getByRole("button", { name: "Manager" }));
  fireEvent.press(screen.getByRole("button", { name: "Viewer" }));
  fireEvent.changeText(screen.getByLabelText("Role name"), "Fixture viewer");
  fireEvent.changeText(screen.getByLabelText("Description"), "Fixture role");
  fireEvent.press(screen.getByRole("button", { name: "Create role" }));
  await waitFor(() =>
    expect(
      requests("/roles").filter((request) => request.method === "POST"),
    ).toHaveLength(1),
  );
  const body = await requests("/roles")
    .find((request) => request.method === "POST")!
    .clone()
    .json();
  expect(body).toEqual({
    availability_revision: mockBoot.availability_revision,
    name: "Fixture viewer",
    description: "Fixture role",
    preset: "viewer",
    grants: ["users.view"],
    scopes: { "users.view": "self" },
    fields: { name: { view: true, edit: false } },
  });
  expect(requests("/mobile/step-up")).toHaveLength(0);
});
it("keeps role preset validation visible and permits an explicit corrected retry", async () => {
  let writes = 0;
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/roles") &&
    request.method === "POST"
      ? ++writes === 1
        ? json(
            {
              message: "Validation",
              errors: { preset: ["Preset no longer available."] },
            },
            422,
          )
        : json({ data: { id: 8 } }, 201)
      : defaultResponse(request);
  const screen = await ready("new-role");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Viewer" })).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Viewer" }));
  fireEvent.changeText(screen.getByLabelText("Role name"), "Fixture viewer");
  fireEvent.press(screen.getByRole("button", { name: "Create role" }));
  await waitFor(() =>
    expect(screen.getByText("Preset no longer available.")).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Editor" }));
  fireEvent.press(screen.getByRole("button", { name: "Create role" }));
  await waitFor(() => expect(writes).toBe(2));
});
it("invalidates a role preset draft when authority changes and uses the refreshed preset ceiling", async () => {
  const screen = await ready("new-role");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Viewer" })).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Viewer" }));
  fireEvent.changeText(screen.getByLabelText("Role name"), "Stale draft");
  mockBoot.actions["roles.manage"] = false;
  mockBoot.access_revision++;
  await act(async () => session.refresh());
  expect(screen.queryByRole("button", { name: "Create role" })).toBeNull();
  mockBoot.actions["roles.manage"] = true;
  mockBoot.access_revision++;
  handler = (request) => {
    if (!new URL(request.url).pathname.endsWith("/mobile/roles/create-context"))
      return defaultResponse(request);
    return json({
      data: {
        presets: Object.fromEntries(
          ["viewer", "editor", "manager"].map((key) => [
            key,
            {
              label: key,
              available: false,
              grants: [],
              scopes: {},
              fields: {},
            },
          ]),
        ),
        catalog: {},
        scope_options: {
          self: "Own",
          created: "Created",
          assigned: "Assigned",
          all: "All",
        },
      },
    });
  };
  await act(async () => session.refresh());
  await waitFor(() =>
    expect(screen.getByLabelText("Role name").props.value).toBe(""),
  );
  expect(
    screen.getByRole("button", { name: "viewer" }).props.accessibilityState
      .disabled,
  ).toBe(true);
  fireEvent.press(screen.getByRole("button", { name: "viewer" }));
  expect(requests("/roles")).toHaveLength(0);
});
it("reports partial bulk suspension without hiding Owner skips or replaying the action", async () => {
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/users/bulk")
      ? json({
          data: { status: "completed", updated_count: 1, skipped_count: 1 },
        })
      : defaultResponse(request);
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  fireEvent.press(
    screen.getByRole("button", { name: "Owned user 3, Enabled" }),
  );
  fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  fireEvent.press(screen.getByRole("button", { name: "Suspend selected" }));
  fireEvent.press(screen.getByRole("button", { name: "Suspend selected" }));
  await waitFor(() =>
    expect(screen.getByTestId("confirm-action")).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
  await waitFor(() =>
    expect(screen.getByText("1 updated · 1 skipped")).toBeTruthy(),
  );
  expect(requests("/users/bulk")).toHaveLength(1);
  expect(await requests("/users/bulk")[0]!.clone().json()).toMatchObject({
    action: "suspend",
    selection: { mode: "selected", ids: [2, 3] },
  });
});
it("cancels destructive bulk consent without a write or an error claim", async () => {
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  fireEvent.press(screen.getByRole("button", { name: "Suspend selected" }));
  await waitFor(() =>
    expect(screen.getByTestId("confirm-action")).toBeTruthy(),
  );
  fireEvent.press(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
  await waitFor(() =>
    expect(screen.queryByTestId("confirm-action")).toBeNull(),
  );
  expect(requests("/users/bulk")).toHaveLength(0);
  expect(screen.queryByText("App request failed")).toBeNull();
});
it("reactivates selected accounts through a canonical wrapped accepted job", async () => {
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/users/bulk")
      ? json({ data: { ...operation(), kind: "bulk" } }, 202)
      : defaultResponse(request);
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  fireEvent.press(screen.getByRole("button", { name: "Reactivate selected" }));
  await waitFor(() =>
    expect(screen.getByTestId("session-ids").props.children).toBe(operationId),
  );
  expect(await requests("/users/bulk")[0]!.clone().json()).toMatchObject({
    action: "reactivate",
    selection: { mode: "selected", ids: [2] },
  });
  expect(screen.queryByTestId("confirm-action")).toBeNull();
});
it.each([422, 403, 401])(
  "handles a rejected bulk action with %s without automatic replay or a success receipt",
  async (status) => {
    let writes = 0;
    handler = (request) => {
      if (!new URL(request.url).pathname.endsWith("/users/bulk"))
        return defaultResponse(request);
      writes++;
      if (writes > 1)
        return json({
          data: { status: "completed", updated_count: 1, skipped_count: 0 },
        });
      if (status === 403) {
        mockBoot.actions["users.bulk"] = false;
        mockBoot.access_revision++;
      }
      return json({ message: "Fixture rejected selection" }, status);
    };
    const screen = await ready("users");
    await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
    fireEvent(screen.getByText("Owned user 2"), "longPress");
    fireEvent.press(screen.getByRole("button", { name: "Actions" }));
    fireEvent.press(
      screen.getByRole("button", { name: "Reactivate selected" }),
    );
    await waitFor(() => {
      if (status === 401) expect(session.phase).toBe("signedOut");
      else if (status === 403)
        expect(session.bootstrap?.actions["users.bulk"]).toBe(false);
      else
        expect(
          screen.getAllByText("Check the highlighted fields.").length,
        ).toBeGreaterThan(0);
    });
    expect(writes).toBe(1);
    expect(screen.getByTestId("session-ids").props.children).toBe("");
    expect(screen.queryByText(/updated.*skipped/i)).toBeNull();
    if (status === 422) {
      fireEvent.press(
        screen.getByRole("button", { name: "Reactivate selected" }),
      );
      await waitFor(() => expect(writes).toBe(2));
      expect(await requests("/users/bulk")[1]!.clone().json()).toMatchObject({
        selection: { mode: "selected", ids: [2] },
      });
    }
  },
);
it("cancels bulk consent and clears selection when the bulk feature is disabled", async () => {
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  fireEvent.press(screen.getByRole("button", { name: "Suspend selected" }));
  await waitFor(() =>
    expect(screen.getByTestId("confirm-action")).toBeTruthy(),
  );
  mockBoot.features["users.bulk.enabled"] = false;
  mockBoot.configuration_revision = "bulk-disabled";
  await act(async () => session.refresh());
  expect(screen.queryByTestId("confirm-action")).toBeNull();
  expect(requests("/users/bulk")).toHaveLength(0);
  mockBoot.features["users.bulk.enabled"] = true;
  mockBoot.configuration_revision = "bulk-restored";
  mockBoot.actions["users.status"] = false;
  mockBoot.access_revision++;
  await act(async () => session.refresh());
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Actions" })).toBeNull();
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  expect(
    screen.queryByRole("button", { name: "Reactivate selected" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Suspend selected" })).toBeNull();
});
it("exports explicit selected IDs and permitted columns without changing the selection to all", async () => {
  mockBoot.fields.email!.view = false;
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  fireEvent.press(screen.getByRole("button", { name: "Export selected" }));
  expect(screen.queryByRole("button", { name: "Email" })).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Download and share" }));
  fireEvent.press(screen.getByRole("button", { name: "Download and share" }));
  await waitFor(() =>
    expect(screen.getByTestId("session-ids").props.children).toBe(operationId),
  );
  expect(requests("/exports/users")).toHaveLength(1);
  const body = await requests("/exports/users")[0]!.clone().json();
  expect(body.selection).toEqual({ mode: "selected", ids: [2] });
  expect(body.columns).not.toContain("email");
  expect(body.criteria).toEqual({ search: "" });
});
it.each([422, 403, 401])(
  "does not create a job, share bytes or replay a selected export rejected with %s",
  async (status) => {
    handler = (request) => {
      if (!new URL(request.url).pathname.endsWith("/exports/users"))
        return defaultResponse(request);
      if (status === 403) {
        mockBoot.actions["users.export"] = false;
        mockBoot.access_revision++;
      }
      return json({ message: "Fixture rejected export" }, status);
    };
    const screen = await ready("users");
    await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
    fireEvent(screen.getByText("Owned user 2"), "longPress");
    fireEvent.press(screen.getByRole("button", { name: "Export selected" }));
    fireEvent.press(screen.getByRole("button", { name: "Download and share" }));
    await waitFor(() => {
      if (status === 401) expect(session.phase).toBe("signedOut");
      else if (status === 403)
        expect(session.bootstrap?.actions["users.export"]).toBe(false);
      else
        expect(
          screen.getAllByText("Check the highlighted fields.").length,
        ).toBeGreaterThan(0);
    });
    expect(requests("/exports/users")).toHaveLength(1);
    expect(screen.getByTestId("session-ids").props.children).toBe("");
    expect(shareBytes).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  },
);
it("shows existing key details and copies only a newly issued in-memory secret on request", async () => {
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/keys")
      ? request.method === "POST"
        ? json({ access_token: "synthetic-one-time-test-key" }, 201)
        : json({
            data: [
              {
                id: 3,
                name: "Fixture integration",
                abilities: ["account.read"],
                expires_at: null,
                last_used_at: null,
              },
            ],
          })
      : defaultResponse(request);
  const screen = await ready("keys");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /^Fixture integration/ }),
    ).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: /^Fixture integration/ }));
  expect(screen.getByText("Not available after creation")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copy key" })).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Close dialog" }));
  await issueFixtureKey(screen);
  await waitFor(() =>
    expect(screen.getByText("synthetic-one-time-test-key")).toBeTruthy(),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Copy key" }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
  fireEvent.press(screen.getByRole("button", { name: "Copy key" }));
  await waitFor(() =>
    expect(screen.getByText("App request failed")).toBeTruthy(),
  );
  expect(screen.queryByText("Key copied")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Copy key" }));
  await waitFor(() => expect(screen.getByText("Key copied")).toBeTruthy());
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(
    "synthetic-one-time-test-key",
  );
  expect([...stored.values()].join(" ")).not.toContain(
    "synthetic-one-time-test-key",
  );
  fireEvent.press(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByText("synthetic-one-time-test-key")).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy key" })).toBeNull();
});
it.each([422, 403, 401])(
  "handles key creation %s without revealing or copying a secret or replaying issuance",
  async (status) => {
    handler = (request) => {
      if (
        new URL(request.url).pathname.endsWith("/keys") &&
        request.method === "POST"
      ) {
        if (status === 403) {
          mockBoot.modules.keys = false;
          mockBoot.access_revision++;
        }
        return json(
          {
            message: "Denied",
            errors: { name: ["Choose a different key name."] },
          },
          status,
        );
      }
      return defaultResponse(request);
    };
    const screen = await ready("keys");
    await issueFixtureKey(screen);
    await waitFor(() => {
      if (status === 422)
        expect(screen.getByText("Choose a different key name.")).toBeTruthy();
      else if (status === 401) expect(session.phase).toBe("signedOut");
      else expect(session.bootstrap?.modules.keys).toBe(false);
    });
    expect(keyWrites()).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Copy key" })).toBeNull();
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  },
);
it("discards a late issued key after a different account signs in", async () => {
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/keys") && request.method === "POST"
      ? held.promise
      : defaultResponse(request);
  const screen = await ready("keys");
  await issueFixtureKey(screen);
  await waitFor(() => expect(keyWrites()).toHaveLength(1));
  await act(async () => {
    await session.logout();
    mockBoot.account.id = "other-account";
    await session.signIn("other@example.test", "SyntheticPassword");
  });
  await act(async () =>
    held.resolve(json({ access_token: "synthetic-stale-test-key" }, 201)),
  );
  expect(screen.queryByText("synthetic-stale-test-key")).toBeNull();
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  expect([...stored.values()].join(" ")).not.toContain(
    "synthetic-stale-test-key",
  );
});
it("refreshes authority, probes a validated read-only destination and retries after a failed probe", async () => {
  mockParams = { retry: "/users/2", account: String(mockBoot.account.id) };
  mockBoot.modules.users = false;
  let reads = 0;
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/users/2/context")
      ? ++reads === 1
        ? json({ message: "Fixture temporary failure" }, 503)
        : json({
            data: {
              user: { id: 2, public_id: "user-2" },
              actions: {},
              role_options: [],
              action_reasons: {},
              governance: null,
              avatar_available: false,
            },
          })
      : defaultResponse(request);
  const screen = await ready("unavailable");
  mockBoot.modules.users = true;
  mockBoot.access_revision++;
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(reads).toBe(1));
  await waitFor(() =>
    expect(screen.getByText("Service temporarily unavailable")).toBeTruthy(),
  );
  expect(router.replace).not.toHaveBeenCalledWith("/users/2");
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/users/2"));
  expect(reads).toBe(2);
  expect(
    requests("/mobile/users/2/context").every(
      (request) => request.method === "GET",
    ),
  ).toBe(true);
});
it.each([
  "https://untrusted.invalid/users/2",
  "/reset-password/" + "a".repeat(64) + "?email=fixture@example.test",
  "/users/../roles/2",
  "/operations/" + operationId,
])(
  "does not offer or dispatch an unsafe or unsupported retry for %s",
  async (retry) => {
    mockParams = { retry, account: String(mockBoot.account.id) };
    const screen = await ready("unavailable");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(requests("/mobile/users/2/context")).toHaveLength(0);
  },
);
it("does not probe a retry destination whose module remains denied after authority refresh", async () => {
  mockParams = { retry: "/users/2", account: String(mockBoot.account.id) };
  mockBoot.modules.users = false;
  const screen = await ready("unavailable");
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByText("Access unavailable")).toBeTruthy(),
  );
  expect(requests("/mobile/users/2/context")).toHaveLength(0);
  expect(router.replace).not.toHaveBeenCalledWith("/users/2");
});
it.each([401, 404])(
  "never navigates or replays a read-only probe rejected with %s",
  async (status) => {
    mockParams = { retry: "/users/2", account: String(mockBoot.account.id) };
    handler = (request) =>
      new URL(request.url).pathname.endsWith("/mobile/users/2/context")
        ? json({ message: "Fixture denied or expired" }, status)
        : defaultResponse(request);
    const screen = await ready("unavailable");
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      if (status === 401) expect(session.phase).toBe("signedOut");
      else {
        expect(requests("/mobile/bootstrap")).toHaveLength(3);
        expect(session.phase).toBe("ready");
        expect(screen.getByText("This link isn’t available")).toBeTruthy();
      }
    });
    expect(requests("/mobile/users/2/context")).toHaveLength(1);
    expect(router.replace).not.toHaveBeenCalledWith("/users/2");
  },
);
it("rejects a successful read-only response for a different record", async () => {
  mockParams = { retry: "/users/2", account: String(mockBoot.account.id) };
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/users/2/context")
      ? json({
          data: {
            user: { id: 3, public_id: "user-3" },
            actions: {},
            role_options: [],
            action_reasons: {},
            governance: null,
            avatar_available: false,
          },
        })
      : defaultResponse(request);
  const screen = await ready("unavailable");
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByText("App request failed")).toBeTruthy(),
  );
  expect(router.replace).not.toHaveBeenCalledWith("/users/2");
  expect(requests("/mobile/users/2/context")).toHaveLength(1);
});
it("aborts a pending read-only probe when its screen is left and ignores a late success", async () => {
  mockParams = { retry: "/users/2", account: String(mockBoot.account.id) };
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/users/2/context")
      ? held.promise
      : defaultResponse(request);
  const screen = await ready("unavailable");
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(requests("/mobile/users/2/context")).toHaveLength(1),
  );
  const read = requests("/mobile/users/2/context")[0]!;
  fireEvent.press(screen.getByRole("button", { name: "Leave feature" }));
  await waitFor(() => expect(read.signal.aborted).toBe(true));
  await act(async () =>
    held.resolve(
      json({
        data: {
          user: { id: 2, public_id: "user-2" },
          actions: {},
          role_options: [],
          action_reasons: {},
          governance: null,
          avatar_available: false,
        },
      }),
    ),
  );
  expect(router.replace).not.toHaveBeenCalledWith("/users/2");
});
it("does not resume an old retry after another account signs in during authority refresh", async () => {
  mockParams = { retry: "/users/2", account: String(mockBoot.account.id) };
  const screen = await ready("unavailable");
  const held = deferred();
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/mobile/config")
      ? held.promise
      : defaultResponse(request);
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(session.phase).toBe("checking"));
  handler = null;
  await act(async () => {
    await session.logout();
    mockBoot.account.id = "other-account";
    await session.signIn("other@example.test", "SyntheticPassword");
  });
  await act(async () => held.resolve(json(fixtures.configuration)));
  expect(requests("/mobile/users/2/context")).toHaveLength(0);
  expect(router.replace).not.toHaveBeenCalledWith("/users/2");
});
it("allows the admin create forms with their independent create/manage grant and no list view grant", async () => {
  mockBoot.modules.users = false;
  mockBoot.modules.roles = false;
  const user = await ready("new-user");
  await waitFor(() => expect(user.getByLabelText("First name")).toBeTruthy());
  expect(requests("/users")).toHaveLength(0);
  user.unmount();
  await queryClient.cancelQueries();
  queryClient.clear();
  stored.clear();
  const role = await ready("new-role");
  await waitFor(() => expect(role.getByLabelText("Role name")).toBeTruthy());
  fireEvent.press(role.getByRole("button", { name: "Choose permissions" }));
  expect(role.getByTestId("permission-group-users")).toBeTruthy();
  expect(role.getByRole("button", { name: "View: Phone No." })).toBeTruthy();
  fireEvent.press(role.getByRole("button", { name: "Done" }));
  expect(requests("/roles/2")).toHaveLength(0);
});
it("lists an actual accepted export job only within its fenced current session", async () => {
  expect(typeof TextDecoder).toBe("function");
  expect(new TextDecoder().decode(new Uint8Array([123, 125]))).toBe("{}");
  const fixtureBytes = await json(operation(), 202).arrayBuffer();
  expect(fixtureBytes).toBeInstanceOf(ArrayBuffer);
  expect(new TextDecoder().decode(fixtureBytes)).toContain(operationId);
  const screen = await ready("reports");
  expect(
    screen.getByText("No operations started in this session."),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Export users" }));
  fireEvent.press(screen.getByRole("button", { name: "Download and share" }));
  await waitFor(
    () => {
      expect(screen.getByTestId("session-ids").props.children).toBe(
        operationId,
      );
    },
    { timeout: 10000 },
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Reports: Queued, 10 / 100" }),
    ).toBeTruthy(),
  );
  expect(router.push).toHaveBeenCalledWith(`/operations/${operationId}`);
  await act(async () => {
    await session.logout();
  });
  mockBoot.account.id = "99";
  await act(async () => {
    await session.signIn("other@example.test", "SyntheticPassword");
  });
  expect(screen.getByTestId("session-ids").props.children).toBe("");
  expect(
    screen.getByText("No operations started in this session."),
  ).toBeTruthy();
});
it("remembers a raw accepted bulk response after a caller-bound confirmed action", async () => {
  handler = (request) =>
    new URL(request.url).pathname.endsWith("/users/bulk")
      ? json({ ...operation(), kind: "bulk" }, 202)
      : defaultResponse(request);
  const screen = await ready("users");
  await waitFor(() => expect(screen.getByText("Owned user 2")).toBeTruthy());
  fireEvent(screen.getByText("Owned user 2"), "longPress");
  fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  fireEvent.press(screen.getByRole("button", { name: "Suspend selected" }));
  await waitFor(() =>
    expect(screen.getByTestId("confirm-action")).toBeTruthy(),
  );
  expect(screen.queryByLabelText("Current password")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
  await waitFor(
    () =>
      expect(screen.getByTestId("session-ids").props.children).toBe(
        operationId,
      ),
    { timeout: 10000 },
  );
  expect(requests("/users/bulk")).toHaveLength(1);
  expect(await requests("/users/bulk")[0]!.clone().json()).toMatchObject({
    action: "suspend",
    selection: { mode: "selected", ids: [2] },
  });
  expect(
    requests("/users/bulk")[0]!.headers.get("X-Mobile-Step-Up"),
  ).toBeNull();
  expect(requests("/mobile/step-up")).toHaveLength(0);
  expect(router.push).toHaveBeenCalledWith(`/operations/${operationId}`);
  await act(async () => {
    await session.logout();
  });
  expect(screen.getByTestId("session-ids").props.children).toBe("");
});
it("caps the session collection at twenty and takes status snapshots without twenty polling loops", async () => {
  jest.useFakeTimers();
  const screen = await ready("reports");
  act(() => {
    for (let index = 1; index <= 22; index++)
      rememberOperation(
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        "users",
        session.bootstrap!,
        session.captureWork,
      );
  });
  await waitFor(() =>
    expect(
      screen.getByTestId("session-ids").props.children.split(","),
    ).toHaveLength(20),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([request]) =>
        /\/operations\/[a-f\d-]{36}$/.test(
          new URL((request as Request).url).pathname,
        ),
      ),
    ).toHaveLength(20),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(60000);
  });
  expect(
    fetcher.mock.calls.filter(([request]) =>
      /\/operations\/[a-f\d-]{36}$/.test(
        new URL((request as Request).url).pathname,
      ),
    ),
  ).toHaveLength(20);
  await act(async () => {
    await session.logout();
  });
  expect(screen.getByTestId("session-ids").props.children).toBe("");
});
it("backs off queued/running status reads and stops polling once completed", async () => {
  jest.useFakeTimers();
  let reads = 0;
  const readTimes: number[] = [];
  handler = (request) =>
    new URL(request.url).pathname.endsWith(`/operations/${operationId}`)
      ? (readTimes.push(Date.now()),
        json(
          operation(
            operationId,
            ++reads >= 3 ? "completed" : reads === 2 ? "running" : "queued",
          ),
        ))
      : defaultResponse(request);
  const screen = await ready("operation");
  await waitFor(() => expect(screen.getByText("Queued")).toBeTruthy());
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000);
  });
  await waitFor(() => expect(screen.getByText("Processing")).toBeTruthy());
  expect(reads).toBe(2);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(
      Math.max(0, readTimes[1]! + 3999 - Date.now()),
    );
  });
  expect(reads).toBe(2);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
  await waitFor(() => expect(screen.getByText("Ready")).toBeTruthy());
  expect(readTimes[1]! - readTimes[0]!).toBeGreaterThanOrEqual(2000);
  expect(readTimes[2]! - readTimes[1]!).toBeGreaterThanOrEqual(4000);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(60000);
  });
  expect(reads).toBe(3);
});
it.each([429, 503])(
  "honors %s read deadlines through Reports refresh button, pull refresh and row retries",
  async (status) => {
    jest.useFakeTimers();
    let deadline = 0;
    let reads = 0;
    const readTimes: number[] = [];
    handler = (request) => {
      if (!new URL(request.url).pathname.endsWith(`/operations/${operationId}`))
        return defaultResponse(request);
      reads++;
      readTimes.push(Date.now());
      if (reads === 1) {
        deadline = Date.now() + 60000;
        return new Response("{}", {
          status,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        });
      }
      return json(operation());
    };
    const screen = await ready("reports");
    act(() =>
      rememberOperation(
        operationId,
        "users",
        session.bootstrap!,
        session.captureWork,
      ),
    );
    await waitFor(() => expect(reads).toBe(1));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Refresh export status" }),
      );
    });
    await act(async () => {
      screen
        .UNSAFE_getByType(ScrollView)
        .props.refreshControl.props.onRefresh();
    });
    // Bypass even the visual row countdown: direct QueryClient refetch still cannot send.
    await act(async () => {
      void queryClient.refetchQueries({
        predicate: (query) => query.queryKey[4] === "operation",
      });
      await jest.advanceTimersByTimeAsync(
        Math.max(0, deadline - Date.now() - 1),
      );
    });
    expect(reads).toBe(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", { name: "Refresh export status" }),
      );
    });
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
    expect(readTimes.slice(1).every((time) => time >= deadline)).toBe(true);
  },
);
it("waits for queued-operation 503 Retry-After before automatic query retry or polling", async () => {
  jest.useFakeTimers();
  let reads = 0;
  let deadline = 0;
  const times: number[] = [];
  handler = (request) => {
    if (!new URL(request.url).pathname.endsWith(`/operations/${operationId}`))
      return defaultResponse(request);
    times.push(Date.now());
    if (++reads === 2) {
      deadline = Date.now() + 60000;
      return new Response("{}", {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      });
    }
    return json(operation(operationId, reads === 1 ? "queued" : "completed"));
  };
  const screen = await ready("operation");
  await waitFor(() => expect(screen.getByText("Queued")).toBeTruthy());
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000);
  });
  expect(reads).toBe(2);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(Math.max(0, deadline - Date.now() - 1));
  });
  expect(reads).toBe(2);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
  await waitFor(() => expect(screen.getByText("Ready")).toBeTruthy());
  expect(reads).toBe(3);
  expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(60000);
});
it.each([
  [390, 1, true, true, 4, 175],
  [390, 2, true, true, 4, 358],
  [1280, 1, true, true, 4, 312],
  [1280, 2, true, true, 4, 632],
  [390, 1, true, false, 3, 175],
  [390, 1, false, false, 1, 175],
] as const)(
  "keeps pending and loaded KPI geometry aligned at width %s/font %s with status %s/email %s",
  async (width, fontScale, status, email, count, cardWidth) => {
    const window = Dimensions.get("window");
    const device = Dimensions.get("screen");
    const held = deferred();
    Dimensions.set({
      window: { ...window, width, fontScale },
      screen: { ...device, width, fontScale },
    });
    mockBoot.fields.status!.view = status;
    mockBoot.fields.status!.edit = status;
    mockBoot.fields.email!.view = email;
    mockBoot.fields.email!.edit = email;
    handler = (request) =>
      new URL(request.url).pathname.endsWith("/dashboard")
        ? held.promise
        : defaultResponse(request);
    const metrics: Record<string, number> = {
      ...fixtures.dashboard.data.metrics,
    };
    if (!status) {
      delete metrics.Enabled;
      delete metrics.Disabled;
    }
    if (!email) delete metrics["Verified email"];
    try {
      const screen = await ready("home");
      const skeleton = screen.UNSAFE_getByType(HomeSkeleton);
      expect(skeleton.props).toMatchObject({
        count,
        cardWidth,
        gap: 8,
      });
      const pendingCards = screen
        .UNSAFE_getAllByType(Card)
        .filter((card) => card.props.style?.minHeight === 82);
      expect(pendingCards).toHaveLength(count);
      expect(
        pendingCards.map((card) => StyleSheet.flatten(card.props.style).width),
      ).toEqual(Array(count).fill(cardWidth));
      await act(async () =>
        held.resolve(json({ data: { ...fixtures.dashboard.data, metrics } })),
      );
      await waitFor(
        () =>
          expect(screen.UNSAFE_queryAllByType(HomeSkeleton)).toHaveLength(0),
        { timeout: 10000 },
      );
      const loadedCards = screen
        .UNSAFE_getAllByType(Card)
        .filter((card) => card.props.style?.minHeight === 82);
      expect(loadedCards).toHaveLength(count);
      expect(
        loadedCards.map((card) => StyleSheet.flatten(card.props.style).width),
      ).toEqual(Array(count).fill(cardWidth));
    } finally {
      held.resolve(json(fixtures.dashboard));
      act(() => Dimensions.set({ window, screen: device }));
    }
  },
);
it.each([1, 2])(
  "renders the real admin Home KPI widths at compact font scale %s",
  async (fontScale) => {
    const window = Dimensions.get("window");
    const device = Dimensions.get("screen");
    Dimensions.set({
      window: { ...window, width: 390, fontScale },
      screen: { ...device, width: 390, fontScale },
    });
    try {
      const screen = await ready("home");
      await waitFor(() =>
        expect(screen.getByText("Total accounts")).toBeTruthy(),
      );
      const kpis = screen
        .UNSAFE_getAllByType(Card)
        .filter((card) => card.props.style?.minHeight === 82);
      expect(kpis).toHaveLength(4);
      for (const card of kpis)
        expect(StyleSheet.flatten(card.props.style).width).toBe(
          fontScale === 2 ? 358 : 175,
        );
    } finally {
      act(() => Dimensions.set({ window, screen: device }));
    }
  },
);
it("shows a stale-link state and obtains a fresh owned status/link before an explicit download", async () => {
  let reads = 0;
  handler = (request) =>
    new URL(request.url).pathname.endsWith(`/operations/${operationId}`)
      ? json(
          operation(
            operationId,
            "completed",
            signed(
              Math.floor(Date.now() / 1000) + (++reads === 1 ? -10 : 180),
              reads === 1 ? "a".repeat(64) : "b".repeat(64),
            ),
          ),
        )
      : defaultResponse(request);
  const screen = await ready("operation");
  await waitFor(() =>
    expect(
      screen.getByText(
        "This download link expired. Refresh export status for a new link.",
      ),
    ).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Download and share" }));
  await waitFor(() => expect(shareBytes).toHaveBeenCalledTimes(1));
  expect(requests(`/operations/${operationId}`)).toHaveLength(2);
  expect(
    new URL(
      requests(`/operations/${operationId}/download`)[0]!.url,
    ).searchParams.get("signature"),
  ).toBe("b".repeat(64));
});
