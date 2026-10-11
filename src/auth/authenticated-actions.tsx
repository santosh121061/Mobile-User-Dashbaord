import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "./session";
import { cancelledWork, type PrivateWork } from "./private-work";
import { Button, ErrorState, Label } from "@/components/ui";
import { t } from "@/localization";
import { Sheet } from "@/components/sheet";
type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";
type RunAuthenticatedAction = <T>(
  method: MutationMethod,
  path: string,
  action: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
  requiresConfirmation?: boolean,
) => Promise<T>;
type ActionExecution = {
  scope: PrivateWork;
  action: (signal: AbortSignal) => Promise<unknown>;
  resolve: (result: unknown) => void;
  reject: (failure: unknown) => void;
  unsubscribe: () => void;
};
const actionContext = createContext<RunAuthenticatedAction | null>(null);
export function AuthenticatedActionProvider({
  children,
}: React.PropsWithChildren) {
  const { refresh, captureWork, phase } = useSession();
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    method: MutationMethod;
    path: string;
  } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false),
    [confirmationError, setConfirmationError] = useState<unknown>(null);
  const activeActionRef = useRef<ActionExecution | null>(null);
  const isMountedRef = useRef(true);
  const cancelAction = useCallback(() => {
    const cancelledAction = activeActionRef.current;
    activeActionRef.current = null;
    cancelledAction?.unsubscribe();
    cancelledAction?.scope.release();
    cancelledAction?.reject(cancelledWork());
    if (isMountedRef.current) {
      setPendingConfirmation(null);
      setConfirmationError(null);
      setIsExecuting(false);
    }
  }, []);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelAction();
    };
  }, [cancelAction]);
  useEffect(() => {
    if (
      [
        "locked",
        "signedOut",
        "unavailable",
        "loggingOut",
        "storageBlocked",
      ].includes(phase)
    )
      cancelAction();
  }, [phase, cancelAction]);
  const runAction: RunAuthenticatedAction = (
    method,
    path,
    action,
    callerSignal,
    requiresConfirmation = method === "DELETE",
  ) =>
    new Promise((resolve, reject) => {
      if (callerSignal?.aborted) {
        reject(cancelledWork());
        return;
      }
      if (activeActionRef.current) {
        reject(new Error("An action is already pending"));
        return;
      }
      let scope: PrivateWork;
      try {
        scope = captureWork();
      } catch (failure) {
        reject(failure);
        return;
      }
      const abort = () => {
        if (activeActionRef.current?.scope === scope) cancelAction();
      };
      activeActionRef.current = {
        scope,
        action,
        resolve: (result) =>
          resolve(result as Awaited<ReturnType<typeof action>>),
        reject,
        unsubscribe: () => {
          scope.signal.removeEventListener("abort", abort);
          callerSignal?.removeEventListener("abort", abort);
        },
      };
      scope.signal.addEventListener("abort", abort);
      callerSignal?.addEventListener("abort", abort);
      if (scope.signal.aborted || callerSignal?.aborted) {
        cancelAction();
        return;
      }
      setConfirmationError(null);
      if (requiresConfirmation) setPendingConfirmation({ method, path });
      else void executeAction(activeActionRef.current, false);
    });
  const executeAction = async (
    activeAction: ActionExecution,
    revalidateSession: boolean,
  ) => {
    setIsExecuting(true);
    setConfirmationError(null);
    let didDispatch = false;
    try {
      if (revalidateSession) await refresh();
      activeAction.scope.assertCurrent();
      if (activeActionRef.current !== activeAction) return;
      didDispatch = true;
      const result = await activeAction.action(activeAction.scope.signal);
      activeAction.scope.assertCurrent();
      if (activeActionRef.current !== activeAction) return;
      activeActionRef.current = null;
      activeAction.unsubscribe();
      activeAction.scope.release();
      activeAction.resolve(result);
      setPendingConfirmation(null);
    } catch (failure) {
      if (activeActionRef.current === activeAction) {
        if (
          !revalidateSession ||
          didDispatch ||
          !activeAction.scope.isCurrent()
        ) {
          activeActionRef.current = null;
          activeAction.unsubscribe();
          activeAction.scope.release();
          activeAction.reject(failure);
          setPendingConfirmation(null);
        } else setConfirmationError(failure);
      }
    } finally {
      if (
        isMountedRef.current &&
        (!activeActionRef.current || activeActionRef.current === activeAction)
      )
        setIsExecuting(false);
    }
  };
  const confirmDestructiveAction = () => {
    const activeAction = activeActionRef.current;
    if (pendingConfirmation && activeAction && !isExecuting)
      return executeAction(activeAction, true);
  };
  return (
    <actionContext.Provider value={runAction}>
      {children}
      {pendingConfirmation && (
        <Sheet
          title={t("confirm")}
          close={cancelAction}
          closeDisabled={isExecuting}
        >
          <Label tone="secondary">{t("confirmHint")}</Label>
          {!!confirmationError && <ErrorState error={confirmationError} />}
          <Button
            testID="confirm-action"
            label={t("confirm")}
            onPress={() => void confirmDestructiveAction()}
            loading={isExecuting}
          />
          <Button
            variant="secondary"
            label={t("cancel")}
            onPress={cancelAction}
            disabled={isExecuting}
          />
        </Sheet>
      )}
    </actionContext.Provider>
  );
}
export function useAuthenticatedAction() {
  const dispatchAction = useContext(actionContext);
  const callerLifetimeRef = useRef(new AbortController());
  useEffect(() => {
    if (callerLifetimeRef.current.signal.aborted)
      callerLifetimeRef.current = new AbortController();
    const lifetime = callerLifetimeRef.current;
    return () => lifetime.abort();
  }, []);
  const runAction = useCallback<RunAuthenticatedAction>(
    (method, path, action, callerSignal, requiresConfirmation) => {
      if (!dispatchAction)
        return Promise.reject(
          new Error("Authenticated action provider missing"),
        );
      const controller = new AbortController();
      const ownerSignal = callerLifetimeRef.current.signal;
      const abort = () => controller.abort();
      ownerSignal.addEventListener("abort", abort);
      callerSignal?.addEventListener("abort", abort);
      if (ownerSignal.aborted || callerSignal?.aborted) abort();
      return dispatchAction(
        method,
        path,
        action,
        controller.signal,
        requiresConfirmation,
      ).finally(() => {
        ownerSignal.removeEventListener("abort", abort);
        callerSignal?.removeEventListener("abort", abort);
      });
    },
    [dispatchAction],
  );
  if (!dispatchAction) throw new Error("Authenticated action provider missing");
  return runAction;
}
