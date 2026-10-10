import { useEffect, useState } from "react";
import { api, unwrap } from "@/api/client";
import { auditSchema, pageSchema } from "@/api/runtime";
import { useSession } from "@/auth/session";
import { useFeatureWork } from "./use-feature-work";

export type ActivityCriteria = {
  search: string;
  state?: "success" | "denied" | "failed";
};

/** Probe the same authorized, ordered first page without changing the visible list cache. */
export function useActivityNotice(
  criteria: ActivityCriteria,
  firstId: string | undefined,
  enabled: boolean,
) {
  const { phase } = useSession();
  const work = useFeatureWork();
  const [notice, setNotice] = useState({ firstId, count: 0 });
  const check = () =>
    work.run(async (scope) => {
      if (!enabled || (firstId && !/^\d+$/.test(firstId))) return;
      const page = unwrap(
        await api.GET("/v1/audit", {
          params: { query: { ...criteria, page: 1, per_page: 30 } },
          signal: scope.signal,
        }),
        pageSchema(auditSchema),
      );
      scope.assertCurrent();
      // The existing audit API orders numeric audit IDs descending, not client timestamps.
      setNotice({
        firstId,
        count: page.data
          .slice(0, 30)
          .filter(
            (row) =>
              !firstId ||
              (/^\d+$/.test(row.id) && BigInt(row.id) > BigInt(firstId)),
          ).length,
      });
    });
  useEffect(() => {
    if (!enabled || phase !== "ready") return;
    const timer = setInterval(() => void check(), 60000);
    return () => clearInterval(timer);
  });
  return {
    count:
      enabled && phase === "ready" && notice.firstId === firstId
        ? notice.count
        : 0,
    clear: () => setNotice({ firstId, count: 0 }),
    check,
    busy: work.busy,
    error: work.error,
  };
}
