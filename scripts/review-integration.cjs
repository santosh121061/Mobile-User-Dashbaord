/* Real Laravel/browser evidence against synthetic records in the guarded workspace test DB. */
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { mobileRoot: root, integrationRoot } = require("./review-paths.cjs");
const output = path.join(root, ".runtime/mobile-integration/evidence");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(integrationRoot(), "fixtures.json"), "utf8"),
);
const base = "http://127.0.0.1:9082/api/v1";
const password = "Synthetic!Mobile2026";
const evidence = {
  syntheticRecords: true,
  actualLaravel: true,
  checks: [],
  browserErrors: [],
  screenshots: [],
};
fs.mkdirSync(output, { recursive: true });
const verify = (condition, label) => {
  if (!condition) throw new Error("Failed: " + label);
  evidence.checks.push(label);
};
const request = async (route, token, method = "GET", body, approval) => {
  const response = await fetch(base + route, {
    method,
    headers: {
      Accept: "application/json",
      ...(token && { Authorization: "Bearer " + token }),
      ...(body && { "Content-Type": "application/json" }),
      ...(approval && { "X-Mobile-Step-Up": approval }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const content = await response.text();
  const data =
    content && response.headers.get("content-type")?.includes("json")
      ? JSON.parse(content)
      : null;
  return {
    status: response.status,
    data,
    retryAfter: Number(response.headers.get("retry-after")) || 60,
  };
};
const login = async (key) => {
  const result = await request("/auth/login", null, "POST", {
    email: fixtures[key].email,
    password,
    device_name: "Isolated browser validation",
    client: "mobile",
  });
  verify(
    result.status === 200 && typeof result.data?.access_token === "string",
    key + " mobile login",
  );
  return result.data.access_token;
};
const saveFeatures = async (values, token) => {
  const settings = await request("/settings", token);
  verify(settings.status === 200, "current settings version read");
  const approvalBody = {
    method: "PATCH",
    path: "/api/v1/settings",
    current_password: password,
  };
  let approval = await request("/mobile/step-up", token, "POST", approvalBody);
  // A throttle rejection issues no approval and performs no mutation. Honor its server delay.
  for (let attempts = 0; approval.status === 429 && attempts < 3; attempts++) {
    verify(true, "step-up throttle observed; server Retry-After honored");
    await new Promise((done) =>
      setTimeout(done, Math.min(60, Math.max(1, approval.retryAfter)) * 1000),
    );
    approval = await request("/mobile/step-up", token, "POST", approvalBody);
  }
  if (approval.status !== 200)
    throw new Error(
      "Settings step-up HTTP " +
        approval.status +
        " code " +
        (approval.data?.code ?? "none"),
    );
  verify(approval.status === 200, "settings step-up accepted");
  const saved = await request(
    "/settings",
    token,
    "PATCH",
    { values, version: settings.data.data.version },
    approval.data.approval,
  );
  if (saved.status !== 200)
    throw new Error(
      "Settings write HTTP " +
        saved.status +
        " code " +
        (saved.data?.code ?? "none") +
        " fields " +
        Object.keys(saved.data?.errors ?? {}).join(","),
    );
  verify(
    saved.status === 200,
    "valid feature combination saved through the shared settings action",
  );
};
const flag = async (key, enabled, token) => {
  const values = { [key]: enabled };
  if (key === "account.email.enabled" && !enabled)
    Object.assign(values, {
      "account.recovery.enabled": false,
      "account.verification.enabled": false,
      "notifications.security_email.enabled": false,
      "account.require_verified": false,
    });
  if (key === "account.verification.enabled" && !enabled)
    values["account.require_verified"] = false;
  if (key === "account.require_verified" && enabled)
    Object.assign(values, {
      "account.email.enabled": true,
      "account.verification.enabled": true,
    });
  await saveFeatures(values, token);
};
(async () => {
  let browser;
  let owner;
  let baseline;
  const changedFlags = new Map();
  const tokens = [];
  try {
    owner = await login("owner");
    tokens.push(owner);
    const viewer = await login("viewer");
    tokens.push(viewer);
    const account = await login("account");
    tokens.push(account);
    const initial = await request("/mobile/bootstrap", owner);
    baseline = initial.data.data.features;
    fs.writeFileSync(
      path.join(output, "feature-baseline.json"),
      JSON.stringify(baseline),
    );
    verify(
      initial.status === 200 &&
        Object.keys(initial.data.data.features).length === 12,
      "authenticated bootstrap describes all twelve features",
    );
    const list = await request("/users", viewer);
    verify(
      list.status === 200 &&
        list.data.data.length === 1 &&
        Number(list.data.data[0].id) === fixtures.account.id,
      "assigned viewer sees only assigned synthetic account",
    );
    verify(
      !Object.hasOwn(list.data.data[0], "email"),
      "hidden email remains absent from user projection",
    );
    const denied = await request(
      "/mobile/users/" + fixtures.other.id + "/context",
      viewer,
    );
    verify(
      [403, 404].includes(denied.status),
      "unassigned record denied by real resolver",
    );
    const access = await request(
      "/mobile/users/" + fixtures.account.id + "/access",
      owner,
    );
    verify(
      access.status === 200 &&
        Array.isArray(access.data.data.effective) &&
        typeof access.data.data.field_delegatable.email.edit === "boolean",
      "effective access and field delegation ceilings returned by real server",
    );
    const profile = await request("/profile/details", account, "POST", {
      first_name: "Mobile",
      last_name: "Account Updated",
      phone: "+91 555 0100",
      timezone: "Asia/Kolkata",
      date_format: "d/m/Y",
    });
    verify(
      profile.status === 200 &&
        profile.data.data.phone === "+91 555 0100" &&
        profile.data.data.first_name === "Mobile",
      "structured personal profile saved through shared action",
    );
    const security = await request(
      "/profile/notification-preferences",
      account,
      "PATCH",
      { email_security: false },
    );
    verify(
      security.status === 200 && security.data.data.email_security === false,
      "separate security email preference saved",
    );
    const removal = await request("/profile/details", account, "POST", {
      first_name: "Mobile",
      last_name: "Account Updated",
      phone: "+91 555 0100",
      timezone: "Asia/Kolkata",
      date_format: "d/m/Y",
      remove_avatar: true,
    });
    verify(
      removal.status === 200 && removal.data.data.avatar_available === false,
      "personal avatar removal contract accepted",
    );
    for (const [key, original] of process.argv.includes("--browser-only")
      ? []
      : Object.entries(initial.data.data.features)) {
      // API-off recovery uses the separately guarded CLI, with credentials kept in memory.
      if (key === "api.enabled") continue;
      changedFlags.set(key, original);
      await flag(key, !original, owner);
      if (key === "api.enabled") {
        const config = await request("/mobile/config");
        verify(
          config.status === 200 &&
            config.data.data.features["api.enabled"] === false,
          "API-off configuration remains discoverable",
        );
        verify(
          (await request("/mobile/bootstrap", owner)).status === 404,
          "API-off blocks private bootstrap",
        );
      } else {
        const snapshot = await request("/mobile/bootstrap", owner);
        verify(
          snapshot.status === 200 &&
            snapshot.data.data.features[key] === !original,
          key + " changes during the same token session",
        );
        const endpoint = {
          "notifications.in_app.enabled": "/notifications",
          "audit.capture.enabled": "/audit",
          "users.avatar.enabled": "/profile/avatar",
        }[key];
        if (endpoint && original)
          verify(
            (await request(endpoint, owner)).status === 404,
            key + " disabled endpoint blocked",
          );
      }
      await saveFeatures(baseline, owner);
      changedFlags.delete(key);
      verify(
        (await request("/mobile/bootstrap", owner)).status === 200,
        key + " restored without replacing login",
      );
      console.log(JSON.stringify({ stage: "feature", key, restored: true }));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    page.on("pageerror", (error) => evidence.browserErrors.push(error.message));
    await page.goto("http://localhost:8082", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .waitFor({ timeout: 120000 });
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(fixtures.owner.email);
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByText("Welcome back,", { exact: true })
      .waitFor({ timeout: 120000 });
    verify(true, "browser signs in against actual isolated Laravel");
    for (const width of [390, 599, 600, 767, 768, 900, 1280]) {
      await page.setViewportSize({
        width,
        height: width < 600 ? 844 : 1024,
      });
      const name = "actual-home-light-" + width + ".png";
      await page.screenshot({
        path: path.join(output, name),
        fullPage: true,
      });
      evidence.screenshots.push(name);
      verify(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "home fits viewport " + width,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Phone", exact: true })
      .waitFor({ timeout: 30000 });
    await page
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("+91 555 0199");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Saved.", { exact: true }).waitFor({ timeout: 30000 });
    verify(
      true,
      "browser structured profile write returns Saved through actual backend",
    );
    await page.screenshot({
      path: path.join(output, "actual-profile-phone-light.png"),
      fullPage: true,
    });
    evidence.screenshots.push("actual-profile-phone-light.png");
    await page.goBack();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.getByText("Saved.", { exact: true }).waitFor({ timeout: 30000 });
    for (const width of [390, 600, 768, 1280]) {
      await page.setViewportSize({ width, height: 1024 });
      const name = "actual-preferences-dark-" + width + ".png";
      await page.screenshot({
        path: path.join(output, name),
        fullPage: true,
      });
      evidence.screenshots.push(name);
      verify(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "preferences fit dark viewport " + width,
      );
    }
    verify(
      evidence.browserErrors.length === 0,
      "actual browser flow has no JavaScript page errors",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 1024 });
      const scaled = await page.evaluate(() => {
        const result = [];
        for (const element of document.querySelectorAll("body *")) {
          if (
            !(element instanceof HTMLElement) ||
            (!element.matches("input,textarea") &&
              ![...element.childNodes].some(
                (node) =>
                  node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
              ))
          )
            continue;
          const style = getComputedStyle(element);
          const fontSize = parseFloat(style.fontSize),
            lineHeight = parseFloat(style.lineHeight);
          result.push([
            element,
            element.style.fontSize,
            element.style.lineHeight,
          ]);
          element.style.fontSize = fontSize * 2 + "px";
          element.style.lineHeight =
            (Number.isFinite(lineHeight) ? lineHeight * 2 : fontSize * 3.1) +
            "px";
        }
        window.__reviewTextStyles = result;
        return result.length;
      });
      verify(scaled > 5, "rendered browser text scaled to 200% at " + width);
      const name = "actual-preferences-dark-text200-" + width + ".png";
      await page.screenshot({ path: path.join(output, name), fullPage: true });
      evidence.screenshots.push(name);
      verify(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "200% browser text fits viewport " + width,
      );
      await page.evaluate(() => {
        for (const [element, size, height] of window.__reviewTextStyles) {
          element.style.fontSize = size;
          element.style.lineHeight = height;
        }
        delete window.__reviewTextStyles;
      });
    }
    evidence.largeText =
      "200% rendered browser CSS text, not native Dynamic Type/TalkBack/VoiceOver acceptance";
    evidence.outcome = "PASS";
  } catch (error) {
    evidence.outcome = "FAIL";
    evidence.failure = error.message;
    process.exitCode = 1;
  } finally {
    for (const [key, value] of changedFlags) {
      try {
        await saveFeatures(baseline ?? { [key]: value }, owner);
      } catch {
        evidence.restoreFailed = key;
        process.exitCode = 1;
      }
    }
    for (const token of tokens) {
      try {
        await request("/token", token, "DELETE");
      } catch {
        /* synthetic token has the existing 12h expiry */
      }
    }
    if (browser) await browser.close();
    fs.writeFileSync(
      path.join(output, "actual-review.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
