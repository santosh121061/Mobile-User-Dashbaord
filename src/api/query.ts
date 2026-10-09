import { QueryClient } from "@tanstack/react-query";
import { ApiError, readRetryDelay } from "./client";
import type { Bootstrap } from "./runtime";
import { apiUrl } from "@/config/environment";
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 20000,
            gcTime: 120000,
            retry: (attempt, error) =>
                attempt < 2 &&
                !(error instanceof ApiError && error.status < 500),
            retryDelay: (attempt, error) =>
                Math.max(readRetryDelay(error), Math.min(1000 * 2 ** attempt, 10000)),
        },
        mutations: { retry: false },
    },
});
export function queryKey(
    bootstrap: Bootstrap,
    module: string,
    criteria: unknown = null,
) {
    return [
        apiUrl,
        bootstrap.account.id,
        bootstrap.access_revision,
        bootstrap.configuration_revision,
        module,
        criteria,
    ] as const;
}
export function scopedKey(
    bootstrap: Bootstrap | null,
    module: string,
    criteria: unknown = null,
) {
    return bootstrap
        ? queryKey(bootstrap, module, criteria)
        : [apiUrl, "signedOut", module, criteria];
}
