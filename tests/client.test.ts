import {
  api,
  attachSession,
  check,
  ApiError,
  ApiTransportError,
  retryAfterSeconds,
} from "../src/api/client";
describe("Session-bound API responses", () => {
  let credential: string | null;
  const expire = jest.fn();
  const refresh = jest.fn();
  beforeEach(() => {
    credential = "first-session";
    expire.mockClear();
    refresh.mockClear();
    attachSession(() => credential, expire, refresh);
  });
  afterEach(() => jest.restoreAllMocks());
  it("does not report a Request construction error as a network failure or dispatch it", async () => {
    jest.useFakeTimers();
    try {
      const failure = new TypeError("Fixture Request polyfill failure");
      const fetcher = jest.spyOn(global, "fetch");
      jest.spyOn(global, "Request").mockImplementation(() => {
        throw failure;
      });
      await expect(api.GET("/v1/mobile/config")).rejects.toBe(failure);
      expect(fetcher).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  it.each([
    new Error("javax.net.ssl.SSLHandshakeException: protocol_version"),
    {
      message: "fetch failed",
      cause: { code: "EPROTO", message: "TLS alert 70" },
    },
    new Error(
      "java.security.cert.CertPathValidatorException: Trust anchor unavailable",
    ),
  ])(
    "classifies a dispatched TLS failure without weakening or replaying the request",
    async (failure) => {
      const fetcher = jest.spyOn(global, "fetch").mockRejectedValue(failure);
      await expect(api.GET("/v1/mobile/config")).rejects.toMatchObject({
        reason: "tls",
        cause: failure,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps an ordinary dispatched connectivity failure distinct from TLS", async () => {
    jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new TypeError("Network request failed"));
    await expect(api.GET("/v1/mobile/config")).rejects.toEqual(
      expect.objectContaining({ reason: "network" }),
    );
    await expect(api.GET("/v1/mobile/config")).rejects.toBeInstanceOf(
      ApiTransportError,
    );
  });
  it("does not let a delayed 401 from a previous account wipe the new session", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = jest.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const pending = api.GET("/v1/profile");
    while (!fetcher.mock.calls.length) await Promise.resolve();
    expect(
      new Headers((fetcher.mock.calls[0]![0] as Request).headers).get(
        "Authorization",
      ),
    ).toBe("Bearer first-session");
    credential = "second-session";
    resolve(
      new Response("{}", {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await pending;
    expect(expire).not.toHaveBeenCalled();
  });
  it("expires the current session on a real 401 response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await api.GET("/v1/profile");
    expect(expire).toHaveBeenCalledTimes(1);
  });
  it("refreshes authority for 403 and preserves server validation/correlation without automatic replay", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ errors: { name: ["Required"] } }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "test-correlation",
        },
      }),
    );
    const result = await api.PATCH("/v1/profile", {
      body: { name: "Test" },
    });
    expect(() => check(result)).toThrow(ApiError);
    try {
      check(result);
    } catch (error) {
      expect(error).toMatchObject({
        status: 403,
        requestId: "test-correlation",
        fields: { name: ["Required"] },
      });
    }
    expect(refresh).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("leaves password confirmation failures in the action dialog", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "MOBILE_REAUTH_REQUIRED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await api.PATCH("/v1/profile", {
      body: { name: "Test" },
    });
    expect(() => check(result)).toThrow(ApiError);
    expect(refresh).not.toHaveBeenCalled();
  });
  it.each([429, 503])(
    "blocks repeated %s reads until the same deadline and scopes it to the current credential",
    async (status) => {
      jest.useFakeTimers();
      try {
        const fetcher = jest.spyOn(global, "fetch").mockImplementation(
          async () =>
            new Response("{}", {
              status,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "60",
              },
            }),
        );
        const first = await api.GET("/v1/profile");
        expect(() => check(first)).toThrow(ApiError);
        await expect(api.GET("/v1/profile")).rejects.toMatchObject({
          status,
        });
        await jest.advanceTimersByTimeAsync(59999);
        await expect(api.GET("/v1/profile")).rejects.toMatchObject({
          status,
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
        // An explicitly requested write remains single-shot, independent of read waits.
        await api.PATCH("/v1/profile", { body: { name: "Synthetic" } });
        expect(fetcher).toHaveBeenCalledTimes(2);
        await jest.advanceTimersByTimeAsync(1);
        await api.GET("/v1/profile");
        expect(fetcher).toHaveBeenCalledTimes(3);
        credential = "new-session";
        await api.GET("/v1/profile");
        expect(fetcher).toHaveBeenCalledTimes(4);
      } finally {
        jest.useRealTimers();
      }
    },
  );
  it("parses HTTP-date Retry-After and never starts a new relative wait from an expired date", () => {
    const now = Date.UTC(2026, 9, 8, 22, 0, 0);
    expect(retryAfterSeconds(new Date(now + 60000).toUTCString(), now)).toBe(
      60,
    );
    expect(retryAfterSeconds(new Date(now - 1000).toUTCString(), now)).toBe(0);
    expect(retryAfterSeconds("invalid", now)).toBeUndefined();
  });
});
