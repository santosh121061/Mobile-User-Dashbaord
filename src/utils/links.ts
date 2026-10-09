export function routeForIntent(
    path: string,
    scheme = "userdashboard-dev",
): string {
    try {
        if (path.includes("..") || /%(?:2f|5c|2e)/i.test(path))
            return "/unavailable";
        let route = path;
        if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
            const url = new URL(path);
            if (
                url.protocol !== scheme + ":" ||
                url.username ||
                url.password ||
                url.search ||
                url.hash
            )
                return "/unavailable";
            route = "/" + url.host + url.pathname;
        }
        if (
            /^\/(?:users|roles|activity)\/[1-9][0-9]*$/.test(route) ||
            /^\/(?:notifications|profile)$/.test(route)
        )
            return route;
        return "/unavailable";
    } catch {
        return "/unavailable";
    }
}

export type MobileIntent =
    | { kind: "record"; route: string }
    | { kind: "reset"; email: string; token: string }
    | { kind: "verify"; url: string };

/** Parse only the configured application's routes. Secrets never become router parameters. */
export function parseIntent(
    path: string,
    scheme: string,
    webBase: string,
    now = Date.now(),
): MobileIntent | null {
    if (
        path.length > 2048 ||
        path.includes("..") ||
        /[\\\u0000-\u001f]/.test(path) ||
        /%(?:2f|5c|2e)/i.test(path)
    )
        return null;
    try {
        const base = new URL(webBase);
        const url = new URL(path, base.origin);
        const custom = url.protocol === scheme + ":";
        if (
            url.username ||
            url.password ||
            url.hash ||
            (!custom && url.origin !== base.origin)
        )
            return null;
        const route = custom ? "/" + url.host + url.pathname : url.pathname;
        if (route.includes("..")) return null;
        if (!url.search) {
            const safe = routeForIntent(route, scheme);
            return safe === "/unavailable"
                ? null
                : { kind: "record", route: safe };
        }
        const unique = (keys: string[]) =>
            [...url.searchParams.keys()].length === keys.length &&
            keys.every((key) => url.searchParams.getAll(key).length === 1);
        const reset = /^\/reset-password\/([a-f0-9]{64})$/i.exec(route);
        const email = url.searchParams.get("email");
        if (
            reset &&
            unique(["email"]) &&
            email &&
            email.length <= 254 &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return { kind: "reset", email, token: reset[1]! };
        }
        if (
            !custom &&
            /^\/email\/verify\/[1-9][0-9]*\/[a-f0-9]{40}$/i.test(route) &&
            unique(["expires", "signature"])
        ) {
            const expires = url.searchParams.get("expires")!;
            const signature = url.searchParams.get("signature")!;
            if (
                /^[0-9]{10}$/.test(expires) &&
                Number(expires) * 1000 > now &&
                /^[a-f0-9]{64}$/i.test(signature)
            )
                return { kind: "verify", url: url.toString() };
        }
        return null;
    } catch {
        return null;
    }
}

export function permitsIntent(
    route: string,
    snapshot: {
        modules: Record<string, boolean>;
        features: Record<string, boolean>;
    },
) {
    const module = /^\/users\//.test(route)
        ? "users"
        : /^\/roles\//.test(route)
          ? "roles"
          : /^\/activity\//.test(route)
            ? "activity"
            : route === "/notifications"
              ? "notifications"
              : route === "/profile"
                ? "account"
                : null;
    return (
        !!module &&
        !!snapshot.features["api.enabled"] &&
        !!snapshot.modules[module] &&
        (module !== "notifications" ||
            !!snapshot.features["notifications.in_app.enabled"]) &&
        (module !== "activity" || !!snapshot.features["audit.capture.enabled"])
    );
}
