import { useAuthenticatedAction } from "@/auth/authenticated-actions";
import type { PrivateWork } from "@/auth/private-work";

/** Keep writes tied to their owning screen; request consent only for destructive actions. */
export function useFeatureAction() {
  const runAction = useAuthenticatedAction();
  return <T>(
    scope: PrivateWork,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    action: (signal: AbortSignal) => Promise<T>,
    requiresConfirmation?: boolean,
  ) =>
    runAction(
      method,
      path,
      (signal) => {
        scope.assertCurrent();
        return action(signal);
      },
      scope.signal,
      requiresConfirmation,
    );
}
