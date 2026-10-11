import { z } from "zod";
import { api, unwrap } from "@/api/client";
import { envelope, auditSchema } from "@/api/runtime";
import { profileSchema, roleSchema, targetSchema } from "@/api/contracts";
import { routeForIntent } from "@/utils/links";

/** Probe only canonical read endpoints; never replay a write, reset, or signed verification. */
export async function readIntent(route: string, signal: AbortSignal) {
  if (routeForIntent(route) !== route)
    throw new Error("Invalid retry destination");
  const match = /^\/(users|roles|activity)\/([1-9][0-9]*)$/.exec(route);
  if (match) {
    const id = match[2]!;
    if (!Number.isSafeInteger(Number(id)))
      throw new Error("Invalid record identifier");
    const data =
      match[1] === "users"
        ? unwrap(
            await api.GET("/v1/mobile/users/{user}/context", {
              params: { path: { user: Number(id) } },
              signal,
            }),
            envelope(targetSchema),
          ).data.user
        : match[1] === "roles"
          ? unwrap(
              await api.GET("/v1/roles/{role}", {
                params: { path: { role: Number(id) } },
                signal,
              }),
              envelope(roleSchema),
            ).data
          : unwrap(
              await api.GET("/v1/mobile/audit/{id}", {
                params: { path: { id } },
                signal,
              }),
              envelope(auditSchema),
            ).data;
    if (data.id !== id) throw new Error("Unexpected retry record");
  } else if (route === "/profile") {
    unwrap(await api.GET("/v1/profile", { signal }), envelope(profileSchema));
  } else if (route === "/notifications") {
    unwrap(
      await api.GET("/v1/notifications/summary", { signal }),
      envelope(z.object({ unread: z.number().int().nonnegative() })),
    );
  } else throw new Error("Invalid retry destination");
}
