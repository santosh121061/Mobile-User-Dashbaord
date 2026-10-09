export type PrivateWork = {
    signal: AbortSignal;
    isCurrent: () => boolean;
    assertCurrent: () => void;
    release: () => void;
    cancel: () => void;
};
export function cancelledWork() {
    const error = new Error("Session action cancelled");
    error.name = "AbortError";
    return error;
}
export function createPrivateWork(
    current: () => boolean,
    onRelease: () => void,
): PrivateWork {
    const controller = new AbortController();
    let released = false;
    const isCurrent = () =>
        !released && !controller.signal.aborted && current();
    return {
        signal: controller.signal,
        isCurrent,
        assertCurrent: () => {
            if (!isCurrent()) throw cancelledWork();
        },
        cancel: () => controller.abort(),
        release: () => {
            released = true;
            controller.abort();
            onRelease();
        },
    };
}
