// Actual local protocol check only. It never persists or prints a token.
const fs = require("node:fs");
const path = require("node:path");
const { integrationRoot } = require("./review-paths.cjs");
const base = "http://127.0.0.1:9082/api";
const diagnostic = { stage: "guard" };
async function main() {
  if (process.env.ADMIN_MOBILE_INTEGRATION !== "isolated")
    throw new Error("Explicit isolated mode required");
  const marker = JSON.parse(
    fs.readFileSync(path.join(integrationRoot(), "e2e.json"), "utf8"),
  );
  if (marker.mode !== "isolated-maestro")
    throw new Error("Guarded E2E preparation required");
  diagnostic.stage = "login";
  const response = await fetch(base + "/v1/auth/login", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "mobile-expiry@example.test",
      password: "Synthetic!Mobile2026",
      device_name: "User Dashboard",
      client: "mobile",
    }),
    signal: AbortSignal.timeout(30000),
  });
  diagnostic.login_status = response.status;
  if (!response.ok) throw new Error("Synthetic expiry login failed");
  const session = await response.json();
  const lifetime = Date.parse(session.expires_at) - Date.now();
  diagnostic.stage = "issued_expiry";
  diagnostic.issued_lifetime_ms = lifetime;
  if (!(lifetime > 0 && lifetime <= 15000))
    throw new Error("Short fixture expiry was not returned");
  const headers = {
    Accept: "application/json",
    Authorization: "Bearer " + session.access_token,
  };
  diagnostic.stage = "initial_bootstrap";
  const bootstrap = await fetch(base + "/v1/mobile/bootstrap", {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  diagnostic.initial_bootstrap_status = bootstrap.status;
  if (!bootstrap.ok) throw new Error("Initial expiry fixture bootstrap failed");
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, Date.parse(session.expires_at) - Date.now()) + 1000,
    ),
  );
  diagnostic.stage = "expired_bootstrap";
  const expired = await fetch(base + "/v1/mobile/bootstrap", {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  diagnostic.expired_bootstrap_status = expired.status;
  if (expired.status !== 401)
    throw new Error("Expired fixture was not rejected");
  process.stdout.write(
    JSON.stringify({
      isolated_fixture: true,
      login: response.status,
      initial_bootstrap: bootstrap.status,
      issued_lifetime_ms: lifetime,
      expired_bootstrap: expired.status,
      token_persisted: false,
      native_execution: "NOT_RUN",
    }) + "\n",
  );
}
main().catch(() => {
  process.stderr.write(
    JSON.stringify({
      ...diagnostic,
      result: "FAIL",
      credential_data_logged: false,
    }) + "\n",
  );
  process.exitCode = 1;
});
