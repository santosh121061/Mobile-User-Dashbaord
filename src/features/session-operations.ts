import { useSyncExternalStore } from "react";
import { useSession } from "@/auth/session";
import type { PrivateWork } from "@/auth/private-work";
import type { Bootstrap } from "@/api/runtime";
import { apiUrl } from "@/config/environment";

export type OperationSource =
  "users" | "roles" | "audit" | "notifications" | "keys" | "bulk";
type Entry = {
  id: string;
  source: OperationSource;
  owner: string;
  scope: PrivateWork;
  detach: () => void;
};
const limit = 20;
let entries: readonly Entry[] = [];
const listeners = new Set<() => void>();
const ownerKey = (snapshot: Bootstrap) =>
  [
    apiUrl,
    snapshot.account.id,
    snapshot.access_revision,
    snapshot.configuration_revision,
        snapshot.availability_revision,
  ].join(":");
const emit = () => listeners.forEach((listener) => listener());
const dispose = (entry: Entry) => {
  entry.detach();
  entry.scope.release();
};
const remove = (id: string) => {
  const old = entries.find((entry) => entry.id === id);
  if (!old) return;
  entries = entries.filter((entry) => entry !== old);
  dispose(old);
  emit();
};

/** Only IDs returned by actual job creation are remembered, never signed URLs or job payloads. */
export function rememberOperation(
  id: string,
  source: OperationSource,
  snapshot: Bootstrap,
  captureWork: () => PrivateWork,
) {
  const owner = ownerKey(snapshot);
  if (entries.some((entry) => entry.owner === owner && entry.id === id)) return;
  const scope = captureWork();
  scope.assertCurrent();
  const removed = entries.filter((entry) => entry.owner !== owner);
  entries = entries.filter((entry) => entry.owner === owner);
  removed.forEach(dispose);
  const cancel = () => remove(id);
  scope.signal.addEventListener("abort", cancel, { once: true });
  const entry: Entry = {
    id,
    source,
    owner,
    scope,
    detach: () => scope.signal.removeEventListener("abort", cancel),
  };
  const previous = entries;
  entries = [entry, ...previous].slice(0, limit);
  previous.filter((old) => !entries.includes(old)).forEach(dispose);
  emit();
}

export function clearSessionOperations() {
  const old = entries;
  entries = [];
  old.forEach(dispose);
  emit();
}

export function useSessionOperations() {
  const { bootstrap, phase } = useSession();
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => entries,
    () => entries,
  );
  return phase === "ready" && bootstrap
    ? snapshot
        .filter(
          (entry) =>
            entry.owner === ownerKey(bootstrap) && entry.scope.isCurrent(),
        )
        .map(({ id, source }) => ({ id, source }))
    : [];
}
