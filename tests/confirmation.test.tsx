import React from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import {
    ConfirmationProvider,
    useConfirmation,
} from "../src/auth/confirmation";
import { createPrivateWork, type PrivateWork } from "../src/auth/private-work";
import { api } from "../src/api/client";
let mockPhase = "ready";
let mockScope: PrivateWork;
const mockRefresh = jest.fn<Promise<void>, []>(async () => undefined);
jest.mock("../src/auth/session", () => ({
    useSession: () => ({
        phase: mockPhase,
        refresh: mockRefresh,
        captureWork: () => mockScope,
    }),
}));
jest.mock("../src/api/client", () => ({
    ...jest.requireActual("../src/api/client"),
    api: { POST: jest.fn() },
}));
const response = (data: unknown) => ({
    data,
    response: new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    }),
});
let action: jest.Mock, outcome: unknown, completed: boolean;
let callerSignal: AbortSignal | undefined;
function Consumer() {
    const perform = useConfirmation();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start test action"
            onPress={() => {
                void perform(
                    "POST",
                    "/api/v1/users/fixture/status",
                    action,
                    callerSignal,
                ).then(
                    (value) => {
                        completed = true;
                        outcome = value;
                    },
                    (failure) => {
                        completed = true;
                        outcome = failure;
                    },
                );
            }}
        >
            <Text>Start</Text>
        </Pressable>
    );
}
const view = () => (
    <ConfirmationProvider>
        <Consumer />
    </ConfirmationProvider>
);
// Initialize the native renderer separately from bounded cancellation assertions on cold Windows runs.
beforeAll(() => {
    const warm = render(view());
    warm.unmount();
}, 30000);
beforeEach(() => {
    jest.clearAllMocks();
    mockPhase = "ready";
    completed = false;
    outcome = null;
    callerSignal = undefined;
    mockRefresh.mockResolvedValue(undefined);
    mockScope = createPrivateWork(
        () => mockPhase === "ready",
        () => {},
    );
    action = jest.fn(async () => "changed");
    jest.mocked(api.POST).mockResolvedValue(
        response({ approval: "single-use-ticket" }) as never,
    );
});
it("rejects a caller cancelled before opening without capturing work or showing a password", async () => {
    const controller = new AbortController();
    controller.abort();
    callerSignal = controller.signal;
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    await waitFor(() => expect(completed).toBe(true));
    expect(outcome).toMatchObject({ name: "AbortError" });
    expect(mockScope.signal.aborted).toBe(false);
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(api.POST).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    screen.unmount();
});
it("closes a pending confirmation when the caller leaves and clears its password", async () => {
    const controller = new AbortController();
    callerSignal = controller.signal;
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.changeText(
        screen.getByLabelText("Current password"),
        "private-password",
    );
    act(() => controller.abort());
    await waitFor(() => expect(completed).toBe(true));
    expect(outcome).toMatchObject({ name: "AbortError" });
    expect(mockScope.signal.aborted).toBe(true);
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(api.POST).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    screen.unmount();
});
it("aborts a caller that unmounts without an explicit signal while its global provider remains mounted", async () => {
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.changeText(
        screen.getByLabelText("Current password"),
        "private-password",
    );
    screen.rerender(<ConfirmationProvider />);
    await waitFor(() => expect(completed).toBe(true));
    expect(outcome).toMatchObject({ name: "AbortError" });
    expect(mockScope.signal.aborted).toBe(true);
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(api.POST).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    screen.unmount();
});
it("does not dispatch approval after the caller cancels a delayed refresh", async () => {
    let finishRefresh!: () => void;
    mockRefresh.mockImplementationOnce(
        () =>
            new Promise<void>((done) => {
                finishRefresh = done;
            }),
    );
    const controller = new AbortController();
    callerSignal = controller.signal;
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.changeText(
        screen.getByLabelText("Current password"),
        "private-password",
    );
    fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    act(() => controller.abort());
    await waitFor(() => expect(completed).toBe(true));
    await act(async () => finishRefresh());
    expect(api.POST).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    screen.unmount();
});
it.each(["approval", "mutation"])(
    "aborts an in-flight %s request when its caller cancels without applying a late result",
    async (stage) => {
        let finish!: (value: unknown) => void;
        const deferred = new Promise((done) => {
            finish = done;
        });
        if (stage === "approval")
            jest.mocked(api.POST).mockReturnValueOnce(deferred as never);
        else action.mockReturnValueOnce(deferred);
        const controller = new AbortController();
        callerSignal = controller.signal;
        const screen = render(view());
        fireEvent.press(screen.getByLabelText("Start test action"));
        fireEvent.changeText(
            screen.getByLabelText("Current password"),
            "private-password",
        );
        fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
        await waitFor(() =>
            expect(
                stage === "approval" ? api.POST : action,
            ).toHaveBeenCalledTimes(1),
        );
        act(() => controller.abort());
        await waitFor(() => expect(completed).toBe(true));
        expect(outcome).toMatchObject({ name: "AbortError" });
        expect(mockScope.signal.aborted).toBe(true);
        await act(async () =>
            finish(
                stage === "approval"
                    ? response({ approval: "late-ticket" })
                    : "late-change",
            ),
        );
        expect(outcome).toMatchObject({ name: "AbortError" });
        expect(action).toHaveBeenCalledTimes(stage === "approval" ? 0 : 1);
        expect(screen.queryByLabelText("Current password")).toBeNull();
        screen.unmount();
    },
);
it("cancels an unconfirmed action without sending the password or mutation", async () => {
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.changeText(
        screen.getByLabelText("Current password"),
        "private-password",
    );
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(completed).toBe(true));
    expect(outcome).toMatchObject({ name: "AbortError" });
    expect(api.POST).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    screen.unmount();
});
it.each(["locked", "signedOut", "unavailable"])(
    "clears the password and aborts delayed confirmation on %s without executing the action",
    async (phase) => {
        let resolve!: (value: unknown) => void;
        jest.mocked(api.POST).mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done;
                }) as never,
        );
        const screen = render(view());
        fireEvent.press(screen.getByLabelText("Start test action"));
        fireEvent.changeText(
            screen.getByLabelText("Current password"),
            "private-password",
        );
        fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
        await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1));
        const request = jest.mocked(api.POST).mock.calls[0]![1] as unknown as {
            signal: AbortSignal;
        };
        expect(request.signal).toBe(mockScope.signal);
        expect(screen.getByLabelText("Current password").props.value).toBe("");
        act(() => {
            mockPhase = phase;
            mockScope.cancel();
        });
        screen.rerender(view());
        await waitFor(() => expect(completed).toBe(true));
        await act(async () => {
            resolve(response({ approval: "late-ticket" }));
        });
        expect(request.signal!.aborted).toBe(true);
        expect(action).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("Current password")).toBeNull();
        screen.unmount();
    },
);
it("executes one approved write with its abort signal and never replays an ambiguous failure", async () => {
    action.mockRejectedValue(new Error("Connection dropped after write"));
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.changeText(
        screen.getByLabelText("Current password"),
        "private-password",
    );
    fireEvent.press(screen.getByRole("button", { name: "Confirm action" }));
    await waitFor(() => expect(completed).toBe(true));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith("single-use-ticket", mockScope.signal);
    expect(api.POST).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Current password")).toBeNull();
    screen.unmount();
});
