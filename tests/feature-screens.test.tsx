import UserDetail from "../src/app/(app)/users/[id]";
import { UserMenu } from "../src/features/user-menu";
import React from "react";
import { Dimensions, StyleSheet } from "react-native";
import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import { bootstrapSchema } from "../src/api/runtime";
import { api } from "../src/api/client";
import { useRead } from "../src/api/hooks";
import { useConfirmation } from "../src/auth/confirmation";
import { ThemeProvider } from "../src/theme";
import { useFeatureWork } from "../src/features/use-feature-work";
import { EffectiveAccess } from "../src/features/effective-access";
import { OwnerGovernance } from "../src/features/owner-governance";
import { AvatarPicker } from "../src/features/avatar";
import { AdminAvatar } from "../src/features/admin-avatar";
import { UnreadBadge } from "../src/features/inbox";
import Profile from "../src/app/(app)/profile";
import Preferences from "../src/app/(app)/preferences";
import Notifications from "../src/app/(app)/notifications";
import UserForm from "../src/features/user-form";
import Users from "../src/app/(app)/(tabs)/users";
import Roles from "../src/app/(app)/roles/index";
import UserAccess from "../src/app/(app)/users/[id]/access";
import fixtures from "../api/fixtures.json";
import * as ImagePicker from "expo-image-picker";

