import React from "react";
import {
    fireEvent,
    render,
    renderHook,
    waitFor,
    act,
} from "@testing-library/react-native";
import {
    QueryClient,
    QueryClientProvider,
    focusManager,
    onlineManager,
} from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import fixtures from "../api/fixtures.json";
import { bootstrapSchema, type Bootstrap } from "../src/api/runtime";
import { ApiError } from "../src/api/client";
import { AvailabilityState, ErrorState, Screen } from "../src/components/ui";
import { attachDatePreferences, date, t } from "../src/localization";
import {
    compiledModules,
    exportResourceAllowed,
    modulesFor,
    ModuleRegistryProvider,
    permittedExportResources,
    searchableResources,
    type ModuleDescriptor,
} from "../src/modules/registry";
import More from "../src/app/(app)/(tabs)/more";
import { usePages } from "../src/api/hooks";
import { Access } from "../src/components/access";

let mockBootstrap: Bootstrap;
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
    router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock("../src/auth/session", () => ({
    useBootstrap: () => mockBootstrap,
    useSession: () => ({
        logout: jest.fn(),
        bootstrap: mockBootstrap,
        phase: "ready",
    }),
}));
jest.mock("../src/features/inbox", () => ({ InboxDestination: () => null }));
beforeEach(() => {
    mockBootstrap = bootstrapSchema.parse(
        structuredClone(fixtures.bootstrap.data),
    );
    jest.clearAllMocks();
});
beforeAll(() => {
    const screen = render(<Screen />);
    screen.unmount();
}, 30000);

it("drives the same navigation surfaces from one compiled registry and live server booleans", () => {
    expect(modulesFor("tabs", mockBootstrap).map((item) => item.id)).toEqual([
        "home",
        "users",
        "activity",
        "more",
    ]);
    mockBootstrap.modules.users = false;
    expect(modulesFor("tabs", mockBootstrap).map((item) => item.id)).toEqual([
        "home",
        "activity",
        "more",
    ]);
    expect(
        modulesFor("tabs", mockBootstrap, compiledModules, true).map(
            (item) => item.tab?.screen,
        ),
    ).toEqual(["index", "users", "activity", "more"]);
    mockBootstrap.features["api.enabled"] = false;
    expect(modulesFor("more", mockBootstrap)).toEqual([]);
});

it("extends the real More shell with a compiled existing-account route and removes it when its gate is revoked", () => {
    mockBootstrap.modules.settings = false;
    const fixtureModule: ModuleDescriptor = {
        id: "fixture-account-route",
        label: "settings",
        route: "/profile",
        surfaces: ["more"],
        module: "users",
    };
    const registry = [...compiledModules, fixtureModule];
    const screen = render(
        <ModuleRegistryProvider modules={registry}>
            <More />
        </ModuleRegistryProvider>,
    );
    fireEvent.press(screen.getByRole("button", { name: t("settings") }));
    expect(mockPush).toHaveBeenCalledWith("/profile");
    mockBootstrap = {
        ...mockBootstrap,
        modules: { ...mockBootstrap.modules, users: false },
    };
    screen.rerender(
        <ModuleRegistryProvider modules={registry}>
            <More />
        </ModuleRegistryProvider>,
    );
    expect(screen.queryByRole("button", { name: t("settings") })).toBeNull();
    expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy();
    screen.unmount();
});

it("uses existing grants and source-module eligibility for all five export resources", () => {
    mockBootstrap.actions["roles.export"] = true;
    mockBootstrap.actions["api.manage"] = true;
    mockBootstrap.modules.roles = true;
    mockBootstrap.modules.keys = true;
    expect(
        permittedExportResources(mockBootstrap).map((item) => item.resource),
    ).toEqual(["users", "roles", "audit", "keys", "notifications"]);
    mockBootstrap.actions["users.export"] = false;
    mockBootstrap.modules.activity = false;
    expect(exportResourceAllowed("users", mockBootstrap)).toBe(false);
    expect(exportResourceAllowed("audit", mockBootstrap)).toBe(false);
    expect(exportResourceAllowed("notifications", mockBootstrap)).toBe(true);
    mockBootstrap.features["exports.enabled"] = false;
    expect(permittedExportResources(mockBootstrap)).toEqual([]);
    expect(
        modulesFor("more", mockBootstrap).some((item) => item.id === "reports"),
    ).toBe(false);
});

it("permits only the two existing authorized global-search sources", () => {
    expect(
        searchableResources(mockBootstrap).map((item) => item.resource),
    ).toEqual(["users", "audit"]);
    mockBootstrap.modules.users = false;
    expect(
        searchableResources(mockBootstrap).map((item) => item.resource),
    ).toEqual(["audit"]);
    mockBootstrap.features["api.enabled"] = false;
    expect(searchableResources(mockBootstrap)).toEqual([]);
});

it("uses server action gates independently for create screens and intersects combined gates", () => {
    mockBootstrap.modules.users = false;
    mockBootstrap.actions["users.create"] = true;
    const screen = render(
        <Access action="users.create">
            <Text>Create fixture</Text>
        </Access>,
    );
    expect(screen.getByText("Create fixture")).toBeTruthy();
    screen.rerender(
        <Access module="users" action="users.create">
            <Text>Create fixture</Text>
        </Access>,
    );
    expect(screen.queryByText("Create fixture")).toBeNull();
    mockBootstrap.actions["users.create"] = false;
    screen.rerender(
        <Access action="users.create">
            <Text>Create fixture</Text>
        </Access>,
    );
    expect(screen.queryByText("Create fixture")).toBeNull();
    screen.unmount();
});

