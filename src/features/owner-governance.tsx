import type { z } from "zod";
import { api, check } from "@/api/client";
import { targetSchema } from "@/api/contracts";
import { useFeatureConfirmation } from "@/features/use-feature-confirmation";
import { Button, Card, ErrorState, Label } from "@/components/ui";
import { t } from "@/localization";
import { useFeatureWork } from "./use-feature-work";
export function OwnerGovernance({
  id,
  data,
  refresh,
}: {
  id: string;
  data: z.infer<typeof targetSchema>;
  refresh: () => Promise<unknown>;
}) {
  const confirm = useFeatureConfirmation();
  const work = useFeatureWork();
  if (!data.actions.owner || !data.governance) return null;
  const governance = data.governance;
  return (
    <Card>
      <Label size="title">
        {t("ownerMembership")}: {t(governance.owner ? "enabled" : "disabled")}
      </Label>
      <Label size="caption" tone="secondary">
        {t("ownerMembershipHint")}
      </Label>
      {governance.owner && (
        <Label>{t(governance.locked ? "ownerLocked" : "ownerUnlocked")}</Label>
      )}
      {!governance.membership_change_allowed && (
        <Label>{t("ownerMembershipBlocked")}</Label>
      )}
      {governance.owner && (
        <Button
          variant="secondary"
          label={t(governance.locked ? "unlockOwner" : "lockOwner")}
          disabled={!governance.lock_allowed}
          loading={work.busy}
          onPress={() =>
            void work.run(async (scope) => {
              await confirm(
                scope,
                "POST",
                `/api/v1/users/${id}/owner-lock`,
                async (signal) =>
                  check(
                    await api.POST("/v1/users/{user}/owner-lock", {
                      params: {
                        path: { user: Number(id) },
                      },
                      body: {
                        locked: !governance.locked,
                      },
                      signal,
                    }),
                  ),
              );
              scope.assertCurrent();
              await refresh();
            })
          }
        />
      )}
      {!!work.error && <ErrorState error={work.error} />}
    </Card>
  );
}
