import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api, ApiError, readRetryDelay, unwrap } from "@/api/client";
import { operationSchema } from "@/api/contracts";
import { scopedKey } from "@/api/query";
import { useSession } from "@/auth/session";

export type OperationState = z.infer<typeof operationSchema>;

export function operationPollDelay(
  status: OperationState["status"] | undefined,
  updates: number,
  error: unknown,
): number | false {
  if (!status || !["queued", "running"].includes(status)) return false;
  if (error instanceof ApiError && [401, 403, 404, 410].includes(error.status))
    return false;
  const backoff = Math.min(
    30000,
    2000 * 2 ** Math.min(Math.max(0, updates - 1), 4),
  );
  return Math.max(backoff, readRetryDelay(error));
}

/** The detail polls; the bounded Reports collection requests status snapshots only. */
export function useOperation(id: string, poll = true, permitted = true) {
  const { bootstrap, phase } = useSession();
  return useQuery({
    queryKey: scopedKey(bootstrap, "operation", id),
    queryFn: async ({ signal }) => {
      const operation = unwrap(
        await api.GET("/v1/operations/{id}", {
          params: { path: { id } },
          signal,
        }),
        operationSchema,
      );
      if (operation.id !== id) throw new Error("Unexpected operation response");
      return operation;
    },
    enabled: phase === "ready" && permitted,
    refetchIntervalInBackground: false,
    refetchInterval: (query) =>
      poll && phase === "ready" && permitted
        ? operationPollDelay(
            query.state.data?.status,
            query.state.dataUpdateCount + query.state.errorUpdateCount,
            query.state.error,
          )
        : false,
  });
}
