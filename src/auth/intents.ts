import { useSyncExternalStore } from "react";
import { parseIntent, type MobileIntent } from "@/utils/links";

// One process-memory intent. Do not persist, log, or pass recovery secrets to router state.
let pending: MobileIntent | null = null;
let resetNotice = false;
export function markResetComplete() {
    resetNotice = true;
}
export function takeResetNotice() {
    const previous = resetNotice;
    resetNotice = false;
    return previous;
}
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
export const currentIntent = () => pending;
export function discardIntent(expected: MobileIntent) {
    if (pending !== expected) return;
    pending = null;
    listeners.forEach((listener) => listener());
}
export function receiveIntent(path: string, scheme: string, webBase: string) {
    pending = parseIntent(path, scheme, webBase);
    listeners.forEach((listener) => listener());
    return pending?.kind === "record"
        ? "/intent"
        : pending?.kind === "reset"
          ? "/(auth)/reset-password"
          : pending?.kind === "verify"
            ? "/(auth)/verify-email"
            : "/unavailable";
}
export function useIntent() {
    return useSyncExternalStore(subscribe, currentIntent, () => null);
}
