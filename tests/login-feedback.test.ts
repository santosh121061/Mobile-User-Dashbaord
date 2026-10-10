import { ApiError, ApiTransportError } from "../src/api/client";
import { loginFeedback } from "../src/auth/login-feedback";

const credentials = "The supplied credentials could not be authenticated.";
it("maps Laravel's shared credential rejection without revealing account status", () => {
  const feedback = loginFeedback(
    new ApiError(
      422,
      { email: [credentials] },
      null,
      undefined,
      undefined,
      credentials,
    ),
  );
  expect(feedback.title).toBe("Email or password is incorrect");
  expect(feedback.fields).toBeUndefined();
  expect(feedback.verification).toBeUndefined();
  expect(feedback.hint).not.toMatch(/disabled|archived|deleted|exist/i);
});
it("offers verification only for the verified explicit Laravel login response", () => {
  expect(
    loginFeedback(
      new ApiError(
        403,
        {},
        null,
        undefined,
        undefined,
        "Verify your email before signing in.",
      ),
    ).verification,
  ).toBe(true);
  expect(
    loginFeedback(new ApiError(403, {}, null, "EMAIL_UNVERIFIED")).verification,
  ).toBeUndefined();
  expect(
    loginFeedback(
      new ApiError(
        403,
        {},
        null,
        undefined,
        undefined,
        "This account is not enabled.",
      ),
    ).verification,
  ).toBeUndefined();
});
it("maps validation to safe field-specific guidance without displaying backend text", () => {
  const feedback = loginFeedback(
    new ApiError(
      422,
      {
        email: ["Internal SQL and private account information"],
        password: ["Sensitive gateway trace"],
      },
      null,
    ),
  );
  expect(feedback.fields).toEqual({
    email: "Check your email address.",
    password: "Check your password.",
  });
  expect(JSON.stringify(feedback)).not.toMatch(/SQL|Sensitive|private|gateway/);
});
it("uses the numeric retry delay provided by the response header", () => {
  expect(loginFeedback(new ApiError(429, {}, null, undefined, 35)).hint).toBe(
    "Try again in 35 seconds.",
  );
});
it("describes disabled API access without guessing an account reason", () => {
  expect(loginFeedback(new ApiError(404, {}, null)).title).toBe(
    "The API is currently unavailable.",
  );
});
it("keeps unknown failures and server messages private", () => {
  expect(
    JSON.stringify(
      loginFeedback(
        new ApiError(
          500,
          {},
          null,
          undefined,
          undefined,
          "Secret server exception",
        ),
      ),
    ),
  ).not.toContain("Secret");
  expect(
    JSON.stringify(loginFeedback(new Error("Private failure"))),
  ).not.toContain("Private");
});

it.each(["network", "timeout"] as const)(
  "makes %s failures actionable while preserving privacy",
  (reason) => {
    const feedback = loginFeedback(
      new ApiTransportError(reason, new Error("Private transport details")),
    );
    expect(feedback.hint).toContain("Check your connection");
    expect(feedback.title).toBe(
      reason === "timeout" ? "Sign-in took too long" : "Couldn’t connect",
    );
    expect(JSON.stringify(feedback)).not.toContain("Private");
  },
);
