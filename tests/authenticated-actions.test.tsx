import React from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  AuthenticatedActionProvider,
  useAuthenticatedAction,
} from "../src/auth/authenticated-actions";
import { createPrivateWork, type PrivateWork } from "../src/auth/private-work";
import { api, ApiError } from "../src/api/client";
let mockSessionPhase = "ready";
let mockWorkScope: PrivateWork;
const mockSessionRefresh = jest.fn<Promise<void>, []>(async () => undefined);
jest.mock("../src/auth/session", () => ({
  useSession: () => ({
    phase: mockSessionPhase,
    refresh: mockSessionRefresh,
    captureWork: () => mockWorkScope,
  }),
}));
jest.mock("../src/api/client", () => ({
  ...jest.requireActual("../src/api/client"),
  api: { POST: jest.fn() },
}));
let mockMutation: jest.Mock, actionResult: unknown, actionSettled: boolean;
let callerAbortSignal: AbortSignal | undefined;
let requiresConfirmation: boolean | undefined = true;
let mutationMethod: "POST" | "PUT" | "PATCH" | "DELETE" = "POST";
function ActionConsumer() {
  const runAction = useAuthenticatedAction();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start test action"
      onPress={() => {
        void runAction(
          mutationMethod,
          "/api/v1/users/fixture/status",
          mockMutation,
          callerAbortSignal,
          requiresConfirmation,
        ).then(
          (value) => {
            actionSettled = true;
            actionResult = value;
          },
          (failure) => {
            actionSettled = true;
            actionResult = failure;
          },
        );
      }}
    >
      <Text>Start</Text>
    </Pressable>
  );
}
const actionProviderTree = () => (
  <AuthenticatedActionProvider>
    <ActionConsumer />
  </AuthenticatedActionProvider>
);
// Initialize the native renderer separately from bounded cancellation assertions on cold Windows runs.
beforeAll(() => {
  const warmupRender = render(actionProviderTree());
  warmupRender.unmount();
}, 30000);
beforeEach(() => {
  jest.clearAllMocks();
  mockSessionPhase = "ready";
  actionSettled = false;
  actionResult = null;
  callerAbortSignal = undefined;
  requiresConfirmation = true;
  mutationMethod = "POST";
  mockSessionRefresh.mockResolvedValue(undefined);
  mockWorkScope = createPrivateWork(
    () => mockSessionPhase === "ready",
    () => {},
  );
  mockMutation = jest.fn(async () => "changed");
});
it("rejects an already cancelled caller without opening or sending a request", async () => {
  const controller = new AbortController();
  controller.abort();
  callerAbortSignal = controller.signal;
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  await waitFor(() => expect(actionSettled).toBe(true));
  expect(actionResult).toMatchObject({ name: "AbortError" });
  expect(mockWorkScope.signal.aborted).toBe(false);
  expect(screen.queryByLabelText("Current password")).toBeNull();
  expect(api.POST).not.toHaveBeenCalled();
  expect(mockMutation).not.toHaveBeenCalled();
  screen.unmount();
});
it("closes a pending confirmation when the caller leaves", async () => {
  const controller = new AbortController();
  callerAbortSignal = controller.signal;
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  expect(screen.queryByLabelText("Current password")).toBeNull();
  act(() => controller.abort());
  await waitFor(() => expect(actionSettled).toBe(true));
  expect(actionResult).toMatchObject({ name: "AbortError" });
  expect(mockWorkScope.signal.aborted).toBe(true);
  expect(api.POST).not.toHaveBeenCalled();
  expect(mockMutation).not.toHaveBeenCalled();
  screen.unmount();
});
it("aborts an unmounted caller while its provider remains mounted", async () => {
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  screen.rerender(<AuthenticatedActionProvider />);
  await waitFor(() => expect(actionSettled).toBe(true));
  expect(actionResult).toMatchObject({ name: "AbortError" });
  expect(mockWorkScope.signal.aborted).toBe(true);
  expect(api.POST).not.toHaveBeenCalled();
  expect(mockMutation).not.toHaveBeenCalled();
  screen.unmount();
});
it("does not dispatch a mutation after cancellation during fresh authorization checks", async () => {
  let finish!: () => void;
  mockSessionRefresh.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  const controller = new AbortController();
  callerAbortSignal = controller.signal;
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  fireEvent.press(screen.getByTestId("confirm-action"));
  await waitFor(() => expect(mockSessionRefresh).toHaveBeenCalledTimes(1));
  act(() => controller.abort());
  await waitFor(() => expect(actionSettled).toBe(true));
  await act(async () => finish());
  expect(api.POST).not.toHaveBeenCalled();
  expect(mockMutation).not.toHaveBeenCalled();
  screen.unmount();
});
it("aborts an in-flight mutation when its caller leaves and ignores the late result", async () => {
  let finish!: (value: unknown) => void;
  mockMutation.mockReturnValueOnce(
    new Promise((done) => {
      finish = done;
    }),
  );
  const controller = new AbortController();
  callerAbortSignal = controller.signal;
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  fireEvent.press(screen.getByTestId("confirm-action"));
  await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
  expect(mockMutation).toHaveBeenCalledWith(mockWorkScope.signal);
  act(() => controller.abort());
  await waitFor(() => expect(actionSettled).toBe(true));
  expect(mockWorkScope.signal.aborted).toBe(true);
  await act(async () => finish("late-change"));
  expect(actionResult).toMatchObject({ name: "AbortError" });
  expect(api.POST).not.toHaveBeenCalled();
  screen.unmount();
});
it("cancels an unconfirmed action without sending a credential or mutation", async () => {
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  expect(screen.queryByLabelText("Current password")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(actionSettled).toBe(true));
  expect(actionResult).toMatchObject({ name: "AbortError" });
  expect(api.POST).not.toHaveBeenCalled();
  expect(mockMutation).not.toHaveBeenCalled();
  screen.unmount();
});
it.each(["locked", "signedOut", "unavailable"])(
  "aborts a delayed authorization check on %s without executing the action",
  async (phase) => {
    let finish!: () => void;
    mockSessionRefresh.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    const screen = render(actionProviderTree());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.press(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(mockSessionRefresh).toHaveBeenCalledTimes(1));
    act(() => {
      mockSessionPhase = phase;
      mockWorkScope.cancel();
    });
    screen.rerender(actionProviderTree());
    await waitFor(() => expect(actionSettled).toBe(true));
    await act(async () => finish());
    expect(mockWorkScope.signal.aborted).toBe(true);
    expect(mockMutation).not.toHaveBeenCalled();
    expect(api.POST).not.toHaveBeenCalled();
    screen.unmount();
  },
);
it.each(["Connection dropped after write", "MOBILE_REAUTH_REQUIRED"])(
  "does not replay a rejected mutation or request a ticket: %s",
  async (message) => {
    mockMutation.mockRejectedValue(new Error(message));
    const screen = render(actionProviderTree());
    fireEvent.press(screen.getByLabelText("Start test action"));
    fireEvent.press(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(actionSettled).toBe(true));
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockMutation).toHaveBeenCalledWith(mockWorkScope.signal);
    expect(api.POST).not.toHaveBeenCalled();
    expect(actionResult).toMatchObject({ message });
    expect(screen.queryByLabelText("Current password")).toBeNull();
    screen.unmount();
  },
);
it("executes a confirmed mutation once without collecting or retaining a password", async () => {
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  expect(screen.queryByLabelText("Current password")).toBeNull();
  fireEvent.press(screen.getByTestId("confirm-action"));
  await waitFor(() => expect(actionSettled).toBe(true));
  expect(actionResult).toBe("changed");
  expect(mockMutation).toHaveBeenCalledTimes(1);
  expect(mockMutation).toHaveBeenCalledWith(mockWorkScope.signal);
  expect(api.POST).not.toHaveBeenCalled();
  screen.unmount();
});

