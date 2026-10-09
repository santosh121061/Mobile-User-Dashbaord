const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");
const { mobileRoot, integrationRoot } = require("./review-paths.cjs");

function configured(mode, root, callback) {
  const previous = {
    mode: process.env.ADMIN_MOBILE_INTEGRATION,
    root: process.env.MOBILE_INTEGRATION_ROOT,
  };
  try {
    if (mode === undefined) delete process.env.ADMIN_MOBILE_INTEGRATION;
    else process.env.ADMIN_MOBILE_INTEGRATION = mode;
    if (root === undefined) delete process.env.MOBILE_INTEGRATION_ROOT;
    else process.env.MOBILE_INTEGRATION_ROOT = root;
    callback();
  } finally {
    if (previous.mode === undefined)
      delete process.env.ADMIN_MOBILE_INTEGRATION;
    else process.env.ADMIN_MOBILE_INTEGRATION = previous.mode;
    if (previous.root === undefined) delete process.env.MOBILE_INTEGRATION_ROOT;
    else process.env.MOBILE_INTEGRATION_ROOT = previous.root;
  }
}

test("mobile paths resolve within the standalone repository", () => {
  assert.equal(mobileRoot, path.resolve(__dirname, ".."));
});

test("integration refuses absent or non-isolated mode", () => {
  for (const mode of [undefined, "production", "development"]) {
    configured(mode, os.tmpdir(), () => {
      assert.throws(integrationRoot, /Explicit isolated/);
    });
  }
});

test("integration refuses missing and relative external fixture roots", () => {
  for (const root of [
    undefined,
    "",
    "../backend/.runtime/mobile-integration",
  ]) {
    configured("isolated", root, () => {
      assert.throws(integrationRoot, /absolute guarded backend/);
    });
  }
});

test("integration accepts an explicitly configured absolute fixture root", () => {
  const root = path.join(os.tmpdir(), "guarded-fixtures", "nested", "..");
  configured("isolated", root, () => {
    assert.equal(integrationRoot(), path.resolve(root));
  });
});
