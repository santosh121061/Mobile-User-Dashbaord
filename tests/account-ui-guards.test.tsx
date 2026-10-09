import React from "react";
import {
    act,
    render,
    renderHook,
    waitFor,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { bootstrapSchema } from "../src/api/runtime";
import { ThemeProvider, useTheme } from "../src/theme";
import { useDiscard } from "../src/components/forms";
import { ExportButton } from "../src/features/exports";
import fixtures from "../api/fixtures.json";
import { usePreventRemove } from "expo-router/react-navigation";
let mockBootstrap: ReturnType<typeof bootstrapSchema.parse> | null;
let mockPhase = "ready";
jest.mock("../src/auth/session", () => ({
    useBootstrap: () => mockBootstrap,
    useSession: () => ({
        bootstrap: mockBootstrap,
        phase: mockPhase,
        captureWork: jest.fn(),
    }),
}));
jest.mock("expo-router", () => ({
    useNavigation: () => ({ dispatch: jest.fn() }),
    router: { push: jest.fn() },
}));
jest.mock("expo-router/react-navigation", () => ({
    usePreventRemove: jest.fn(),
}));
const wrapper = ({ children }: React.PropsWithChildren) => (
    <ThemeProvider>{children}</ThemeProvider>
);
beforeEach(() => {
    jest.clearAllMocks();
    mockPhase = "ready";
    mockBootstrap = bootstrapSchema.parse(fixtures.bootstrap.data);
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});
it("reconciles theme from each account and server snapshot instead of leaking a previous account override", async () => {
    mockBootstrap!.appearance.theme = "light";
    const hook = renderHook(useTheme, { wrapper });
    await waitFor(() => expect(hook.result.current.mode).toBe("light"));
    act(() => hook.result.current.setMode("dark"));
    expect(hook.result.current.mode).toBe("dark");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    mockBootstrap = {
        ...mockBootstrap!,
        account: { ...mockBootstrap!.account, id: "another-account" },
        appearance: { theme: "light" },
    };
    hook.rerender(undefined);
    expect(hook.result.current.mode).toBe("light");
    act(() => hook.result.current.setMode("dark"));
    mockBootstrap = { ...mockBootstrap!, appearance: { theme: "system" } };
    hook.rerender(undefined);
    expect(hook.result.current.mode).toBe("system");
    mockBootstrap = null;
    hook.rerender(undefined);
    expect(hook.result.current.mode).toBe("system");
    hook.unmount();
});
it.each(["locked", "signedOut", "loggingOut", "storageBlocked", "unavailable"])(
    "does not let a dirty form veto a security transition to %s",
    (phase) => {
        const hook = renderHook(() => useDiscard(true));
        expect(usePreventRemove).toHaveBeenLastCalledWith(
            true,
            expect.any(Function),
        );
        mockPhase = phase;
        hook.rerender(undefined);
        expect(usePreventRemove).toHaveBeenLastCalledWith(
            false,
            expect.any(Function),
        );
        hook.unmount();
    },
);
it.each(["roles", "audit"] as const)(
    "requires the independent %s.export grant instead of accepting view-only access",
    (resource) => {
        mockBootstrap!.actions[resource + ".view"] = true;
        mockBootstrap!.actions[resource + ".export"] = false;
        const screen = render(<ExportButton resource={resource} />);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        mockBootstrap = {
            ...mockBootstrap!,
            actions: {
                ...mockBootstrap!.actions,
                [resource + ".export"]: true,
            },
        };
        screen.rerender(<ExportButton resource={resource} />);
        expect(screen.getAllByRole("button")).toHaveLength(1);
        screen.unmount();
    },
);
