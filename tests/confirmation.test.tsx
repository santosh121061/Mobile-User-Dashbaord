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
});
it("rejects an already cancelled caller without opening or sending a request", async () => {
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
it("closes a pending confirmation when the caller leaves", async () => {
  const controller = new AbortController();
  callerSignal = controller.signal;
  const screen = render(view());
  fireEvent.press(screen.getByLabelText("Start test action"));
  expect(screen.queryByLabelText("Current password")).toBeNull();
  act(() => controller.abort());
  await waitFor(() => expect(completed).toBe(true));
  expect(outcome).toMatchObject({ name: "AbortError" });
  expect(mockScope.signal.aborted).toBe(true);
  expect(api.POST).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
  screen.unmount();
});
it("aborts an unmounted caller while its provider remains mounted", async () => {
  const screen = render(view());
  fireEvent.press(screen.getByLabelText("Start test action"));
  screen.rerender(<ConfirmationProvider />);
  await waitFor(() => expect(completed).toBe(true));
  expect(outcome).toMatchObject({ name: "AbortError" });
  expect(mockScope.signal.aborted).toBe(true);
  expect(api.POST).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
  screen.unmount();
});
it("does not dispatch a mutation after cancellation during fresh authorization checks", async () => {
  let finish!: () => void;
  mockRefresh.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  const controller = new AbortController();
  callerSignal = controller.signal;
  const screen = render(view());
  fireEvent.press(screen.getByLabelText("Start test action"));
  fireEvent.press(screen.getByTestId("confirm-action"));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  act(() => controller.abort());
  await waitFor(() => expect(completed).toBe(true));
  await act(async () => finish());
  expect(api.POST).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
  screen.unmount();
});
it("aborts an in-flight mutation when its caller leaves and ignores the late result", async () => {
  let finish!: (value: unknown) => void;
  action.mockReturnValueOnce(
    new Promise((done) => {
      finish = done;
    }),
  );
  const controller = new AbortController();
  callerSignal = controller.signal;
  const screen = render(view());
  fireEvent.press(screen.getByLabelText("Start test action"));
  fireEvent.press(screen.getByTestId("confirm-action"));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(action).toHaveBeenCalledWith(mockScope.signal);
  act(() => controller.abort());
  await waitFor(() => expect(completed).toBe(true));
  expect(mockScope.signal.aborted).toBe(true);
  await act(async () => finish("late-change"));
  expect(outcome).toMatchObject({ name: "AbortError" });
  expect(api.POST).not.toHaveBeenCalled();
  screen.unmount();
});
it("cancels an unconfirmed action without sending a credential or mutation", async () => {
  const screen = render(view());
  fireEvent.press(screen.getByLabelText("Start test action"));
  expect(screen.queryByLabelText("Current password")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(completed).toBe(true));
  expect(outcome).toMatchObject({ name: "AbortError" });
  expect(api.POST).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
  screen.unmount();
});
it.each(["locked", "signedOut", "unavailable"])(
  "aborts a delayed authorization check on %s without executing the action",
  async (phase) => {
    let finish!: () => void;
    mockRefresh.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.press(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    act(() => {
      mockPhase = phase;
      mockScope.cancel();
    });
    screen.rerender(view());
    await waitFor(() => expect(completed).toBe(true));
    await act(async () => finish());
    expect(mockScope.signal.aborted).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(api.POST).not.toHaveBeenCalled();
    screen.unmount();
  },
);
it.each(["Connection dropped after write", "MOBILE_REAUTH_REQUIRED"])(
  "does not replay a rejected mutation or request a ticket: %s",
  async (message) => {
    action.mockRejectedValue(new Error(message));
    const screen = render(view());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.press(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(completed).toBe(true));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(mockScope.signal);
    expect(api.POST).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ message });
    expect(screen.queryByLabelText("Current password")).toBeNull();
    screen.unmount();
  },
);
it("executes a confirmed mutation once without collecting or retaining a password", async () => {
  const screen = render(view());
  fireEvent.press(screen.getByLabelText("Start test action"));
  expect(screen.queryByLabelText("Current password")).toBeNull();
  fireEvent.press(screen.getByTestId("confirm-action"));
  await waitFor(() => expect(completed).toBe(true));
  expect(outcome).toBe("changed");
  expect(action).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledWith(mockScope.signal);
  expect(api.POST).not.toHaveBeenCalled();
  screen.unmount();
});
