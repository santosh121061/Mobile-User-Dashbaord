// No API calls, credentials, tokens or customer data are logged by this script.
/* global MAESTRO_ISOLATED, MAESTRO_APP_ID, MAESTRO_FIXTURE_API, MAESTRO_OWNER_EMAIL, MAESTRO_VIEWER_EMAIL, MAESTRO_EXPIRY_EMAIL, MAESTRO_CREATE_EMAIL, MAESTRO_PASSWORD */
if (typeof MAESTRO_ISOLATED === "undefined" || MAESTRO_ISOLATED !== "true") {
    throw new Error(
        "Explicit isolated fixture mode is required before app launch.",
    );
}
if (
    typeof MAESTRO_APP_ID === "undefined" ||
    MAESTRO_APP_ID !== "com.example.userdashboard.dev"
) {
    throw new Error(
        "These flows only target the known development app identifier.",
    );
}
if (
    typeof MAESTRO_FIXTURE_API === "undefined" ||
    !/^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2):9082\/api\/?$/.test(
        MAESTRO_FIXTURE_API,
    )
) {
    throw new Error("Only the documented guarded local API is allowed.");
}
if (
    typeof MAESTRO_OWNER_EMAIL === "undefined" ||
    MAESTRO_OWNER_EMAIL !== "mobile-owner@example.test" ||
    typeof MAESTRO_VIEWER_EMAIL === "undefined" ||
    MAESTRO_VIEWER_EMAIL !== "mobile-viewer@example.test" ||
    typeof MAESTRO_EXPIRY_EMAIL === "undefined" ||
    MAESTRO_EXPIRY_EMAIL !== "mobile-expiry@example.test" ||
    typeof MAESTRO_CREATE_EMAIL === "undefined" ||
    !/^maestro-[a-z0-9-]+@example\.test$/.test(MAESTRO_CREATE_EMAIL) ||
    typeof MAESTRO_PASSWORD === "undefined" ||
    MAESTRO_PASSWORD !== "Synthetic!Mobile2026"
) {
    throw new Error(
        "Only the documented synthetic local fixtures may be used.",
    );
}
