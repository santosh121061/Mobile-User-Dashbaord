import createClient from "openapi-fetch";
import { Platform } from "react-native";
import { nativeApplicationVersion } from "expo-application";
import Constants from "expo-constants";
import { z } from "zod";
import { apiUrl } from "@/config/environment";
import type { paths } from "./generated/schema";

let credential: () => string | null = () => null;
let unauthorized: () => void = () => {};
let forbidden: (path: string) => void = () => {};
const requestCredentials = new WeakMap<Request, string | null>();
const responseCredentials = new WeakMap<Response, string | null>();
// Enforce read deadlines at dispatch, including manual invalidation/refetch.
// They belong only to the current credential and exact resource URL.
const readDeadlines = new Map<string, ApiError>();
let overflowDeadline: ApiError | undefined;
let deadlineCredential: string | null | undefined;
function syncReadDeadlines(token: string | null) {
    if (deadlineCredential !== token) {
        readDeadlines.clear();
        overflowDeadline = undefined;
        deadlineCredential = token;
    }
    for (const [url, error] of readDeadlines)
        if (!readRetryDelay(error)) readDeadlines.delete(url);
    if (!readRetryDelay(overflowDeadline)) overflowDeadline = undefined;
}
export function retryAfterSeconds(value: string | null, now = Date.now()) {
    if (!value) return undefined;
    if (/^\d+$/.test(value.trim())) {
        const seconds = Number(value);
        return Number.isFinite(seconds) ? seconds : undefined;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
        ? Math.max(0, Math.ceil((timestamp - now) / 1000))
        : undefined;
}
export function readRetryDelay(error: unknown) {
    return error instanceof ApiError && error.retryAt !== undefined
        ? Math.max(0, error.retryAt - Date.now())
        : 0;
}
export function attachSession(
    read: () => string | null,
    expire: () => void,
    refresh: (path: string) => void,
) {
    credential = read;
    readDeadlines.clear();
    overflowDeadline = undefined;
    deadlineCredential = undefined;
    unauthorized = expire;
    forbidden = refresh;
    return () => {
        if (credential !== read) return false;
        credential = () => null; unauthorized = () => {}; forbidden = () => {};
        readDeadlines.clear();
        overflowDeadline = undefined;
        deadlineCredential = undefined;
        return true;
    };
}
/** Narrow logout transport: only the captured current session can be revoked while the UI is locked. */
export async function revokeCurrentSession(token: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
        const response = await fetch(new Request(apiUrl+'/v1/token',{method:'DELETE',headers:{Accept:'application/json',Authorization:'Bearer '+token},signal:controller.signal}));
        if(!response.ok && response.status!==401) throw new Error('Remote revocation unavailable');
    } finally {clearTimeout(timeout);}
}
/** Bounded unlink uses only this invocation's captured bearer; no offline cleanup credential. */
export async function unlinkCurrentPushSession(token: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(new Request(apiUrl + '/v1/mobile/devices/current', {
            method: 'DELETE', headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }, signal: controller.signal,
        }));
        if (!response.ok && response.status !== 401) throw new Error('Remote device unlink unavailable');
    } finally { clearTimeout(timeout); }
}
export class ApiError extends Error {
    readonly retryAt?: number;
    constructor(
        public status: number,
        public fields: Record<string, string[]>,
        public requestId: string | null,
        public code?: string,
        public retryAfter?: number,
        public serverMessage?: string,
    ) {
        super("API request failed");
        if (status === 429) this.retryAfter ??= 60;
        retryAfter = this.retryAfter;
        if ([429, 503].includes(status) && retryAfter !== undefined)
            this.retryAt = Date.now() + Math.max(0, retryAfter) * 1000;
    }
}
export class ApiTransportError extends Error {
    constructor(
        public reason: "network" | "timeout" | "cancelled" | "tls",
        public cause: unknown,
    ) {
        super("API transport failed");
    }
}
function secureTransportFailure(failure: unknown) {
    let cause = failure;
    for (let depth = 0; depth < 8 && cause && typeof cause === "object"; depth++) {
        const details = cause as { message?: unknown; code?: unknown; cause?: unknown };
        const message = [details.message, details.code]
            .filter((value): value is string => typeof value === "string").join(" ");
        if (/certificate|certpath|cert_path|sslhandshake|ssl handshake|tls.*(?:handshake|protocol|alert)|protocol_version|EPROTO|ERR_SSL|SSL_ERROR/i.test(message))
            return true;
        cause = details.cause;
    }
    return false;
}
export const api = createClient<paths>({
    baseUrl: apiUrl,
    fetch: async (request: Request) => {
        const abort = new AbortController();
        const cancel = () => abort.abort();
        let timedOut = false;
        request.signal.addEventListener("abort", cancel);
        if (request.signal.aborted) cancel();
        const timeout = setTimeout(() => {
            timedOut = true;
            cancel();
        }, 15000);
        try {
            // Request construction is app work. Only a dispatched fetch failure
            // is a transport failure; do not label polyfill errors as connectivity.
            const sending = new Request(request, { signal: abort.signal });
            try {
                return await fetch(sending);
            } catch (failure) {
                throw new ApiTransportError(
                    timedOut ? "timeout" : request.signal.aborted ? "cancelled"
                        : secureTransportFailure(failure) ? "tls" : "network",
                    failure,
                );
            }
        } finally {
            clearTimeout(timeout);
            request.signal.removeEventListener("abort", cancel);
        }
    },
});
api.use({
    onRequest({ request }) {
        request.headers.set("Accept", "application/json");
        request.headers.set("X-App-Platform", Platform.OS);
        request.headers.set("X-App-Version", nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.0");
        const token = credential();
        syncReadDeadlines(token);
        if (request.method === "GET") {
            const waiting = overflowDeadline ?? readDeadlines.get(request.url);
            if (waiting && readRetryDelay(waiting)) throw waiting;
        }
        requestCredentials.set(request, token);
        if (token) request.headers.set("Authorization", "Bearer " + token);
        return request;
    },
    onResponse({ request, response }) {
        const sent = requestCredentials.get(request) ?? null;
        responseCredentials.set(response, sent);
        if (request.method === "GET" && sent === credential()) {
            syncReadDeadlines(sent);
            const seconds = retryAfterSeconds(response.headers.get("Retry-After"));
            const delay = response.status === 429 ? (seconds ?? 60) : seconds;
            if (
                [429, 503].includes(response.status) &&
                delay !== undefined && delay > 0
            ) {
                const error = new ApiError(
                    response.status, {}, response.headers.get("X-Request-Id"),
                    undefined, delay,
                );
                if (readDeadlines.size >= 200 && !readDeadlines.has(request.url)) {
                    // A pathological URL fan-out must not evict a live deadline.
                    if (readRetryDelay(error) > readRetryDelay(overflowDeadline))
                        overflowDeadline = error;
                } else if (
                    readRetryDelay(error) > readRetryDelay(readDeadlines.get(request.url))
                ) readDeadlines.set(request.url, error);
            }
        }
        if (response.status === 401 && sent !== null && sent === credential()) unauthorized();
        // This middleware observes the response without replacing it. Expo 57's
        // native FetchResponse does not extend the global WHATWG Response class.
    },
});
const errorSchema = z.object({
    code: z.string().optional(),
    message: z.string().max(4096).optional(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
});
export function unwrap<T>(
    result: { data?: unknown; error?: unknown; response: Response },
    schema: z.ZodType<T>,
): T {
    if (!result.response.ok) {
        const parsed = errorSchema.safeParse(result.error);
        const code = parsed.success ? parsed.data.code : undefined;
        if (
            responseCredentials.get(result.response) === credential() && (
            (result.response.status === 403 &&
                code !== "MOBILE_REAUTH_REQUIRED") ||
            result.response.status === 404
            )
        )
            forbidden(
                result.response.url
                    ? new URL(result.response.url).pathname
                    : "unknown",
            );
        throw new ApiError(
            result.response.status,
            parsed.success ? (parsed.data.errors ?? {}) : {},
            result.response.headers.get("X-Request-Id"),
            code,
            retryAfterSeconds(result.response.headers.get("Retry-After")) ??
                (result.response.status === 429 ? 60 : undefined),
            parsed.success ? parsed.data.message : undefined,
        );
    }
    return schema.parse(result.data);
}
export function check(result: {
    data?: unknown;
    error?: unknown;
    response: Response;
}) {
    unwrap(result, z.unknown());
}
