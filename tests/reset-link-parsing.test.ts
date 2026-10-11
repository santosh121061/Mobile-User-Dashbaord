import { parseIntent } from "../src/utils/links";

const base = "https://dashboard.example.test/api";
const scheme = "userdashboard-dev";
const token = "a".repeat(64);
const quotedEmail = '"quoted local"@example.test';
const encodedEmail = encodeURIComponent(quotedEmail);
const webRoute = `https://dashboard.example.test/reset-password/${token}`;
const appRoute = `${scheme}://reset-password/${token}`;

describe("Quoted-email password reset links within existing trust rules", () => {
  it.each([webRoute, appRoute, `/reset-password/${token}`])(
    "accepts correctly percent-encoded quoted spaces through %s",
    (route) => {
      expect(
        parseIntent(`${route}?email=${encodedEmail}`, scheme, base),
      ).toEqual({
        kind: "reset",
        email: quotedEmail,
        token,
      });
    },
  );

  it("accepts URLSearchParams form encoding while retaining the exact decoded email", () => {
    const query = new URLSearchParams({ email: quotedEmail }).toString();
    expect(query).toContain("quoted+local");
    expect(parseIntent(`${webRoute}?${query}`, scheme, base)).toEqual({
      kind: "reset",
      email: quotedEmail,
      token,
    });
  });

  it("decodes a literal percent sequence once without reinterpreting the email", () => {
    const email = '"quoted %20 local"@example.test';
    expect(
      parseIntent(
        `${webRoute}?email=${encodeURIComponent(email)}`,
        scheme,
        base,
      ),
    ).toEqual({ kind: "reset", email, token });
  });

  it.each([
    `https://evil.example.test/reset-password/${token}`,
    `https://dashboard.example.test.evil.example/reset-password/${token}`,
    `https://sub.dashboard.example.test/reset-password/${token}`,
    `http://dashboard.example.test/reset-password/${token}`,
    `https://dashboard.example.test:444/reset-password/${token}`,
    `https://name@dashboard.example.test/reset-password/${token}`,
    `//evil.example.test/reset-password/${token}`,
    `other-app://reset-password/${token}`,
    `${scheme}://evil.example/reset-password/${token}`,
  ])("rejects the same valid email at an untrusted destination %s", (route) => {
    expect(
      parseIntent(`${route}?email=${encodedEmail}`, scheme, base),
    ).toBeNull();
  });

  it.each([
    `email=${encodedEmail}&email=other%40example.test`,
    `email=${encodedEmail}&%65mail=other%40example.test`,
    `email=${encodedEmail}&token=${token}`,
    `email=${encodedEmail}&extra=1`,
    `%2565mail=${encodedEmail}`,
    `Email=${encodedEmail}`,
    `email=${encodedEmail}%26email%3Dother%40example.test`,
    `email=${encodedEmail};email=other%40example.test`,
    "email=",
  ])("rejects duplicate, ambiguous or missing email parameters %s", (query) => {
    expect(parseIntent(`${webRoute}?${query}`, scheme, base)).toBeNull();
  });

  it.each([
    "https://dashboard.example.test/reset-password",
    "https://dashboard.example.test/reset-password/",
    `https://dashboard.example.test/reset-password/${"a".repeat(63)}`,
    `https://dashboard.example.test/reset-password/${"a".repeat(65)}`,
    `https://dashboard.example.test/reset-password/${"g".repeat(64)}`,
    `https://dashboard.example.test/reset-password/%61${"a".repeat(63)}`,
    `https://dashboard.example.test/reset-password/${token}/extra`,
  ])("keeps the exact token route requirement for %s", (route) => {
    expect(
      parseIntent(`${route}?email=${encodedEmail}`, scheme, base),
    ).toBeNull();
  });

  it.each([
    "%22quoted local%22%40example.test",
    "%22quoted%20local%22%40example.test%",
    "%22quoted%2local%22%40example.test",
    "user%G0%40example.test",
    "%22quoted%C0%AF%20local%22%40example.test",
    "%22quoted%ED%A0%80%20local%22%40example.test",
    "%22quoted%E2%28%A1%20local%22%40example.test",
    "user%FF%40example.test",
    "%22quoted%00local%22%40example.test",
    "%22quoted%09local%22%40example.test",
    "%22quoted%0D%0Alocal%22%40example.test",
    "%22quoted%7Flocal%22%40example.test",
  ])(
    "rejects malformed encoding or encoded controls %s without throwing",
    (email) => {
      expect(() =>
        parseIntent(`${webRoute}?email=${email}`, scheme, base),
      ).not.toThrow();
      expect(
        parseIntent(`${webRoute}?email=${email}`, scheme, base),
      ).toBeNull();
    },
  );

  it.each([
    "unquoted local@example.test",
    '"unterminated local@example.test',
    '"quoted local"@',
    `${"a".repeat(242)}@example.test`,
  ])("rejects invalid or oversized decoded email %s", (email) => {
    expect(
      parseIntent(
        `${webRoute}?email=${encodeURIComponent(email)}`,
        scheme,
        base,
      ),
    ).toBeNull();
  });

  it("retains traversal, encoded separator and fragment rejection", () => {
    for (const route of [
      `https://dashboard.example.test/../reset-password/${token}`,
      `https://dashboard.example.test/%2e%2e/reset-password/${token}`,
      `https://dashboard.example.test/reset-password/%2f${token}`,
      `https://dashboard.example.test/reset-password/%5c${token}`,
    ])
      expect(
        parseIntent(`${route}?email=${encodedEmail}`, scheme, base),
      ).toBeNull();
    expect(
      parseIntent(`${webRoute}?email=${encodedEmail}#fragment`, scheme, base),
    ).toBeNull();
  });
});
