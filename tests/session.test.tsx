import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "../src/api/client";
import { SessionProvider, useSession } from "../src/auth/session";
import { queryClient } from "../src/api/query";
import fixtures from "../api/fixtures.json";
jest.mock("../src/api/client", () => ({
  ...jest.requireActual("../src/api/client"),
  api: { GET: jest.fn(), POST: jest.fn(), DELETE: jest.fn() },
  attachSession: jest.fn(() => () => true),
  revokeCurrentSession: jest.fn(async () => {
    throw new Error("Offline");
  }),
}));
jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock("../src/storage/fence", () => ({
  activate: jest.fn(),
  revoke: jest.fn(),
  matches: jest.fn(() => true),
}));
jest.mock("expo-local-authentication", () => ({
  authenticateAsync: jest.fn(async () => ({ success: true })),
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
}));
const response = (data: unknown) => ({
  data,
  response: { ok: true, status: 200 } as Response,
});
const wrapper = ({ children }: React.PropsWithChildren) => (
  <SessionProvider>{children}</SessionProvider>
);
describe("Native credential and local lock boundaries", () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    jest
      .mocked(api.GET)
      .mockImplementation(
        async (path) =>
          response(
            path === "/v1/mobile/config"
              ? { data: { features: { "api.enabled": true } } }
              : fixtures.bootstrap,
          ) as never,
      );
    jest.mocked(api.POST).mockResolvedValue(
      response({
        access_token: "synthetic-session",
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }) as never,
    );
    jest.mocked(api.DELETE).mockRejectedValue(new Error("Offline"));
  });
  afterEach(() => queryClient.clear());
  it("keeps a restored credential behind local unlock before any private bootstrap request", async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) =>
      key.endsWith(".session")
        ? JSON.stringify({
            token: "restored",
            nonce: "fixture-nonce",
            expires: new Date(Date.now() + 3600000).toISOString(),
          })
        : key.endsWith(".biometric")
          ? "true"
          : null,
    );
    const { result, unmount } = renderHook(useSession, { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("locked"));
    expect(
      jest
        .mocked(api.GET)
        .mock.calls.some(
          (call) =>
            (call as unknown as readonly unknown[])[0] ===
            "/v1/mobile/bootstrap",
        ),
    ).toBe(false);
    expect(result.current.bootstrap).toBeNull();
    await act(async () => {
      expect(await result.current.unlock()).toBe(true);
    });
    expect(result.current.phase).toBe("ready");
    unmount();
  });
  it("always clears credentials and private queries when API-off/offline logout cannot revoke remotely", async () => {
    const { result, unmount } = renderHook(useSession, { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("signedOut"));
    await act(async () => {
      await result.current.signIn("fixture@example.test", "SyntheticPassword");
    });
    expect(result.current.phase).toBe("ready");
    queryClient.setQueryData(["private-user"], { name: "private" });
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.phase).toBe("signedOut");
    expect(result.current.bootstrap).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      expect.stringContaining(".session"),
    );
    unmount();
  });
});
