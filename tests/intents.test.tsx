import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { parseIntent, permitsIntent } from "../src/utils/links";
import {
  currentIntent,
  discardIntent,
  receiveIntent,
  takeResetNotice,
} from "../src/auth/intents";
import ResetPassword from "../src/app/(auth)/reset-password";
import { api } from "../src/api/client";
const mockReplace = jest.fn();
let mockFeatures: Record<string, boolean>;
const mockLogout = jest.fn<Promise<void>, []>(async () => undefined);
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  Redirect: () => null,
}));
jest.mock("../src/auth/session", () => ({
  useSession: () => ({ features: mockFeatures, logout: mockLogout }),
}));
jest.mock("../src/api/client", () => ({
  ...jest.requireActual("../src/api/client"),
  api: { POST: jest.fn() },
}));
const base = "https://dashboard.example.test/api";
const token = "a".repeat(64);
const link = `${base.replace(/\/api$/, "")}/reset-password/${token}?email=account%40example.test`;
const response = (data: unknown) => ({
  data,
  response: new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  }),
});
// Native input/font initialization can be slow on a cold Windows filesystem.
beforeAll(() => {
  mockFeatures = { "api.enabled": true, "account.recovery.enabled": true };
  receiveIntent(link, "userdashboard-dev", base);
  const warm = render(<ResetPassword />);
  warm.unmount();
}, 30000);
beforeEach(() => {
  const previous = currentIntent();
  if (previous) discardIntent(previous);
  takeResetNotice();
  jest.clearAllMocks();
  mockFeatures = { "api.enabled": true, "account.recovery.enabled": true };
  jest
    .mocked(api.POST)
    .mockResolvedValue(
      response({ message: "Password reset. Sign in again." }) as never,
    );
});
it.each([
  "https://evil.example.test/users/2",
  `https://evil.example.test/reset-password/${token}?email=a%40example.test`,
  `${base}/users/2`,
  "/users/../profile",
  "/users/%2e%2e/profile",
  "/users/%2fprofile",
  "/users/2#fragment",
  "/users/2?token=private",
  `https://dashboard.example.test/reset-password/${token}?email=a%40example.test&email=b%40example.test`,
  `https://dashboard.example.test/reset-password/${token}?email=a%40example.test&extra=1`,
  "userdashboard-dev://settings",
])("rejects untrusted or malformed intent %s", (value) =>
  expect(parseIntent(value, "userdashboard-dev", base)).toBeNull(),
);
it("accepts the exact trusted reset route without exposing its secret to router parameters", () => {
  expect(parseIntent(link, "userdashboard-dev", base)).toEqual({
    kind: "reset",
    email: "account@example.test",
    token,
  });
  expect(receiveIntent(link, "userdashboard-dev", base)).toBe(
    "/(auth)/reset-password",
  );
  expect(
    receiveIntent(
      `userdashboard-dev://reset-password/${token}?email=account%40example.test`,
      "userdashboard-dev",
      base,
    ),
  ).toBe("/(auth)/reset-password");
});
it("accepts only unexpired exact signed verification routes on the configured website", () => {
  const now = 1791489600000;
  const verification = `https://dashboard.example.test/email/verify/2/${"b".repeat(40)}?expires=${Math.floor(now / 1000) + 3600}&signature=${"c".repeat(64)}`;
  expect(parseIntent(verification, "userdashboard-dev", base, now)).toEqual({
    kind: "verify",
    url: verification,
  });
  expect(
    parseIntent(verification, "userdashboard-dev", base, now + 3600000),
  ).toBeNull();
  expect(
    parseIntent(
      verification.replace(
        "https://dashboard.example.test/",
        "userdashboard-dev://",
      ),
      "userdashboard-dev",
      base,
      now,
    ),
  ).toBeNull();
});
it("keeps a single safe record intent and cannot clear a newer intent using an older callback", () => {
  expect(
    receiveIntent("userdashboard-dev://users/2", "userdashboard-dev", base),
  ).toBe("/intent");
  const old = currentIntent()!;
  receiveIntent("/profile", "userdashboard-dev", base);
  discardIntent(old);
  expect(currentIntent()).toEqual({ kind: "record", route: "/profile" });
  receiveIntent("https://evil.example.test/users/2", "userdashboard-dev", base);
  expect(currentIntent()).toBeNull();
});
it("uses the refreshed server module/feature snapshot for record navigation", () => {
  const snapshot = {
    modules: { users: true, notifications: true, activity: true },
    features: {
      "api.enabled": true,
      "notifications.in_app.enabled": false,
      "audit.capture.enabled": false,
    },
  };
  expect(permitsIntent("/users/2", snapshot)).toBe(true);
  expect(permitsIntent("/notifications", snapshot)).toBe(false);
  expect(permitsIntent("/activity/2", snapshot)).toBe(false);
  snapshot.modules.users = false;
  expect(permitsIntent("/users/2", snapshot)).toBe(false);
  snapshot.modules.users = true;
  snapshot.features["api.enabled"] = false;
  expect(permitsIntent("/users/2", snapshot)).toBe(false);
});
const fill = (screen: ReturnType<typeof render>) => {
  fireEvent.changeText(
    screen.getByLabelText("New password"),
    "New!Password2026",
  );
  fireEvent.changeText(
    screen.getByLabelText("Confirm new password"),
    "New!Password2026",
  );
  fireEvent.press(screen.getByRole("button", { name: "Reset password" }));
};
it("sends the existing reset API once, clears local authentication, and returns to sign-in without automatic login", async () => {
  receiveIntent(link, "userdashboard-dev", base);
  const screen = render(<ResetPassword />);
  fill(screen);
  await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  expect(api.POST).toHaveBeenCalledTimes(1);
  const [route, options] = jest.mocked(api.POST).mock.calls[0] as unknown as [
    string,
    unknown,
  ];
  expect(route).toBe("/v1/auth/reset-password");
  expect(options).toMatchObject({
    body: {
      email: "account@example.test",
      token,
      password: "New!Password2026",
      password_confirmation: "New!Password2026",
    },
  });
  expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  expect(currentIntent()).toBeNull();
  expect(takeResetNotice()).toBe(true);
  screen.unmount();
});
it.each(["unmount", "disable"])(
  "aborts a delayed reset on %s and ignores its late response",
  async (reason) => {
    let finish!: (value: unknown) => void;
    jest.mocked(api.POST).mockReturnValueOnce(
      new Promise((done) => {
        finish = done;
      }) as never,
    );
    receiveIntent(link, "userdashboard-dev", base);
    const screen = render(<ResetPassword />);
    fill(screen);
    await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1));
    const options = jest.mocked(api.POST).mock.calls[0]![1] as unknown as {
      signal: AbortSignal;
    };
    if (reason === "unmount") screen.unmount();
    else {
      mockFeatures = {
        ...mockFeatures,
        "account.recovery.enabled": false,
      };
      screen.rerender(<ResetPassword />);
    }
    expect(options.signal.aborted).toBe(true);
    await act(async () => finish(response({ message: "Late reset result" })));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(takeResetNotice()).toBe(false);
    if (reason !== "unmount") screen.unmount();
  },
);
