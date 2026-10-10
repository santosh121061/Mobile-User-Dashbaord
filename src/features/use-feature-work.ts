import { useEffect, useRef, useState } from "react";
import { useSession } from "@/auth/session";
import type { PrivateWork } from "@/auth/private-work";

/** Bind feature callbacks, picker results and messages to the shared session fence. */
export function useFeatureWork() {
  const session = useSession();
  const active = useRef<PrivateWork | null>(null);
  const detach = useRef(() => {});
  const identity = [
    session.bootstrap &&
    (session.phase === "ready" || session.phase === "checking")
      ? "active"
      : session.phase,
    session.bootstrap?.account.id,
    session.bootstrap?.access_revision,
    session.bootstrap?.configuration_revision,
  ].join(":");
  const [status, setStatus] = useState<{
    identity: string;
    busy: boolean;
    error: unknown;
  }>({ identity, busy: false, error: null });
  useEffect(() => {
    return () => {
      detach.current();
      active.current?.cancel();
      active.current?.release();
      active.current = null;
    };
  }, [identity]);
  const run = async (
    action: (scope: PrivateWork) => Promise<void>,
    failed?: (error: unknown) => void,
  ) => {
    if (active.current || session.phase !== "ready") return;
    let scope: PrivateWork;
    try {
      scope = session.captureWork();
    } catch {
      return;
    }
    active.current = scope;
    const abort = () => {
      if (active.current === scope)
        setStatus((old) =>
          old.identity === identity ? { ...old, busy: false } : old,
        );
    };
    scope.signal.addEventListener("abort", abort, { once: true });
    detach.current = () => scope.signal.removeEventListener("abort", abort);
    setStatus({ identity, busy: true, error: null });
    try {
      await action(scope);
    } catch (failure) {
      if (active.current === scope && scope.isCurrent()) {
        setStatus({ identity, busy: false, error: failure });
        failed?.(failure);
      }
    } finally {
      scope.signal.removeEventListener("abort", abort);
      if (active.current === scope) {
        if (scope.isCurrent()) setStatus((old) => ({ ...old, busy: false }));
        active.current = null;
      }
      scope.release();
    }
  };
  return {
    busy: status.identity === identity && status.busy,
    error: status.identity === identity ? status.error : null,
    run,
  };
}
