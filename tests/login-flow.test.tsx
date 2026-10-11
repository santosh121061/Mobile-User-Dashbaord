import React from "react";
import { Image, Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { SessionProvider } from "../src/auth/session";
import AuthLayout from "../src/app/(auth)/_layout";
import { queryClient } from "../src/api/query";
import fixtures from "../api/fixtures.json";
import { t } from "../src/localization";
let mockAuthScreen: "login" | "forgot" = "login";
const mockRouterReplace = jest.fn();

jest.mock("expo-constants", () => {
  // Exercise the actual Request/Headers/Response polyfill installed by React Native.
  const nativeFetch = jest.requireActual("whatwg-fetch");
  global.Request = nativeFetch.Request;
  global.Headers = nativeFetch.Headers;
  global.Response = nativeFetch.Response;
  return {
    __esModule: true,
    default: {
      expoConfig: {
        version: "0.1.0",
        scheme: "userdashboard-dev",
        extra: {
          environment: "preview",
          apiUrl: "https://up.knitinfotech.com/api",
        },
      },
    },
  };
});
jest.mock("expo-router", () => {
  const react = jest.requireActual("react");
  return {
    Stack: () =>
      react.createElement(
        (mockAuthScreen === "forgot"
          ? jest.requireActual("../src/app/(auth)/forgot-password")
          : jest.requireActual("../src/app/(auth)/login")
        ).default,
      ),
    Redirect: ({ href }: { href: string }) =>
      react.createElement(
        jest.requireActual("react-native").Text,
        { testID: "auth-redirect" },
        href,
      ),
    useRouter: () => ({ push: jest.fn(), replace: mockRouterReplace }),
  };
});
jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0" }));
jest.mock("../src/storage/fence", () => ({
  activate: jest.fn(),
  revoke: jest.fn(),
  matches: jest.fn(() => true),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": "fixture-request",
    },
  });
const requests: Request[] = [];
let respond: (request: Request) => Promise<Response> | Response;
const normalResponse = (request: Request) => {
  switch (request.url) {
    case "https://up.knitinfotech.com/api/v1/mobile/config":
      return json(fixtures.configuration);
    case "https://up.knitinfotech.com/api/v1/auth/login":
      return json({
        token_type: "Bearer",
        access_token: "synthetic-session",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
    case "https://up.knitinfotech.com/api/v1/mobile/bootstrap":
      return json(fixtures.bootstrap);
    default:
      throw new Error("Unexpected fixture request");
  }
};
const open = async () => {
  const screen = render(
    <SessionProvider>
      <AuthLayout />
    </SessionProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("auth-email")).toBeTruthy());
  return screen;
};
const submit = (
  screen: Awaited<ReturnType<typeof open>>,
  email = "fixture@example.test",
) => {
  fireEvent.changeText(screen.getByTestId("auth-email"), email);
  fireEvent.changeText(
    screen.getByTestId("auth-password"),
    "SyntheticPassword",
  );
  fireEvent.press(screen.getByTestId("sign-in"));
};
beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  mockAuthScreen = "login";
  jest.replaceProperty(Platform, "OS", "android");
  requests.length = 0;
  respond = normalResponse;
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    requests.push(request);
    return respond(request);
  });
});
afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});
it("shows a privacy-preserving recovery success state and clears a previous request failure", async () => {
  mockAuthScreen = "forgot";
  let recoveryRequests = 0;
  respond = (request) =>
    request.url.endsWith("/auth/forgot-password")
      ? json(
          ++recoveryRequests === 1
            ? { message: "Internal recovery failure" }
            : { message: "Reset link sent" },
          recoveryRequests === 1 ? 500 : 200,
        )
      : normalResponse(request);
  const screen = render(
    <SessionProvider>
      <AuthLayout />
    </SessionProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Email address")).toBeTruthy(),
  );
  fireEvent.changeText(
    screen.getByLabelText("Email address"),
    "fixture@example.test",
  );
  fireEvent.press(screen.getByRole("button", { name: "Send reset link" }));
  await waitFor(() =>
    expect(screen.getAllByText(t("serverError")).length).toBeGreaterThan(0),
  );
  fireEvent.press(screen.getByRole("button", { name: "Send reset link" }));
  await waitFor(() =>
    expect(screen.getByText("Check your email")).toBeTruthy(),
  );
  expect(screen.getByText(t("recoverySent"))).toBeTruthy();
  expect(screen.queryAllByText(t("serverError"))).toHaveLength(0);
  expect(screen.queryByText("Reset link sent")).toBeNull();
  expect(screen.queryByLabelText("Email address")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Send another link" }));
  expect(screen.getByLabelText("Email address").props.value).toBe(
    "fixture@example.test",
  );
  expect(recoveryRequests).toBe(2);
  fireEvent.press(screen.getByRole("button", { name: "Send reset link" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Back to sign in" }),
    ).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
  expect(mockRouterReplace).toHaveBeenCalledWith("/(auth)/login");
});

it("loads backend branding anonymously, then sends the exact mobile login contract and bearer bootstrap", async () => {
  const screen = await open();
  expect(
    screen.UNSAFE_getAllByType(Image).map((image) => image.props.source.uri),
  ).toEqual([
    "https://up.knitinfotech.com" +
      fixtures.configuration.data.branding.compact_logo,
  ]);
  expect(requests[0]!.headers.get("Authorization")).toBeNull();
  submit(screen, "  fixture@example.test  ");
  await waitFor(() =>
    expect(screen.getByTestId("auth-redirect").props.children).toBe(
      "/(app)/(tabs)",
    ),
  );
  const login = requests.find((request) =>
    request.url.endsWith("/auth/login"),
  )!;
  expect(login.method).toBe("POST");
  expect(login.headers.get("Accept")).toBe("application/json");
  expect(login.headers.get("Content-Type")).toBe("application/json");
  expect(login.headers.get("X-App-Platform")).toBe("android");
  expect(login.headers.get("X-App-Version")).toMatch(/^\d+\.\d+\.\d+$/);
  expect(await login.json()).toEqual({
    email: "fixture@example.test",
    password: "SyntheticPassword",
    device_name: "User Dashboard",
    client: "mobile",
  });
  expect(
    requests
      .find((request) => request.url.endsWith("/mobile/bootstrap"))!
      .headers.get("Authorization"),
  ).toBe("Bearer synthetic-session");
  screen.unmount();
});

it("explains required fields and invalid email locally without sending a login request", async () => {
  const screen = await open();
  fireEvent.press(screen.getByTestId("sign-in"));
  await waitFor(() =>
    expect(screen.getByText("Enter your email address.")).toBeTruthy(),
  );
  expect(screen.getByText("Enter your password.")).toBeTruthy();
  submit(screen, "invalid-address");
  await waitFor(() =>
    expect(
      screen.getByText("Enter a valid email address, such as you@company.com."),
    ).toBeTruthy(),
  );
  expect(
    requests.filter((request) => request.url.endsWith("/auth/login")),
  ).toHaveLength(0);
  screen.unmount();
});

it("forwards an existing short password without imposing reset-password complexity rules", async () => {
  const screen = await open();
  fireEvent.changeText(
    screen.getByTestId("auth-email"),
    "fixture@example.test",
  );
  fireEvent.changeText(screen.getByTestId("auth-password"), "p");
  fireEvent.press(screen.getByTestId("sign-in"));
  await waitFor(() => expect(screen.getByTestId("auth-redirect")).toBeTruthy());
  const request = requests.find((request) =>
    request.url.endsWith("/auth/login"),
  )!;
  expect((await request.json()).password).toBe("p");
  screen.unmount();
});

it.each([
  [
    422,
    "The supplied credentials could not be authenticated.",
    "Email or password is incorrect",
    false,
  ],
  [
    403,
    "Verify your email before signing in.",
    "Verify your email to sign in",
    true,
  ],
  [403, "Unexpected private policy response", "Sign-in isn’t allowed", false],
] as const)(
  "handles Laravel %s login responses with safe actionable feedback",
  async (status, message, title, verify) => {
    respond = (request) =>
      request.url.endsWith("/auth/login")
        ? json(
            {
              message,
              ...(status === 422 ? { errors: { email: [message] } } : {}),
            },
            status,
          )
        : normalResponse(request);
    const screen = await open();
    submit(screen);
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.getByTestId("auth-email").props.value).toBe(
      "fixture@example.test",
    );
    expect(screen.getByTestId("auth-password").props.value).toBe(
      "SyntheticPassword",
    );
    expect(!!screen.queryByRole("button", { name: t("verification") })).toBe(
      verify,
    );
    expect(screen.queryByText("Unexpected private policy response")).toBeNull();
    expect(
      requests.filter((request) => request.url.endsWith("/auth/login")),
    ).toHaveLength(1);
    screen.unmount();
  },
);

it.each(["validation", "network"])(
  "preserves the form and displays a %s failure after asynchronous credential cleanup",
  async (failure) => {
    const screen = await open();
    let finishCleanup!: () => void;
    jest.mocked(SecureStore.deleteItemAsync).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    let finishRequest!: (response: Response) => void;
    let rejectRequest!: (error: Error) => void;
    respond = (request) =>
      request.url.endsWith("/auth/login")
        ? new Promise<Response>((resolve, reject) => {
            finishRequest = resolve;
            rejectRequest = reject;
          })
        : normalResponse(request);
    submit(screen);
    await waitFor(() => expect(finishCleanup).toBeDefined());
    expect(screen.getByTestId("auth-email").props.value).toBe(
      "fixture@example.test",
    );
    expect(screen.getByTestId("sign-in").props.accessibilityState.busy).toBe(
      true,
    );
    await act(async () => finishCleanup());
    await waitFor(() => expect(finishRequest).toBeDefined());
    expect(screen.getByTestId("auth-password").props.value).toBe(
      "SyntheticPassword",
    );
    await act(async () => {
      if (failure === "network")
        rejectRequest(new TypeError("Fixture connection failed"));
      else
        finishRequest(
          json({ errors: { email: ["Fixture login rejected"] } }, 422),
        );
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          failure === "network"
            ? "Couldn’t connect"
            : "Check your email address.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId("sign-in").props.accessibilityState.busy).toBe(
      false,
    );
    expect(
      requests.filter((request) => request.url.endsWith("/auth/login")),
    ).toHaveLength(1);
    screen.unmount();
  },
);

it("shows a public configuration failure and retries to replace Workspace with backend branding", async () => {
  respond = () => {
    throw new TypeError("Fixture offline");
  };
  const screen = await open();
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  expect(screen.getByText(t("connection"))).toBeTruthy();
  respond = normalResponse;
  fireEvent.press(screen.getByRole("button", { name: t("retry") }));
  await waitFor(() =>
    expect(
      screen.UNSAFE_getAllByType(Image).map((image) => image.props.source.uri),
    ).toEqual([
      "https://up.knitinfotech.com" +
        fixtures.configuration.data.branding.compact_logo,
    ]),
  );
  expect(screen.queryByText(t("connection"))).toBeNull();
  expect(requests).toHaveLength(2);
  screen.unmount();
});

it.each(["html", "schema"])(
  "identifies an invalid %s configuration response without blaming connectivity",
  async (format) => {
    respond = () =>
      format === "html"
        ? new Response("<html>Fixture gateway page</html>", {
            headers: { "Content-Type": "text/html" },
          })
        : json({
            data: {
              features: { "api.enabled": true },
              branding: { name: "Incomplete fixture" },
            },
          });
    const screen = await open();
    expect(screen.getByText(t("invalidResponse"))).toBeTruthy();
    expect(screen.queryByText(t("connection"))).toBeNull();
    screen.unmount();
  },
);

it("shows a bootstrap failure after successful login instead of silently returning to the form", async () => {
  respond = (request) =>
    request.url.endsWith("/mobile/bootstrap")
      ? json({ code: "MOBILE_UPDATE_REQUIRED" }, 426)
      : normalResponse(request);
  const screen = await open();
  submit(screen);
  await waitFor(() =>
    expect(screen.getByText(t("updateRequired"))).toBeTruthy(),
  );
  expect(screen.getByText(/fixture-request/)).toBeTruthy();
  expect(screen.queryByTestId("auth-redirect")).toBeNull();
  expect(
    requests.filter((request) => request.url.endsWith("/auth/login")),
  ).toHaveLength(1);
  screen.unmount();
});

it("ends the busy state and shows connection feedback when login reaches its request timeout", async () => {
  const screen = await open();
  jest.useFakeTimers();
  try {
    respond = (request) =>
      request.url.endsWith("/auth/login")
        ? new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener("abort", () =>
              reject(new Error("Fixture request aborted")),
            );
          })
        : normalResponse(request);
    submit(screen);
    await waitFor(() =>
      expect(
        requests.some((request) => request.url.endsWith("/auth/login")),
      ).toBe(true),
    );
    expect(screen.getByTestId("sign-in").props.accessibilityState.busy).toBe(
      true,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15000);
    });
    expect(screen.getByText("Sign-in took too long")).toBeTruthy();
    expect(screen.getByTestId("sign-in").props.accessibilityState.busy).toBe(
      false,
    );
    expect(
      requests.find((request) => request.url.endsWith("/auth/login"))!.signal
        .aborted,
    ).toBe(true);
  } finally {
    screen.unmount();
    jest.useRealTimers();
  }
});
