import { useSyncExternalStore } from "react";
import { notificationId } from "./contracts";

let pending: string | null = null;
const listeners = new Set<() => void>();
export function receivePushIntent(data: unknown) {
    const id = notificationId(data);
    if (!id) return;
    pending = id;
    listeners.forEach((listener) => listener());
}
export function discardPushIntent(expected?: string) {
    if (expected !== undefined && pending !== expected) return;
    pending = null;
    listeners.forEach((listener) => listener());
}
export function usePushIntent() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        () => pending,
        () => null,
    );
}
