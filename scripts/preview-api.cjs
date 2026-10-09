// Local UI review only. Synthetic contract fixtures; no database or production API.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../api/fixtures.json"), "utf8"),
);
const token = "synthetic-local-preview-only";
const expires = new Date(Date.now() + 12 * 3600000).toISOString();
const bootstrap = structuredClone(fixtures.bootstrap);
bootstrap.data.expires_at = expires;
bootstrap.data.session_needs_sync = false;
bootstrap.data.account.name = "Synthetic Preview Administrator";
const origins = new Set(["http://localhost:8081", "http://127.0.0.1:8081"]);
const map = {
    "/mobile/bootstrap": "bootstrap",
    "/dashboard": "dashboard",
    "/users": "users",
    "/mobile/users/list-context": "list_context",
    "/mobile/users/create-context": "creation",
    "/roles": "roles",
    "/audit": "audit",
    "/notifications": "inbox",
    "/settings": "settings",
    "/profile/mobile-sessions": "sessions",
    "/profile/sessions": "web_sessions",
    "/keys": "keys",
};
http.createServer(async (request, response) => {
    if (origins.has(request.headers.origin))
        response.setHeader(
            "Access-Control-Allow-Origin",
            request.headers.origin,
        );
    response.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type,X-App-Platform,X-Mobile-Step-Up",
    );
    response.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json");
    const send = (status, data) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
    };
    if (request.method === "OPTIONS") return send(204, undefined);
    const route = new URL(request.url, "http://127.0.0.1").pathname.replace(
        /^\/api\/v1/,
        "",
    );
    if (route === "/mobile/config")
        return send(200, { data: { features: bootstrap.data.features } });
    let raw = "";
    for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 16384) return send(413, {});
    }
    let body;
    try {
        body = raw ? JSON.parse(raw) : {};
    } catch {
        return send(422, {});
    }
    if (route === "/auth/login" && request.method === "POST")
        return body.email === "preview@example.test" &&
            body.password === "Preview!Local2026"
            ? send(200, {
                  access_token: token,
                  token_type: "Bearer",
                  expires_at: expires,
              })
            : send(422, {
                  errors: {
                      email: ["Use the documented synthetic preview account."],
                  },
              });
    if (request.headers.authorization !== "Bearer " + token)
        return send(401, {});
    if (route === "/token" && request.method === "DELETE")
        return send(204, undefined);
    if (route === "/profile/preferences" && request.method === "PATCH") {
        for (const key of ["theme", "timezone", "date_format"])
            if (body[key]) bootstrap.data.appearance[key] = body[key];
        return send(200, { data: bootstrap.data.appearance });
    }
    if (request.method !== "GET")
        return send(405, {
            message:
                "Synthetic UI preview does not execute business mutations.",
        });
    if (route === "/mobile/bootstrap") return send(200, bootstrap);
    if (route === "/profile/preferences")
        return send(200, { data: bootstrap.data.appearance });
    if (route === "/profile")
        return send(200, {
            data: {
                ...fixtures.profile.data,
                ...bootstrap.data.account,
                appearance: bootstrap.data.appearance,
            },
        });
    if (route === "/notifications/summary")
        return send(200, { data: { unread: 1 } });
    const key =
        map[route] ??
        (/^\/mobile\/users\/\d+\/context$/.test(route)
            ? "target"
            : /^\/mobile\/users\/\d+\/access$/.test(route)
              ? "access"
              : /^\/roles\/\d+$/.test(route)
                ? "role"
                : null);
    return key ? send(200, fixtures[key]) : send(404, {});
}).listen(9081, "127.0.0.1", () =>
    console.log(
        "Synthetic preview API on http://127.0.0.1:9081/api; preview@example.test / Preview!Local2026. No database accessed.",
    ),
);
