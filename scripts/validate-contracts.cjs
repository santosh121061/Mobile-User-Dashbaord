const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv");
const spec = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../api/openapi.json"), "utf8"),
);
const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../api/fixtures.json"), "utf8"),
);
const routes = {
    bootstrap: "/mobile/bootstrap",
    dashboard: "/dashboard",
    users: "/users",
    list_context: "/mobile/users/list-context",
    target: "/mobile/users/{user}/context",
    creation: "/mobile/users/create-context",
    access: "/mobile/users/{user}/access",
    roles: "/roles",
    role: "/roles/{role}",
    audit: "/audit",
    inbox: "/notifications",
    settings: "/settings",
    sessions: "/profile/mobile-sessions",
    web_sessions: "/profile/sessions",
    keys: "/keys",
    preferences: "/profile/preferences",
    preference_write: "/profile/preferences",
    profile: "/profile",
    profile_write: "/profile/details",
    security_email_write: "/profile/notification-preferences",
    configuration: "/mobile/config",
    push_preferences: "/mobile/push/preferences",
    push_registration: "/mobile/devices",
    push_destination: "/mobile/notifications/{id}/destination",
};
Object.assign(
    fixtures,
    JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "../api/push-fixtures.json"),
            "utf8",
        ),
    ),
);
const results = [];
for (const [key, suffix] of Object.entries(routes)) {
    if (!(key in fixtures)) {
        results.push({
            key,
            path: suffix,
            pass: false,
            error: "Missing required actual-response fixture",
        });
        continue;
    }
    const method = ["profile_write", "push_registration"].includes(key)
        ? "post"
        : ["preference_write", "security_email_write"].includes(key)
          ? "patch"
          : "get";
    const endpoint = spec.paths["/v1" + suffix]?.[method];
    const schema =
        endpoint?.responses?.["200"]?.content?.["application/json"]?.schema;
    if (!schema) {
        results.push({
            key,
            method,
            path: suffix,
            pass: false,
            error: "Missing JSON success schema",
        });
        continue;
    }
    const ajv = new Ajv({
        allErrors: true,
        unknownFormats: "ignore",
        strictKeywords: false,
    });
    const validate = ajv.compile({ ...schema, components: spec.components });
    const pass = validate(fixtures[key]);
    results.push({ key, method, path: suffix, pass, errors: validate.errors });
}
const sourceRoot = path.join(__dirname, "../src");
const source = [];
const collect = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory() && item.name !== "generated") collect(file);
        else if (/\.tsx?$/.test(item.name))
            source.push(fs.readFileSync(file, "utf8"));
    }
};
collect(sourceRoot);
const used = new Map();
for (const text of source)
    for (const match of text.matchAll(
        /api\.(GET|POST|PUT|PATCH|DELETE)\([\s\n]*["']([^"']+)["']/g,
    ))
        used.set(match[1] + match[2], [match[1].toLowerCase(), match[2]]);
const fallbacks = [];
for (const [method, route] of used.values()) {
    const endpoint = spec.paths[route]?.[method];
    if (!endpoint) {
        fallbacks.push({ method, route, reason: "missing endpoint" });
        continue;
    }
    for (const [status, response] of Object.entries(endpoint.responses ?? {})) {
        if (!/^2\d\d$/.test(status)) continue;
        const schema = response.content?.["application/json"]?.schema;
        if (schema?.type === "string" && !schema.format)
            fallbacks.push({
                method,
                route,
                status,
                reason: "untyped JSON string success",
            });
    }
}
console.log(
    JSON.stringify(
        {
            fixtureResults: results,
            mobileEndpoints: used.size,
            untypedSuccessResponses: fallbacks,
        },
        null,
        2,
    ),
);
if (results.some((result) => !result.pass) || fallbacks.length)
    process.exitCode = 1;
