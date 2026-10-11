import { router } from "expo-router";
import {
  Archive,
  History,
  Mail,
  Pencil,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { targetSchema } from "@/api/contracts";
import { Button, ErrorState, Loading, Row } from "@/components/ui";
import { useTheme } from "@/theme";
import { Sheet } from "@/components/sheet";
import { t, type StringKey } from "@/localization";
import { useFeatureWork } from "./use-feature-work";
import { useFeatureAction } from "./use-feature-action";

export function UserMenu({
  id,
  name,
  close,
  refresh,
}: {
  id: string;
  name: string;
  close: () => void;
  refresh: () => Promise<unknown>;
}) {
  const { colors } = useTheme();
  const work = useFeatureWork();
  const runAction = useFeatureAction();
  const context = useRead(
    "user-menu",
    id,
    async (signal) =>
      unwrap(
        await api.GET("/v1/mobile/users/{user}/context", {
          params: { path: { user: Number(id) } },
          signal,
        }),
        envelope(targetSchema),
      ).data,
  );
  const labels = {
    status: "statusAction",
    archive: "archive",
    restore: "restore",
    sessions: "revokeSessions",
    reset: "reset",
  } satisfies Record<string, StringKey>;
  const runUserAction = (action: keyof typeof labels) =>
    work.run(async (scope) => {
      await runAction(
        scope,
        "POST",
        `/api/v1/users/${id}/actions/${action}`,
        async (signal) => {
          scope.assertCurrent();
          check(
            await api.POST("/v1/users/{user}/actions/{action}", {
              params: { path: { user: Number(id), action } },

              signal,
            }),
          );
        },
        action === "archive" ||
          action === "sessions" ||
          (action === "status" && context.data?.user.status !== "disabled"),
      );
      scope.assertCurrent();
      await refresh();
      scope.assertCurrent();
      close();
    });
  return (
    <Sheet title={name} close={close} closeDisabled={work.busy}>
      {context.isPending ? (
        <Loading />
      ) : context.error ? (
        <ErrorState
          error={context.error}
          retry={() => void context.refetch()}
        />
      ) : (
        context.data && (
          <>
            <Row
              title={t("detail")}
              subtitle={context.data.user.email}
              leading={<UserRound size={19} color={colors.brand.primary} />}
              onPress={
                work.busy
                  ? undefined
                  : () => {
                      close();
                      router.push(`/users/${id}`);
                    }
              }
            />
            {context.data.actions.update && (
              <Row
                title={t("editUser")}
                leading={<Pencil size={19} color={colors.brand.primary} />}
                onPress={
                  work.busy
                    ? undefined
                    : () => {
                        close();
                        router.push(`/users/${id}/edit`);
                      }
                }
              />
            )}
            {context.data.actions.access && (
              <Row
                title={t("access")}
                leading={<ShieldCheck size={19} color={colors.brand.primary} />}
                onPress={
                  work.busy
                    ? undefined
                    : () => {
                        close();
                        router.push(`/users/${id}/access`);
                      }
                }
              />
            )}
            {(Object.keys(labels) as (keyof typeof labels)[])
              .filter((action) => context.data!.actions[action])
              .map((action) => (
                <Row
                  key={action}
                  title={t(labels[action])}
                  leading={
                    action === "reset" ? (
                      <Mail size={19} color={colors.brand.primary} />
                    ) : action === "sessions" ? (
                      <History size={19} color={colors.status.dangerText} />
                    ) : action === "status" ? (
                      <UserRound size={19} color={colors.status.dangerText} />
                    ) : (
                      <Archive size={19} color={colors.status.dangerText} />
                    )
                  }
                  onPress={
                    work.busy ? undefined : () => void runUserAction(action)
                  }
                />
              ))}
          </>
        )
      )}
      {!!work.error && <ErrorState error={work.error} />}
      <Button
        variant="tertiary"
        label={t("cancel")}
        disabled={work.busy}
        onPress={close}
      />
    </Sheet>
  );
}
