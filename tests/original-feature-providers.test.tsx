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
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import * as fence from "../src/storage/fence";
import { SessionProvider, useSession } from "../src/auth/session";
import { ConfirmationProvider } from "../src/auth/confirmation";
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
import fixtures from "../api/fixtures.json";
import { apiUrl } from "../src/config/environment";
import { Card } from "../src/components/ui";
import { HomeSkeleton } from "../src/components/visuals";

// Real-provider startup and confirmed refresh chains have a suite-local deadline.
jest.setTimeout(30000);

// Auth/confirmation/query/transport modules are real. Only device, navigation,
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
jest.mock("expo-router", () => ({
    router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
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
                        React.createElement(
                            React.Fragment,
                            { key: item.id },
                            row(item),
                        ),
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
const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
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
                <ConfirmationProvider>
                    <Harness kind={kind} />
                </ConfirmationProvider>
            </ThemeProvider>
        </QueryClientProvider>
    </SessionProvider>
);
async function ready(kind: Kind) {
    const screen = render(view(kind));
    await waitFor(
        () =>
            expect(screen.getByTestId("phase").props.children).toBe(
                "signedOut",
            ),
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
    mockBoot.session_needs_sync = false;
    mockBoot.account.name = "Synthetic actor";
    for (const key of Object.keys(mockBoot.actions))
        mockBoot.actions[key] = true;
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
    jest.mocked(SecureStore.getItemAsync).mockImplementation(
        async (key) => stored.get(key) ?? null,
    );
    jest.mocked(SecureStore.setItemAsync).mockImplementation(
        async (key, value) => {
            stored.set(key, value);
        },
    );
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
    jest.spyOn(BackHandler, "addEventListener").mockImplementation(
        (_event, callback) => {
            backListeners.add(callback as () => boolean);
            return {
                remove: () => {
                    backListeners.delete(callback as () => boolean);
                },
            };
        },
    );
    fetcher = jest
        .spyOn(global, "fetch")
        .mockImplementation(async (input) =>
            handler
                ? handler(input as Request)
                : defaultResponse(input as Request),
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
    expect(
        new URL(requests("/users")[0]!.url).searchParams.get("per_page"),
    ).toBe("5");
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
            json(
                page([
                    { id: 42, public_id: "old", name: "Old private result" },
                ]),
            ),
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
    expect(screen.getByText("99+")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add user" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Roles & access" })).toBeTruthy();
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
        screen
            .UNSAFE_getByType(ScrollView)
            .props.refreshControl.props.onRefresh();
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
it("stages authorized new activity until requested, without a focus refresh replacing visible rows", async () => {
    const screen = await ready("activity");
    await waitFor(() =>
        expect(screen.getByText("old activity · success")).toBeTruthy(),
    );
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
    expect(screen.queryByText("new activity · success")).toBeNull();
    expect(screen.getByText("old activity · success")).toBeTruthy();
    expect(
        StyleSheet.flatten(
            screen.getByTestId("new-activity-notice").props.style,
        ).position,
    ).toBe("absolute");
    expect(requests("/audit")).toHaveLength(2);
    fireEvent.press(
        screen.getByRole("button", { name: "New activity available" }),
    );
    await waitFor(() =>
        expect(screen.getByText("new activity · success")).toBeTruthy(),
    );
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
    expect(screen.queryByText("new activity · success")).toBeNull();
});
it("cancels a late activity probe when its permitted module/revision is revoked", async () => {
    const screen = await ready("activity");
    await waitFor(() =>
        expect(screen.getByText("old activity · success")).toBeTruthy(),
    );
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
    expect(screen.queryByText("new activity · success")).toBeNull();
});
it("groups and filters role permissions while preserving edited values and refreshing untouched fields", async () => {
    const screen = await ready("role");
    await waitFor(() =>
        expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
    );
    expect(screen.getByTestId("permission-group-users")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Role name"), "Local name");
    fireEvent.press(screen.getByRole("button", { name: "users status" }));
    fireEvent.changeText(
        screen.getByLabelText("Search permissions or fields"),
        "phone",
    );
    expect(screen.queryByTestId("permission-group-users")).toBeNull();
    expect(
        screen.getByRole("button", { name: "View: Phone No." }),
    ).toBeTruthy();
    fireEvent.changeText(
        screen.getByLabelText("Search permissions or fields"),
        "",
    );
    expect(
        screen.getByRole("button", { name: "users status" }).props
            .accessibilityState.selected,
    ).toBe(true);
    roleName = "Fresh server name";
    rolePhone = true;
    mockBoot.access_revision++;
    await act(async () => {
        await session.refresh();
    });
    await waitFor(() =>
        expect(
            screen.getByRole("button", { name: "View: Phone No." }).props
                .accessibilityState.selected,
        ).toBe(true),
    );
    expect(screen.getByLabelText("Role name").props.value).toBe("Local name");
    expect(
        screen.getByRole("button", { name: "users status" }).props
            .accessibilityState.selected,
    ).toBe(true);
});
it("binds role save approval to its caller and prevents a late write after leaving the form", async () => {
    const screen = await ready("role");
    await waitFor(() =>
        expect(screen.getByLabelText("Role name").props.value).toBe("Reviewer"),
    );
    fireEvent.changeText(screen.getByLabelText("Role name"), "Updated role");
    fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
        expect(screen.getByLabelText("Current password")).toBeTruthy(),
    );
    fireEvent.changeText(
        screen.getByLabelText("Current password"),
        "SyntheticPassword",
    );
    const held = deferred();
    handler = (request) =>
        new URL(request.url).pathname.endsWith("/mobile/step-up")
            ? held.promise
            : defaultResponse(request);
    fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
    await waitFor(() => expect(requests("/mobile/step-up")).toHaveLength(1));
    const approval = requests("/mobile/step-up")[0]!;
    fireEvent.press(screen.getByRole("button", { name: "Leave feature" }));
    await waitFor(() => expect(approval.signal.aborted).toBe(true));
    await act(async () => held.resolve(defaultResponse(approval)));
    expect(
        requests("/roles/2").filter((request) => request.method === "PUT"),
    ).toHaveLength(0);
    expect(router.back).not.toHaveBeenCalled();
});
it("allows the admin create forms with their independent create/manage grant and no list view grant", async () => {
    mockBoot.modules.users = false;
    mockBoot.modules.roles = false;
    const user = await ready("new-user");
    await waitFor(() => expect(user.getByLabelText("Name")).toBeTruthy());
    expect(requests("/users")).toHaveLength(0);
    user.unmount();
    await queryClient.cancelQueries();
    queryClient.clear();
    stored.clear();
    const role = await ready("new-role");
    expect(role.getByLabelText("Role name")).toBeTruthy();
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
    fireEvent.press(screen.getByRole("button", { name: "Disable selected" }));
    await waitFor(() =>
        expect(screen.getByLabelText("Current password")).toBeTruthy(),
    );
    fireEvent.changeText(
        screen.getByLabelText("Current password"),
        "SyntheticPassword",
    );
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
        action: "disable",
        selection: { mode: "selected", ids: [2] },
    });
    expect(requests("/users/bulk")[0]!.headers.get("X-Mobile-Step-Up")).toBe(
        "approved-once",
    );
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
                      ++reads >= 3
                          ? "completed"
                          : reads === 2
                            ? "running"
                            : "queued",
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
            if (
                !new URL(request.url).pathname.endsWith(
                    `/operations/${operationId}`,
                )
            )
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
        if (
            !new URL(request.url).pathname.endsWith(
                `/operations/${operationId}`,
            )
        )
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
        return json(
            operation(operationId, reads === 1 ? "queued" : "completed"),
        );
    };
    const screen = await ready("operation");
    await waitFor(() => expect(screen.getByText("Queued")).toBeTruthy());
    await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
    });
    expect(reads).toBe(2);
    await act(async () => {
        await jest.advanceTimersByTimeAsync(
            Math.max(0, deadline - Date.now() - 1),
        );
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
    [390, 1, true, true, 4, "47%"],
    [390, 2, true, true, 4, "100%"],
    [1280, 1, true, true, 4, "23%"],
    [1280, 2, true, true, 4, "47%"],
    [390, 1, true, false, 3, "47%"],
    [390, 1, false, false, 1, "47%"],
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
                gap: width < 600 ? 12 : 16,
            });
            const pendingCards = screen
                .UNSAFE_getAllByType(Card)
                .filter((card) => card.props.style?.minHeight === 88);
            expect(pendingCards).toHaveLength(count);
            expect(
                pendingCards.map(
                    (card) => StyleSheet.flatten(card.props.style).width,
                ),
            ).toEqual(Array(count).fill(cardWidth));
            await act(async () =>
                held.resolve(
                    json({ data: { ...fixtures.dashboard.data, metrics } }),
                ),
            );
            await waitFor(
                () =>
                    expect(
                        screen.UNSAFE_queryAllByType(HomeSkeleton),
                    ).toHaveLength(0),
                { timeout: 10000 },
            );
            const loadedCards = screen
                .UNSAFE_getAllByType(Card)
                .filter((card) => card.props.style?.minHeight === 88);
            expect(loadedCards).toHaveLength(count);
            expect(
                loadedCards.map(
                    (card) => StyleSheet.flatten(card.props.style).width,
                ),
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
                .filter((card) => card.props.style?.minHeight === 88);
            expect(kpis).toHaveLength(4);
            for (const card of kpis)
                expect(StyleSheet.flatten(card.props.style).width).toBe(
                    fontScale === 2 ? "100%" : "47%",
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
                          Math.floor(Date.now() / 1000) +
                              (++reads === 1 ? -10 : 180),
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