it.each(["POST", "PUT", "PATCH"] as const)(
  "executes a routine %s save directly without confirmation, credentials or a bootstrap request",
  async (verb) => {
    mutationMethod = verb;
    requiresConfirmation = undefined;
    const screen = render(actionProviderTree());
    fireEvent.press(screen.getByLabelText("Start test action"));
    await waitFor(() => expect(actionSettled).toBe(true));
    expect(actionResult).toBe("changed");
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockSessionRefresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-action")).toBeNull();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(api.POST).not.toHaveBeenCalled();
  },
);
it.each([422, 401, 403])(
  "returns a routine save's %s failure without replay or password verification",
  async (status) => {
    requiresConfirmation = false;
    const failure = new ApiError(
      status,
      status === 422 ? { name: ["Name is required"] } : {},
      null,
    );
    mockMutation.mockRejectedValueOnce(failure);
    const screen = render(actionProviderTree());
    fireEvent.press(screen.getByLabelText("Start test action"));
    await waitFor(() => expect(actionSettled).toBe(true));
    expect(actionResult).toBe(failure);
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockSessionRefresh).not.toHaveBeenCalled();
    expect(api.POST).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-action")).toBeNull();
    expect(screen.queryByLabelText("Current password")).toBeNull();
  },
);
it("aborts a direct save on caller departure and suppresses its late success", async () => {
  requiresConfirmation = false;
  let finish!: (value: unknown) => void;
  mockMutation.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const controller = new AbortController();
  callerAbortSignal = controller.signal;
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
  act(() => controller.abort());
  await waitFor(() => expect(actionSettled).toBe(true));
  await act(async () => finish("late success"));
  expect(actionResult).toMatchObject({ name: "AbortError" });
  expect(mockWorkScope.signal.aborted).toBe(true);
});

it("keeps default deletion consent non-password and dispatches only after confirmation", async () => {
  mutationMethod = "DELETE";
  requiresConfirmation = undefined;
  const screen = render(actionProviderTree());
  fireEvent.press(screen.getByLabelText("Start test action"));
  expect(screen.getByTestId("confirm-action")).toBeTruthy();
  expect(screen.queryByLabelText("Current password")).toBeNull();
  expect(mockMutation).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("confirm-action"));
  await waitFor(() => expect(actionSettled).toBe(true));
  expect(mockMutation).toHaveBeenCalledTimes(1);
});
