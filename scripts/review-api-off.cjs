// The CLI controls only the guarded test database; the captured mobile token stays in this process.
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { integrationRoot } = require("./review-paths.cjs");
const folder = integrationRoot();
const fixture = JSON.parse(
  fs.readFileSync(path.join(folder, "fixtures.json"), "utf8"),
).owner;
const base = "http://127.0.0.1:9082/api/v1";
const stageFile = path.join(folder, "r5-api-off.stage.json");
const write = (name, data) =>
  fs.writeFileSync(path.join(folder, name), JSON.stringify(data));
const wait = async (stage) => {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      if (JSON.parse(fs.readFileSync(stageFile, "utf8")).stage === stage)
        return;
    } catch {
      /* The coordinator has not signalled this stage yet. */
    }
    await delay(500);
  }
  throw new Error("Guarded API-off coordinator stage timed out: " + stage);
};
const check = (condition, label) => {
  if (!condition) throw new Error(label);
};
(async () => {
  let token;
  try {
    const login = await fetch(base + "/auth/login", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: fixture.email,
        password: "Synthetic!Mobile2026",
        device_name: "Isolated API-off validation",
        client: "mobile",
      }),
      signal: AbortSignal.timeout(120000),
    });
    check(login.ok, "Synthetic login failed");
    token = (await login.json()).access_token;
    const read = (route) =>
      fetch(base + route, {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        signal: AbortSignal.timeout(120000),
      });
    check((await read("/mobile/bootstrap")).ok, "Initial bootstrap failed");
    write("r5-api-off.ready.json", { stage: "ready", pid: process.pid });
    await wait("disabled");
    const config = await read("/mobile/config");
    check(
      config.ok && (await config.json()).data.features["api.enabled"] === false,
      "API-off discovery failed",
    );
    check(
      (await read("/mobile/bootstrap")).status === 404,
      "API-off did not block the original token",
    );
    write("r5-api-off.disabled.json", {
      stage: "disabled-checked",
      outcome: "PASS",
    });
    await wait("enabled");
    check(
      (await read("/mobile/bootstrap")).ok,
      "Original token did not recover after API enable",
    );
    write("r5-api-off.result.json", {
      outcome: "PASS",
      checks: [
        "configuration discoverable while disabled",
        "private bootstrap blocked for captured token",
        "same token recovers after re-enable",
      ],
    });
    console.log(
      "PASS: guarded API disable/re-enable with the same in-memory mobile token",
    );
  } catch (error) {
    write("r5-api-off.result.json", {
      outcome: "FAIL",
      failure: error.message,
    });
    process.exitCode = 1;
  } finally {
    if (token) {
      try {
        await fetch(base + "/token", {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        /* The coordinator restores API before completion. */
      }
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
