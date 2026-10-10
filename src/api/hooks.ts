import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSession } from "@/auth/session";
import { scopedKey } from "./query";
import { uniqueRows } from "@/utils/layout";

export function useSearch() {
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        const timer = setTimeout(
            () => setDebounced(search.trim().length >= 3 ? search.trim() : ""),
            300,
        );
        return () => clearTimeout(timer);
    }, [search]);
    return { search, setSearch, debounced };
}
export function useRead<T>(
    module: string,
    criteria: unknown,
    read: (signal: AbortSignal) => Promise<T>,
    permitted = true,
) {
    const { bootstrap, phase } = useSession();
    return useQuery({
        queryKey: scopedKey(bootstrap, module, criteria),
        queryFn: ({ signal }) => read(signal),
        enabled: phase === "ready" && permitted,
    });
}
type Page<T> = {
    data: T[];
    meta?: { current_page: number; last_page: number; total?: number };
    current_page?: number;
    last_page?: number;
};
export type ReadPolicy = {
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
};
export function usePages<T extends { id: string }>(
    module: string,
    criteria: unknown,
    read: (page: number, signal: AbortSignal) => Promise<Page<T>>,
    permitted = true,
    policy: ReadPolicy = {},
) {
    const { bootstrap, phase } = useSession();
    const query = useInfiniteQuery({
        queryKey: scopedKey(bootstrap, module, criteria),
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) => read(pageParam, signal),
        enabled: phase === "ready" && permitted,
        refetchOnWindowFocus: policy.refetchOnWindowFocus,
        refetchOnReconnect: policy.refetchOnReconnect,
        getNextPageParam: (page) => {
            const current = page.meta?.current_page ?? page.current_page ?? 1;
            const last = page.meta?.last_page ?? page.last_page ?? current;
            return current < last ? current + 1 : undefined;
        },
    });
    return { ...query, rows: uniqueRows(query.data?.pages ?? []) };
}
