// Static source validation only; this does not launch Maestro or prove native E2E.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const yaml = require("js-yaml");
const root = path.resolve(__dirname, "../.maestro");
const commands = new Set([
    "runScript",
    "launchApp",
    "runFlow",
    "extendedWaitUntil",
    "assertVisible",
    "assertNotVisible",
    "tapOn",
    "inputText",
    "hideKeyboard",
    "scrollUntilVisible",
    "back",
    "longPressOn",
]);
const seen = new Set();
function localReference(source, reference) {
    const target = path.resolve(path.dirname(source), reference);
    if (!target.startsWith(root + path.sep) || !fs.statSync(target).isFile())
        throw new Error("Invalid local flow reference");
    return target;
}
function checkSteps(file, steps) {
    if (!Array.isArray(steps) || !steps.length)
        throw new Error("Flow must contain steps");
    for (const step of steps) {
        const keys = typeof step === "string" ? [step] : Object.keys(step);
        if (keys.length !== 1 || !commands.has(keys[0]))
            throw new Error("Unsupported flow command");
        const [command] = keys;
        const value = typeof step === "string" ? null : step[command];
        if (command === "runFlow") {
            if (typeof value === "string")
                checkFlow(localReference(file, value));
            else if (value.file) checkFlow(localReference(file, value.file));
            else checkSteps(file, value.commands);
        }
        if (command === "runScript") {
            const script = localReference(
                file,
                typeof value === "string" ? value : value.file,
            );
            new vm.Script(fs.readFileSync(script, "utf8"), {
                filename: script,
            });
        }
        if (
            command === "extendedWaitUntil" &&
            !(value.timeout > 0 && value.timeout <= 60000)
        )
            throw new Error("Wait must be bounded to60s");
    }
}
function checkFlow(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const docs = yaml.loadAll(fs.readFileSync(file, "utf8"));
    if (docs.length !== 2 || docs[0].appId !== "${MAESTRO_APP_ID}")
        throw new Error("Flow header/app identifier missing");
    checkSteps(file, docs[1]);
}
const flows = fs
    .readdirSync(path.join(root, "flows"))
    .filter((file) => /^\d{2}-.*\.yaml$/.test(file))
    .sort();
if (
    flows.length !== 11 ||
    flows.some((file, index) => Number(file.slice(0, 2)) !== index + 1)
)
    throw new Error("All11 master critical flows are required");
for (const file of flows) checkFlow(path.join(root, "flows", file));
const guard = fs.readFileSync(path.join(root, "support/guard.js"), "utf8");
const context = {
    MAESTRO_ISOLATED: "true",
    MAESTRO_APP_ID: "com.example.userdashboard.dev",
    MAESTRO_FIXTURE_API: "http://10.0.2.2:9082/api",
    MAESTRO_OWNER_EMAIL: "mobile-owner@example.test",
    MAESTRO_VIEWER_EMAIL: "mobile-viewer@example.test",
    MAESTRO_EXPIRY_EMAIL: "mobile-expiry@example.test",
    MAESTRO_CREATE_EMAIL: "maestro-validation@example.test",
    MAESTRO_PASSWORD: "Synthetic!Mobile2026",
};
vm.runInNewContext(guard, context, { timeout: 1000 });
for (const denied of [
    { MAESTRO_ISOLATED: "false" },
    { MAESTRO_APP_ID: "production.app" },
    { MAESTRO_FIXTURE_API: "https://production.example/api" },
    { MAESTRO_OWNER_EMAIL: "customer@example.com" },
]) {
    let rejected = false;
    try {
        vm.runInNewContext(guard, { ...context, ...denied }, { timeout: 1000 });
    } catch {
        rejected = true;
    }
    if (!rejected) throw new Error("Guard accepted an unsafe fixture context");
}
process.stdout.write(
    JSON.stringify({
        critical_flows: flows.length,
        helper_flows: seen.size - flows.length,
        yaml: "PASS",
        references: "PASS",
        guard_positive: 1,
        guard_negative: 4,
        native_execution: "NOT_RUN",
    }) + "\n",
);