let mockSnapshot = bootstrapSchema.parse(fixtures.bootstrap.data);
let mockPhase = "ready";
let mockCurrent = true;
let mockQueries: Record<string, any>;
const mockRefresh = jest.fn(async () => {});
const mockCapture = jest.fn(() => {
  const controller = new AbortController();
  let released = false;
  const isCurrent = () =>
    mockCurrent &&
    mockPhase === "ready" &&
    !controller.signal.aborted &&
    !released;
  return {
    signal: controller.signal,
    isCurrent,
    assertCurrent: () => {
      if (!isCurrent()) throw new Error("cancelled");
    },
    cancel: () => controller.abort(),
    release: () => {
      released = true;
      controller.abort();
    },
  };
});
jest.mock("../src/auth/session", () => ({
  useBootstrap: () => mockSnapshot,
  useSession: () => ({
    bootstrap: mockSnapshot,
    phase: mockPhase,
    captureWork: mockCapture,
    refresh: mockRefresh,
    biometric: false,
    setBiometric: jest.fn(async () => true),
  }),
}));
jest.mock("../src/api/hooks", () => ({
  useRead: jest.fn(
    (module: string) =>
      mockQueries[module] ?? { isPending: false, refetch: jest.fn() },
  ),
  usePages: jest.fn(() => mockQueries.pages),
  useSearch: () => {
    const [search, setSearch] = jest
      .requireActual<typeof import("react")>("react")
      .useState("");
    return { search, setSearch, debounced: search };
  },
}));
jest.mock("../src/auth/confirmation", () => ({ useConfirmation: jest.fn() }));
jest.mock("../src/api/client", () => {
  const actual = jest.requireActual("../src/api/client");
  return {
    ...actual,
    api: {
      GET: jest.fn(),
      POST: jest.fn(),
      PATCH: jest.fn(),
      PUT: jest.fn(),
    },
  };
});
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "2" }),
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
jest.mock("../src/components/forms", () => ({
  ...jest.requireActual("../src/components/forms"),
  useTitle: jest.fn(),
  useDiscard: jest.fn(),
}));
jest.mock("../src/components/records", () => ({
  Records: ({ rows, render: row }: any) =>
    jest.requireActual<typeof import("react")>("react").createElement(
      jest.requireActual<typeof import("react-native")>("react-native").View,
      {},
      rows.map((item: any) =>
        jest
          .requireActual<typeof import("react")>("react")
          .createElement(
            jest.requireActual<typeof import("react")>("react").Fragment,
            { key: item.id },
            row(item),
          ),
      ),
    ),
}));
jest.mock("../src/features/exports", () => ({ ExportButton: () => null }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
const response = (data?: unknown) => ({
  data,
  response: new Response("", { status: 200 }),
});
const ready = (data: unknown) => ({
  data,
  isPending: false,
  error: null,
  dataUpdatedAt: 1,
  refetch: jest.fn(async () => ({})),
});
const wrapper = ({ children }: React.PropsWithChildren) => (
  <ThemeProvider>{children}</ThemeProvider>
);
const profile = () => ({
  id: "1",
  public_id: "profile-id",
  name: "Ada Lovelace",
  first_name: "Ada",
  last_name: "Lovelace",
  phone: "+441234567890",
  email: "ada@example.test",
  status: "enabled",
  email_verified_at: "2026-10-08T00:00:00Z",
  avatar_available: false,
  email_security: true,
  appearance: { timezone: "UTC", date_format: "d M Y" },
});
const target = () => ({
  user: {
    id: "2",
    public_id: "target-id",
    name: "Target",
    email: "target@example.test",
    first_name: "Target",
    last_name: "Surname",
    phone: null,
    status: "enabled",
    roles: [],
  },
  actions: { update: true, owner: true, reset: true, roles: false },
  role_options: [],
  action_reasons: {},
  governance: {
    owner: true,
    locked: true,
    membership_change_allowed: false,
    lock_allowed: true,
  },
  avatar_available: false,
});
const originalFormData = global.FormData;
beforeAll(() => {
  global.FormData = jest.requireActual(
    "react-native/Libraries/Network/FormData",
  ).default;
});
afterAll(() => {
  global.FormData = originalFormData;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockCurrent = true;
  mockPhase = "ready";
  mockSnapshot = bootstrapSchema.parse(fixtures.bootstrap.data);
  mockSnapshot.features["users.avatar.enabled"] = true;
  mockSnapshot.features["notifications.security_email.enabled"] = true;
  mockSnapshot.features["notifications.in_app.enabled"] = true;
  mockSnapshot.modules.notifications = true;
  mockSnapshot.modules.users = true;
  mockSnapshot.modules.roles = true;
  mockSnapshot.actions["users.create"] = true;
  mockSnapshot.actions["access.manage"] = true;
  for (const name of [
    "name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "status",
    "roles",
  ])
    mockSnapshot.fields[name] = { label: name, view: true, edit: true };
  mockQueries = {
    profile: ready(profile()),
    user: ready(target()),
    "user-create": ready({ role_options: [], can_create_owner: true }),
    "user-list-context": ready({
      role_options: [{ id: "5", name: "Reviewer" }],
    }),
    "notification-summary": ready({ unread: 3 }),
    roles: ready([
      {
        id: "5",
        name: "Reviewer",
        permissions: [{ name: "users.view" }],
      },
      { id: "6", name: "Operator", permissions: [] },
    ]),
    pages: {
      rows: [],
      isPending: false,
      refetch: jest.fn(async () => ({})),
    },
  };
  jest
    .mocked(useConfirmation)
    .mockReturnValue(
      jest.fn(async (_method, _path, action) =>
        action(new AbortController().signal),
      ),
    );
  jest
    .mocked(api.POST)
    .mockResolvedValue(response({ data: profile() }) as never);
  jest.mocked(api.PATCH).mockResolvedValue(response() as never);
  jest
    .mocked(api.PUT)
    .mockResolvedValue(response({ data: target().user }) as never);
});

it("preserves unsaved structured profile edits during a background refresh and saves through the shared profile contract", async () => {
  const screen = render(<Profile />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: /Personal details/ }));
  fireEvent.changeText(screen.getByLabelText("First name"), "Grace");
  mockQueries.profile = ready({
    ...profile(),
    first_name: "Server",
    last_name: "Hopper",
  });
  screen.rerender(<Profile />);
  expect(screen.getByLabelText("First name").props.value).toBe("Grace");
  expect(screen.getByLabelText("Last name").props.value).toBe("Hopper");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith(
      "/v1/profile/details",
      expect.objectContaining({
        body: expect.objectContaining({
          first_name: "Grace",
          last_name: "Hopper",
          timezone: "UTC",
        }),
        signal: expect.any(AbortSignal),
        bodySerializer: expect.any(Function),
      }),
    ),
  );
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
});
it("starts a clean profile form for a different account", () => {
  const screen = render(<Profile />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: /Personal details/ }));
  fireEvent.changeText(
    screen.getByLabelText("First name"),
    "Unsaved private value",
  );
  mockSnapshot = {
    ...mockSnapshot,
    account: { ...mockSnapshot.account, id: "other" },
  };
  mockQueries.profile = ready({ ...profile(), first_name: "Different" });
  screen.rerender(<Profile />);
  expect(screen.queryByLabelText("First name")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: /Personal details/ }));
  expect(screen.getByLabelText("First name").props.value).toBe("Different");
});
it("stages personal photo removal with a Laravel boolean multipart value until save and discards it when avatars are disabled", async () => {
  mockQueries.profile = ready({ ...profile(), avatar_available: true });
  const screen = render(<Profile />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: /Personal details/ }));
  fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
  expect(api.POST).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api.POST).toHaveBeenCalled());
  const options = jest.mocked(api.POST).mock.calls[0]![1] as any;
  expect(options.body.remove_avatar).toBe(true);
  expect(options.bodySerializer().getParts()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldName: "remove_avatar",
        string: "1",
      }),
    ]),
  );
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
  mockSnapshot = {
    ...mockSnapshot,
    features: { ...mockSnapshot.features, "users.avatar.enabled": false },
    configuration_revision: "off",
  };
  screen.rerender(<Profile />);
  expect(
    screen.queryByText(
      "The current photo will be removed when you save changes.",
    ),
  ).toBeNull();
  mockSnapshot = {
    ...mockSnapshot,
    features: { ...mockSnapshot.features, "users.avatar.enabled": true },
    configuration_revision: "on",
  };
  screen.rerender(<Profile />);
  expect(
    screen.getByRole("button", { name: "Save changes" }).props
      .accessibilityState.disabled,
  ).toBe(true);
});
it("uploads and removes admin photos only through confirmed multipart writes with a current-session signal", async () => {
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: true } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///private/selected.jpg",
        fileName: "selected.jpg",
        mimeType: "image/jpeg",
      },
    ],
  } as never);
  const refresh = jest.fn(async () => ({}));
  const screen = render(
    <AdminAvatar id="2" available permitted refresh={refresh} />,
    { wrapper },
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose photo" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  const upload = jest.mocked(api.POST).mock.calls[0]![1] as any;
  expect(upload.signal).toBeInstanceOf(AbortSignal);
  expect(upload.headers).toBeUndefined();
  expect(upload.bodySerializer().getParts()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        uri: "file:///private/selected.jpg",
        type: "image/jpeg",
      }),
    ]),
  );
  fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(2));
  const removal = jest.mocked(api.POST).mock.calls[1]![1] as any;
  expect(removal.body).toEqual({ remove_avatar: true });
  expect(removal.bodySerializer().getParts()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldName: "remove_avatar",
        string: "1",
      }),
    ]),
  );
});
it("does not apply a late mutation result after lock or revocation", async () => {
  let complete!: () => void;
  jest.mocked(api.POST).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = () => resolve(response({ data: profile() }) as never);
      }),
  );
  const screen = render(<Profile />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: /Personal details/ }));
  fireEvent.changeText(screen.getByLabelText("First name"), "Grace");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api.POST).toHaveBeenCalled());
  mockCurrent = false;
  mockPhase = "locked";
  screen.rerender(<Profile />);
  await act(async () => complete());
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(screen.queryByText("Changes saved.")).toBeNull();
});
it("exposes only supported security email preferences and removes the toggle when delivery is disabled", async () => {
  const screen = render(<Preferences />, { wrapper });
  fireEvent.press(
    screen.getByRole("switch", { name: "Security email notifications" }),
  );
  await waitFor(() =>
    expect(api.PATCH).toHaveBeenCalledWith(
      "/v1/profile/notification-preferences",
      expect.objectContaining({
        body: { email_security: false },
        signal: expect.any(AbortSignal),
      }),
    ),
  );
  await waitFor(() => expect(mockQueries.profile.refetch).toHaveBeenCalled());
  mockSnapshot = {
    ...mockSnapshot,
    features: {
      ...mockSnapshot.features,
      "notifications.security_email.enabled": false,
    },
  };
  screen.rerender(<Preferences />);
  expect(screen.queryByLabelText("Security email notifications")).toBeNull();
  expect(
    screen.getByText(
      "Security email delivery is disabled by an administrator.",
    ),
  ).toBeTruthy();
});
it("retains unsaved time zone edits while selecting a theme and receiving refreshed preferences", async () => {
  const screen = render(<Preferences />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: /^Time zone,/ }));
  fireEvent.changeText(screen.getByLabelText("Time zone"), "Europe/London");
  fireEvent.press(screen.getByRole("button", { name: "Go back" }));
  fireEvent.press(screen.getByRole("button", { name: "Dark" }));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  mockSnapshot = {
    ...mockSnapshot,
    appearance: {
      ...mockSnapshot.appearance,
      theme: "dark",
      timezone: "America/New_York",
    },
  };
  screen.rerender(<Preferences />);
  fireEvent.press(screen.getByRole("button", { name: /^Time zone,/ }));
  expect(screen.getByLabelText("Time zone").props.value).toBe("Europe/London");
});
it("disables protected owner removal while retaining the authorized unlock action and confirmed signal", async () => {
  const form = render(<UserForm id="2" />, { wrapper });
  expect(form.getByLabelText("Governance owner").props.disabled).toBe(true);
  form.unmount();
  const screen = render(
    <OwnerGovernance
      id="2"
      data={target() as never}
      refresh={mockQueries.user.refetch}
    />,
    { wrapper },
  );
  fireEvent.press(screen.getByRole("button", { name: "Unlock owner account" }));
  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith(
      "/v1/users/{user}/owner-lock",
      expect.objectContaining({
        body: { locked: false },
        signal: expect.any(AbortSignal),
      }),
    ),
  );
});
it("omits independently hidden surname and unauthorized owner membership from user writes", async () => {
  mockSnapshot.fields.last_name!.edit = false;
  mockQueries.user.data.actions.owner = false;
  const screen = render(<UserForm id="2" />, { wrapper });
  expect(screen.queryByLabelText("Last name")).toBeNull();
  expect(screen.queryByLabelText("Governance owner")).toBeNull();
  fireEvent.changeText(screen.getByLabelText("First name"), "Changed");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(api.PUT).toHaveBeenCalled());
  const request = jest.mocked(api.PUT).mock.calls[0]![1] as any;
  expect(request.body).toEqual({ first_name: "Changed" });
  expect(request.signal).toBeInstanceOf(AbortSignal);
});
it("renders server-provided deny origins and AND scope restrictions without recomputing access", () => {
  const screen = render(
    <EffectiveAccess
      value={[
        {
          key: "users.view",
          label: "View users",
          allowed: false,
          scopes: [],
          scope_description: "created OR assigned AND self",
          origin: "Direct deny",
          reason: "Explicit deny wins",
        },
      ]}
    />,
    { wrapper },
  );
  expect(screen.getByText("Source: Direct deny")).toBeTruthy();
  expect(
    screen.getByText("Record scope: created OR assigned AND self"),
  ).toBeTruthy();
  expect(screen.getByText("Reason: Explicit deny wins")).toBeTruthy();
});
it("preserves user edits while updating untouched projected fields on refresh", () => {
  const screen = render(<UserForm id="2" />, { wrapper });
  fireEvent.changeText(
    screen.getByLabelText("First name"),
    "Unsaved first name",
  );
  mockQueries.user = ready({
    ...target(),
    user: {
      ...target().user,
      first_name: "Server first name",
      last_name: "Fresh surname",
    },
  });
  screen.rerender(<UserForm id="2" />);
  expect(screen.getByLabelText("First name").props.value).toBe(
    "Unsaved first name",
  );
  expect(screen.getByLabelText("Last name").props.value).toBe("Fresh surname");
});
it("keeps access edits when a fresh target revision arrives and restricts scope controls to the delegation ceiling", () => {
  mockQueries.access = ready({
    effects: {},
    scopes: {},
    fields: [],
    assigned_ids: [],
    revision: 1,
    effective: [],
    catalog: { "users.view": "View users" },
    field_catalog: {},
    delegatable: { "users.view": ["self", "created"] },
    delegation: null,
  });
  const screen = render(<UserAccess />, { wrapper });
  expect(screen.queryByRole("button", { name: "All users" })).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Allow" }));
  mockQueries.access = ready({
    ...mockQueries.access.data,
    revision: 2,
    effects: { "users.view": "deny" },
  });
  screen.rerender(<UserAccess />);
  expect(
    screen.getByRole("button", { name: "Allow" }).props.accessibilityState
      .selected,
  ).toBe(true);
});
it("refreshes recipient-scoped inbox and unread count after marking a notice, and never routes on a read write", async () => {
  mockQueries.pages.rows = [
    {
      id: "notice-id",
      created_at: "2026-10-08T00:00:00Z",
      read_at: null,
      data: { title: "Notice", path: "/admin/users/2" },
    },
  ];
  const screen = render(<Notifications />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: /^Notice,/ }));
  fireEvent.press(screen.getByRole("button", { name: "Mark as read" }));
  await waitFor(() =>
    expect(api.PATCH).toHaveBeenCalledWith(
      "/v1/notifications/{id}",
      expect.objectContaining({
        params: { path: { id: "notice-id" } },
        body: { read: true },
        signal: expect.any(AbortSignal),
      }),
    ),
  );
  await waitFor(() =>
    expect(mockQueries["notification-summary"].refetch).toHaveBeenCalled(),
  );
  expect(router.push).not.toHaveBeenCalled();
});
it("disables field Allow controls from the independent server view/edit delegation ceilings", () => {
  mockQueries.access = ready({
    effects: {},
    scopes: {},
    fields: [],
    assigned_ids: [],
    revision: 1,
    effective: [],
    catalog: { "users.view": "View users" },
    field_catalog: { phone: "Phone number" },
    delegatable: { "users.view": ["self"] },
    field_delegatable: { phone: { view: true, edit: false } },
    delegation: null,
  });
  const screen = render(<UserAccess />, { wrapper });
  const allow = screen.getAllByRole("button", { name: "Allow" });
  expect(allow[1]!.props.accessibilityState.disabled).toBe(false);
  expect(allow[2]!.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(allow[2]!);
  expect(
    screen.getByRole("button", { name: "Save changes" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  mockQueries.access = ready({
    ...mockQueries.access.data,
    revision: 2,
    field_delegatable: { phone: { view: false, edit: false } },
  });
  screen.rerender(<UserAccess />);
  expect(
    screen.getAllByRole("button", { name: "Allow" })[1]!.props
      .accessibilityState.disabled,
  ).toBe(true);
});
it("hides unread counts and disables their query when inbox is switched off", () => {
  const screen = render(<UnreadBadge />, { wrapper });
  expect(screen.getByLabelText("3 unread notifications")).toBeTruthy();
  mockSnapshot = {
    ...mockSnapshot,
    features: {
      ...mockSnapshot.features,
      "notifications.in_app.enabled": false,
    },
  };
  screen.rerender(<UnreadBadge />);
  expect(screen.queryByLabelText("3 unread notifications")).toBeNull();
  expect(useRead).toHaveBeenLastCalledWith(
    "notification-summary",
    null,
    expect.any(Function),
    false,
  );
});
it("offers a user role filter only while the roles field is visible and resets its selection on revocation", () => {
  const screen = render(<Users />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: "Filter by role" }));
  fireEvent.press(screen.getByRole("button", { name: "Reviewer" }));
  expect(
    screen.getByRole("button", { name: "Filter by role: Reviewer" }),
  ).toBeTruthy();
  mockSnapshot = {
    ...mockSnapshot,
    fields: {
      ...mockSnapshot.fields,
      roles: { label: "Roles", view: false, edit: false },
    },
  };
  screen.rerender(<Users />);
  expect(
    screen.queryByRole("button", { name: "Filter by role: Reviewer" }),
  ).toBeNull();
});
it("filters the authorized role collection by name or permission", () => {
  const screen = render(<Roles />, { wrapper });
  fireEvent.changeText(screen.getByLabelText("Search"), "users.view");
  expect(screen.getByText("Reviewer")).toBeTruthy();
  expect(screen.queryByText("Operator")).toBeNull();
});
it("ignores a photo-picker result that returns after the account locks", async () => {
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: true } as never);
  let complete!: () => void;
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = () =>
          resolve({
            canceled: false,
            assets: [{ uri: "file:///private/photo.jpg" }],
          } as never);
      }),
  );
  const onChange = jest.fn();
  const screen = render(
    <AvatarPicker enabled value={null} onChange={onChange} />,
    { wrapper },
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose photo" }));
  await waitFor(() =>
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled(),
  );
  mockCurrent = false;
  mockPhase = "locked";
  screen.rerender(<AvatarPicker enabled value={null} onChange={onChange} />);
  await act(async () => complete());
  expect(onChange).not.toHaveBeenCalled();
});
it("cancels feature work on unmount without applying its late error", async () => {
  let reject!: (failure: Error) => void;
  const hook = renderHook(useFeatureWork);
  let running!: Promise<void>;
  act(() => {
    running = hook.result.current.run(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
  });
  const scope = mockCapture.mock.results.at(-1)!.value;
  hook.unmount();
  expect(scope.signal.aborted).toBe(true);
  reject(new Error("late"));
  await running;
});
it("bounds a many-role selector and permits a narrow enlarged-font screen to scroll to its last role", () => {
  const window = Dimensions.get("window"),
    nativeScreen = Dimensions.get("screen");
  act(() =>
    Dimensions.set({
      window: { ...window, width: 320, fontScale: 2 },
      screen: { ...nativeScreen, width: 320, fontScale: 2 },
    }),
  );
  mockQueries["user-list-context"] = ready({
    role_options: Array.from({ length: 80 }, (_, index) => ({
      id: String(index + 1),
      name: `Long descriptive role ${index + 1}`,
    })),
  });
  const screen = render(<Users />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: "Filter by role" }));
  const selector = screen.getByTestId("user-role-selector");
  expect(StyleSheet.flatten(selector.props.style)).toMatchObject({
    maxHeight: 240,
    flexGrow: 0,
  });
  expect(selector.props.nestedScrollEnabled).toBe(true);
  expect(
    screen.getByText("Long descriptive role 80").props.allowFontScaling,
  ).not.toBe(false);
  fireEvent.press(
    screen.getByRole("button", { name: "Long descriptive role 80" }),
  );
  expect(
    screen.getByRole("button", {
      name: "Filter by role: Long descriptive role 80",
    }),
  ).toBeTruthy();
  screen.unmount();
  act(() => Dimensions.set({ window, screen: nativeScreen }));
});
it("wraps independent field choices in narrow enlarged-font layouts", () => {
  const window = Dimensions.get("window"),
    nativeScreen = Dimensions.get("screen");
  act(() =>
    Dimensions.set({
      window: { ...window, width: 320, fontScale: 2 },
      screen: { ...nativeScreen, width: 320, fontScale: 2 },
    }),
  );
  mockQueries.access = ready({
    effects: {},
    scopes: {},
    fields: [],
    assigned_ids: [],
    revision: 1,
    effective: [],
    catalog: {},
    field_catalog: { phone: "Phone number" },
    delegatable: {},
    field_delegatable: { phone: { view: true, edit: true } },
    delegation: null,
  });
  const screen = render(<UserAccess />, { wrapper });
  for (const mode of ["view", "edit"])
    expect(
      StyleSheet.flatten(
        screen.getByTestId(`access-field-phone-${mode}-choices`).props.style,
      ),
    ).toMatchObject({ flexDirection: "row", flexWrap: "wrap" });
  expect(screen.getAllByText("Inherit")[0]!.props.allowFontScaling).not.toBe(
    false,
  );
  screen.unmount();
  act(() => Dimensions.set({ window, screen: nativeScreen }));
});

