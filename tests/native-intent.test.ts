import { redirectSystemPath } from "../src/app/+native-intent";
import {
  currentIntent,
  discardIntent,
  receiveIntent,
} from "../src/auth/intents";

afterEach(() => {
  const intent = currentIntent();
  if (intent) discardIntent(intent);
});

it.each(["", "/", "userdashboard-dev://", "userdashboard-dev:///"])(
  "opens the app's root on a normal cold launch: %s",
  (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe("/");
    expect(currentIntent()).toBeNull();
  },
);

it("does not discard a pending notification or link when processing the startup root", () => {
  receiveIntent(
    "/users/2",
    "userdashboard-dev",
    "https://up.knitinfotech.com/api",
  );
  const intent = currentIntent();
  expect(
    redirectSystemPath({ path: "userdashboard-dev:///", initial: true }),
  ).toBe("/");
  expect(currentIntent()).toBe(intent);
});

it.each([true, false])(
  "still handles supported record links (initial=%s)",
  (initial) => {
    expect(
      redirectSystemPath({
        path: "userdashboard-dev://users/2",
        initial,
      }),
    ).toBe("/intent");
    expect(currentIntent()).toEqual({ kind: "record", route: "/users/2" });
  },
);

it.each([
  "userdashboard-dev:///?token=private",
  "userdashboard-dev://settings",
  "other-app:///",
  "https://evil.example.test/",
  "/users/%2e%2e/profile",
])("keeps rejecting malformed or untrusted startup links: %s", (path) => {
  expect(redirectSystemPath({ path, initial: true })).toBe("/unavailable");
});
