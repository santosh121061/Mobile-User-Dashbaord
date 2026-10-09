import {
    api,
    attachSession,
    check,
    ApiError,
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
        expect(
            retryAfterSeconds(new Date(now + 60000).toUTCString(), now),
        ).toBe(60);
        expect(retryAfterSeconds(new Date(now - 1000).toUTCString(), now)).toBe(
            0,
        );
        expect(retryAfterSeconds("invalid", now)).toBeUndefined();
    });
});
