const path = require("node:path");

const mobileRoot = path.resolve(__dirname, "..");

function integrationRoot() {
  if (process.env.ADMIN_MOBILE_INTEGRATION !== "isolated") {
    throw new Error("Explicit isolated integration mode is required.");
  }
  const configured = process.env.MOBILE_INTEGRATION_ROOT;
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error(
      "Set MOBILE_INTEGRATION_ROOT to the absolute guarded backend fixture directory.",
    );
  }
  return path.resolve(configured);
}

module.exports = { mobileRoot, integrationRoot };
