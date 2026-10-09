import {
    navigationMode,
    kpiColumns,
    requiresLocalLock,
    uniqueRows,
} from "../src/utils/layout";
import { routeForIntent } from "../src/utils/links";
import { exportLocation } from "../src/features/exports";
describe("Adaptive and bounded session behavior", () => {
    it.each([
        [599, "tabs"],
        [600, "rail"],
        [767, "rail"],
        [768, "sidebar"],
    ])("uses the correct navigation at %s", (width, mode) =>
        expect(navigationMode(Number(width))).toBe(mode),
    );
    it("keeps two KPIs at large text scales and four only when they fit", () => {
        expect(kpiColumns(900, 1)).toBe(4);
        expect(kpiColumns(900, 2)).toBe(2);
        expect(kpiColumns(899, 1)).toBe(2);
    });
    it("locks at three minutes using elapsed time", () => {
        expect(requiresLocalLock(100, 180099)).toBe(false);
        expect(requiresLocalLock(100, 180100)).toBe(true);
    });
    it("deduplicates loaded pages by stable ID", () =>
        expect(
            uniqueRows([
                { data: [{ id: "1", name: "old" }] },
                {
                    data: [
                        { id: "1", name: "new" },
                        { id: "2", name: "second" },
                    ],
                },
            ]),
        ).toEqual([
            { id: "1", name: "new" },
            { id: "2", name: "second" },
        ]));
});
describe("Untrusted destinations", () => {
    it.each([
        "https://evil.example/users/1",
        "/users/../settings",
        "/users/%2fsettings",
        "/users/1?token=secret",
        "userdashboard-dev://settings",
        "/users/0",
    ])("rejects %s", (value) =>
        expect(routeForIntent(value)).toBe("/unavailable"),
    );
    it("permits known record intents only", () => {
        expect(routeForIntent("/users/12")).toBe("/users/12");
        expect(routeForIntent("/notifications")).toBe("/notifications");
    });
    it("never sends credentials to an arbitrary export host", () =>
        expect(() =>
            exportLocation(
                "https://evil.example/api/v1/operations/a/download",
                "a",
            ),
        ).toThrow());
    it("validates the exact owned operation download path", () => {
        const id = "11111111-1111-4111-8111-111111111111";
        expect(
            exportLocation(
                `/api/v1/operations/${id}/download?expires=123&signature=${"a".repeat(64)}`,
                id,
            ),
        ).toEqual({ expires: 123, signature: "a".repeat(64) });
    });
});
