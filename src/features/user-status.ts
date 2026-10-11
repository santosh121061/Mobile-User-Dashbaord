import type { UserRecord } from "@/api/runtime";
import { t } from "@/localization";

/** Use projected lifecycle metadata when present; retain legacy server labels. */
export function userStatusLabel(
  user: Pick<UserRecord, "archived" | "lifecycle_status" | "status">,
): string | undefined {
  if (user.archived) return t("archived");
  if (user.lifecycle_status) return t(user.lifecycle_status);
  if (user.status) return t(user.status);
}

export function userStatusTone(
  user: Pick<UserRecord, "archived" | "lifecycle_status" | "status">,
): "success" | "warning" | "danger" | "neutral" {
  if (user.archived || user.lifecycle_status === "archived") return "neutral";
  if (user.lifecycle_status === "pending") return "warning";
  if (user.lifecycle_status)
    return user.lifecycle_status === "active" ? "success" : "danger";
  if (user.status) return user.status === "enabled" ? "success" : "danger";
  return "neutral";
}
