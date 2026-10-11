import { userStatusLabel, userStatusTone } from "../src/features/user-status";

it.each([
  ["active", "Active", "success"],
  ["pending", "Pending", "warning"],
  ["suspended", "Suspended", "danger"],
  ["disabled", "Disabled", "danger"],
  ["archived", "Archived", "neutral"],
] as const)(
  "uses explicit %s lifecycle metadata over the legacy projection",
  (lifecycle_status, label, tone) => {
    const user = { lifecycle_status, status: "disabled" as const };
    expect(userStatusLabel(user)).toBe(label);
    expect(userStatusTone(user)).toBe(tone);
  },
);
it("retains old server labels and does not invent a status for projected records", () => {
  expect(userStatusLabel({ status: "enabled" })).toBe("Enabled");
  expect(userStatusLabel({ status: "disabled" })).toBe("Disabled");
  expect(userStatusLabel({})).toBeUndefined();
  expect(userStatusLabel({ archived: true, lifecycle_status: "active" })).toBe(
    "Archived",
  );
  expect(userStatusTone({ archived: true, lifecycle_status: "active" })).toBe(
    "neutral",
  );
});
