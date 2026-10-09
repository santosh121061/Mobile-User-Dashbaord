import { useConfirmation } from "@/auth/confirmation";
import type { PrivateWork } from "@/auth/private-work";

/** Link the owning screen's work to the shared password dialog and write. */
export function useFeatureConfirmation() {
    const confirm = useConfirmation();
    return <T>(
        scope: PrivateWork,
        method: "POST" | "PUT" | "PATCH" | "DELETE",
        path: string,
        action: (approval: string, signal: AbortSignal) => Promise<T>,
    ) =>
        confirm(
            method,
            path,
            (approval, signal) => {
                scope.assertCurrent();
                return action(approval, signal);
            },
            scope.signal,
        );
}