it("keeps permanent user deletion out of the mobile profile and actions sheet even when the server grants it", () => {
  const context = {
    ...target(),
    actions: {
      ...target().actions,
      status: true,
      archive: true,
      restore: true,
      delete: true,
    },
  };
  mockQueries.user = ready(context);
  mockQueries["user-menu"] = ready(context);
  const detail = render(<UserDetail />, { wrapper });
  expect(
    detail.queryByRole("button", { name: "Delete permanently" }),
  ).toBeNull();
  expect(detail.getByRole("button", { name: "Archive account" })).toBeTruthy();
  detail.unmount();
  const menu = render(
    <UserMenu
      id="2"
      name="Target"
      close={jest.fn()}
      refresh={jest.fn(async () => {})}
    />,
    { wrapper },
  );
  expect(menu.queryByRole("button", { name: "Delete permanently" })).toBeNull();
  expect(
    menu.getByRole("button", { name: "Restore account as disabled" }),
  ).toBeTruthy();
  menu.unmount();
});
it("keeps bulk permanent deletion out of the archived mobile directory", () => {
  mockSnapshot.actions["users.delete"] = true;
  mockSnapshot.actions["users.bulk"] = true;
  mockSnapshot.actions["users.restore"] = true;
  mockSnapshot.features["users.bulk.enabled"] = true;
  mockSnapshot.features["users.archive.enabled"] = true;
  const screen = render(<Users />, { wrapper });
  fireEvent.press(screen.getByRole("button", { name: "Archived" }));
  fireEvent.press(screen.getByRole("button", { name: "Select" }));
  expect(
    screen.queryByRole("button", { name: "Delete permanently" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Restore account as disabled" }),
  ).toBeTruthy();
  screen.unmount();
});
