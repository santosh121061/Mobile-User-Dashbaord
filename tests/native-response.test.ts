import { z } from "zod";
import { FetchResponse } from "../node_modules/expo/src/winter/fetch/FetchResponse";
import { api, attachSession, ApiError, unwrap } from "../src/api/client";
import { brandingSchema, envelope, sessionSchema } from "../src/api/runtime";
import { brandAssetUrl } from "../src/components/brand";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        environment: "preview",
        apiUrl: "https://up.knitinfotech.com/api",
      },
    },
  },
}));
jest.mock("../src/auth/session", () => ({ useSession: jest.fn() }));

// Exact anonymous configuration response supplied from the user's browser.
const browserConfig = {
  data: {
    schema_version: 1,
    features: {
      "account.recovery.enabled": true,
      "account.verification.enabled": true,
      "account.require_verified": false,
      "api.enabled": true,
    },
    branding: {
      name: "Knit Admin",
      revision:
        "7b66e4fd4597ee271701747e0f8c0f70080adfbc1e1c35dc9169eab84edd20ea",
      logo: "/branding/logo?v=7b66e4fd4597ee271701747e0f8c0f70080adfbc1e1c35dc9169eab84edd20ea",
      dark_logo:
        "/branding/dark_logo?v=7b66e4fd4597ee271701747e0f8c0f70080adfbc1e1c35dc9169eab84edd20ea",
      compact_logo:
        "/branding/compact_logo?v=7b66e4fd4597ee271701747e0f8c0f70080adfbc1e1c35dc9169eab84edd20ea",
      favicon:
        "/branding/favicon?v=7b66e4fd4597ee271701747e0f8c0f70080adfbc1e1c35dc9169eab84edd20ea",
    },
    version_policy: {
      enforced: false,
      status: "disabled",
      minimum: { android: null, ios: null },
      revision:
        "241e389f33f4f6f9fca90b3400ac72417829df67c6ddc9dc5f2faaeb8ac24fd8",
    },
  },
};

jest.mock("../node_modules/expo/src/winter/fetch/ExpoFetchModule", () => ({
  ExpoFetchModule: {
    // Only the native bridge is stubbed; the Expo JavaScript response class is real.
    NativeResponse: class {
      addListener() {
        return { remove: jest.fn() };
      }
    },
  },
}));

class FixtureResponse extends FetchResponse {
  constructor(
    private payload: unknown,
    private code = 200,
  ) {
    super(() => {});
  }
  override get status() {
    return this.code;
  }
  override get _rawHeaders(): [string, string][] {
    return [
      ["Content-Type", "application/json"],
      ["X-Request-Id", "native-fixture"],
    ];
  }
  override async text() {
    return JSON.stringify(this.payload);
  }
}

afterEach(() => jest.restoreAllMocks());

it("reads public configuration from Expo's actual native response class, which is not a global Response", async () => {
  attachSession(
    () => null,
    () => {},
    () => {},
  );
  const response = new FixtureResponse(browserConfig);
  expect(response).not.toBeInstanceOf(Response);
  const fetcher = jest.spyOn(global, "fetch").mockResolvedValue(response);
  const result = await api.GET("/v1/mobile/config");
  expect((fetcher.mock.calls[0]![0] as Request).url).toBe(
    "https://up.knitinfotech.com/api/v1/mobile/config",
  );
  for (const key of ["logo", "dark_logo", "compact_logo", "favicon"] as const) {
    expect(brandAssetUrl(browserConfig.data.branding[key])).toBe(
      "https://up.knitinfotech.com" + browserConfig.data.branding[key],
    );
  }
  expect(
    unwrap(
      result,
      envelope(
        z.object({
          features: z.record(z.string(), z.boolean()),
          branding: brandingSchema,
        }),
      ),
    ).data,
  ).toEqual({
    features: browserConfig.data.features,
    branding: browserConfig.data.branding,
  });
});

it("reads the top-level login session from an Expo native response", async () => {
  attachSession(
    () => null,
    () => {},
    () => {},
  );
  jest.spyOn(global, "fetch").mockResolvedValue(
    new FixtureResponse({
      access_token: "synthetic-native-session",
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }),
  );
  const result = await api.POST("/v1/auth/login", {
    body: {
      email: "fixture@example.test",
      password: "SyntheticPassword",
      device_name: "User Dashboard",
      client: "mobile",
    },
  });
  expect(unwrap(result, sessionSchema).access_token).toBe(
    "synthetic-native-session",
  );
});

it("keeps current-session expiry and structured errors with native responses", async () => {
  const expire = jest.fn();
  attachSession(
    () => "synthetic-native-session",
    expire,
    () => {},
  );
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new FixtureResponse({ code: "UNAUTHENTICATED" }, 401));
  const result = await api.GET("/v1/mobile/bootstrap");
  expect(expire).toHaveBeenCalledTimes(1);
  expect(() => unwrap(result, z.unknown())).toThrow(ApiError);
  expect(() => unwrap(result, z.unknown())).toThrow(
    expect.objectContaining({ status: 401, requestId: "native-fixture" }),
  );
});