it.each([
    ["d M Y", "04 Oct 2026, 19:30"],
    ["d/m/Y", "04/10/2026, 19:30"],
    ["m/d/Y", "10/04/2026, 19:30"],
] as const)(
    "formats %s in the existing actor timezone without changing the timestamp",
    (format, expected) => {
        const timestamp = "2026-10-05T02:30:00Z";
        expect(date(timestamp, "America/Los_Angeles", format)).toBe(expected);
        expect(timestamp).toBe("2026-10-05T02:30:00Z");
    },
);

it("follows the current reader, ignores an older provider cleanup and resets after current disposal", () => {
    const first = attachDatePreferences(() => ({
        timezone: "UTC",
        date_format: "m/d/Y",
    }));
    let format: "d/m/Y" | "d M Y" = "d/m/Y";
    const second = attachDatePreferences(() => ({
        timezone: "UTC",
        date_format: format,
    }));
    first();
    expect(date("2026-10-05T02:30:00Z")).toBe("05/10/2026, 02:30");
    format = "d M Y";
    expect(date("2026-10-05T02:30:00Z")).toBe("05 Oct 2026, 02:30");
    second();
    expect(date("2026-10-05T02:30:00Z")).toBe("05 Oct 2026, 02:30");
    expect(date("invalid")).toBe("\u2014");
    expect(date(null)).toBe("\u2014");
});

it("shows conflict refresh explicitly without dispatching any automatic write or retry", () => {
    const refresh = jest.fn();
    const screen = render(
        <ErrorState
            error={new ApiError(409, {}, "request-conflict")}
            retry={refresh}
        />,
    );
    expect(screen.getByText("This record changed")).toBeTruthy();
    expect(
        screen.getByText(`${t("supportId")}: request-conflict`),
    ).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    screen.unmount();
});

it("distinguishes maintenance from confirmed API-off and honors its retry delay", () => {
    jest.useFakeTimers();
    try {
        const retry = jest.fn(),
            logout = jest.fn();
        const screen = render(
            <AvailabilityState
                error={new ApiError(503, {}, null, undefined, 2)}
                retry={retry}
                logout={logout}
            />,
        );
        expect(
            screen.getByText("Service temporarily unavailable"),
        ).toBeTruthy();
        fireEvent.press(
            screen.getByRole("button", {
                name: t("retryWait", { seconds: 2 }),
            }),
        );
        expect(retry).not.toHaveBeenCalled();
        act(() => jest.advanceTimersByTime(2000));
        fireEvent.press(screen.getByRole("button", { name: "Retry" }));
        expect(retry).toHaveBeenCalledTimes(1);
        screen.rerender(
            <AvailabilityState apiDisabled retry={retry} logout={logout} />,
        );
        expect(
            screen.queryByText("Service temporarily unavailable"),
        ).toBeNull();
        fireEvent.press(screen.getByRole("button", { name: t("logout") }));
        expect(logout).toHaveBeenCalledTimes(1);
        screen.unmount();
    } finally {
        jest.useRealTimers();
    }
});

it("installs one theme-colored pull refresh control on the shared scroll screen", () => {
    const refresh = jest.fn();
    const screen = render(<Screen scroll refreshing onRefresh={refresh} />);
    const control = screen.UNSAFE_getByType(ScrollView).props.refreshControl;
    expect(control.props.refreshing).toBe(true);
    control.props.onRefresh();
    expect(refresh).toHaveBeenCalledTimes(1);
    screen.unmount();
});
it.each([429, 503])(
    "retains the absolute %s countdown when its error state remounts",
    (status) => {
        jest.useFakeTimers();
        try {
            const retry = jest.fn();
            const error = new ApiError(status, {}, null, undefined, 60);
            const screen = render(
                <View>
                    <ErrorState key="first" error={error} retry={retry} />
                </View>,
            );
            act(() => jest.advanceTimersByTime(50000));
            screen.rerender(
                <View>
                    <ErrorState key="remounted" error={error} retry={retry} />
                </View>,
            );
            expect(
                screen.getByRole("button", {
                    name: t("retryWait", { seconds: 10 }),
                }),
            ).toBeTruthy();
            act(() => jest.advanceTimersByTime(10000));
            fireEvent.press(screen.getByRole("button", { name: "Retry" }));
            expect(retry).toHaveBeenCalledTimes(1);
            screen.unmount();
        } finally {
            jest.useRealTimers();
        }
    },
);

it("keeps paginated rows unchanged on focus and reconnect until explicit refresh", async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
    });
    let generation = 1;
    const read = jest.fn(async () => ({
        data: [{ id: String(generation) }],
        current_page: 1,
        last_page: 1,
    }));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
        () =>
            usePages("activity", {}, read, true, {
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
            }),
        { wrapper },
    );
    try {
        await waitFor(() =>
            expect(hook.result.current.rows).toEqual([{ id: "1" }]),
        );
        generation = 2;
        await act(async () => {
            focusManager.setFocused(false);
            onlineManager.setOnline(false);
            focusManager.setFocused(true);
            onlineManager.setOnline(true);
            await Promise.resolve();
        });
        expect(read).toHaveBeenCalledTimes(1);
        expect(hook.result.current.rows).toEqual([{ id: "1" }]);
        await act(async () => {
            await hook.result.current.refetch();
        });
        await waitFor(() =>
            expect(hook.result.current.rows).toEqual([{ id: "2" }]),
        );
        expect(read).toHaveBeenCalledTimes(2);
    } finally {
        hook.unmount();
        client.clear();
        focusManager.setFocused(undefined);
        onlineManager.setOnline(true);
    }
});
