import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { DetailField } from "@/components/details";
import { useTheme } from "@/theme";
import { Pencil, ShieldCheck } from "lucide-react-native";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { targetSchema } from "@/api/contracts";
import { useBootstrap } from "@/auth/session";
import { useFeatureAction } from "@/features/use-feature-action";
import {
  Button,
  Card,
  ErrorState,
  Label,
  Loading,
  Screen,
} from "@/components/ui";
import { Access } from "@/components/access";
import { date, t, type StringKey } from "@/localization";
import { useTitle } from "@/components/forms";
import { useFeatureWork } from "@/features/use-feature-work";
import { AvatarView } from "@/features/avatar";
import { AdminAvatar } from "@/features/admin-avatar";
import { OwnerGovernance } from "@/features/owner-governance";
import { FeaturePane } from "@/features/feature-pane";
import { userStatusLabel, userStatusTone } from "@/features/user-status";
export default function UserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const snapshot = useBootstrap();
  const { colors } = useTheme();
  const runAction = useFeatureAction();
  useTitle(t("detail"));
  const work = useFeatureWork();
  const { busy, error } = work;
  const query = useRead(
    "user",
    id,
    async (signal) =>
      unwrap(
        await api.GET("/v1/mobile/users/{user}/context", {
          params: { path: { user: Number(id) } },
          signal,
        }),
        envelope(targetSchema),
      ).data,
    !!snapshot.modules.users,
  );
  const statusTone = userStatusTone(query.data?.user ?? {});
  const runUserAction = async (
    action: "status" | "archive" | "restore" | "sessions" | "reset",
  ) =>
    work.run(async (scope) => {
      await runAction(
        scope,
        "POST",
        `/api/v1/users/${id}/actions/${action}`,
        async (signal) =>
          check(
            await api.POST("/v1/users/{user}/actions/{action}", {
              params: { path: { user: Number(id), action } },

              signal,
            }),
          ),
        action === "archive" ||
          action === "sessions" ||
          (action === "status" && query.data?.user.status !== "disabled"),
      );
      scope.assertCurrent();
      await query.refetch();
    });
  const actionLabels: Record<string, StringKey> = {
    status: "statusAction",
    archive: "archive",
    restore: "restore",
    sessions: "revokeSessions",
    reset: "reset",
  };
  return (
    <Access module="users">
      <Screen scroll contentStyle={{ maxWidth: 660 }}>
        <FeaturePane wide>
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorState
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            query.data && (
              <>
                <View
                  style={{
                    alignItems: "center",
                    gap: 0,
                    paddingTop: 8,
                    paddingBottom: 18,
                    marginBottom: -12,
                  }}
                >
                  <AvatarView
                    size={88}
                    available={
                      query.data.avatar_available &&
                      !!snapshot.fields.name?.view
                    }
                    userId={id}
                    version={query.dataUpdatedAt}
                    name={query.data.user.name ?? query.data.user.public_id}
                  />
                  <Label
                    size="h1"
                    style={{
                      textAlign: "center",
                      marginTop: 12,
                      letterSpacing: -0.65,
                    }}
                  >
                    {query.data.user.name ?? query.data.user.public_id}
                  </Label>
                  {snapshot.fields.email?.view && query.data.user.email && (
                    <Label
                      size="secondary"
                      tone="secondary"
                      style={{ marginTop: 3, marginBottom: 9 }}
                    >
                      {query.data.user.email}
                    </Label>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {snapshot.fields.roles?.view &&
                      query.data.user.roles?.map((role) => (
                        <Label
                          key={role.id}
                          size="micro"
                          style={{
                            backgroundColor: colors.brand.primarySoft,
                            color: colors.brand.primary,
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 999,
                          }}
                        >
                          {role.name}
                        </Label>
                      ))}
                    {userStatusLabel(query.data.user) && (
                      <Label
                        size="micro"
                        style={{
                          backgroundColor:
                            statusTone === "neutral"
                              ? colors.surfaceMuted
                              : colors.status[`${statusTone}Soft`],
                          color:
                            statusTone === "neutral"
                              ? colors.text.secondary
                              : colors.status[`${statusTone}Text`],
                          paddingVertical: 4,
                          paddingHorizontal: 9,
                          borderRadius: 999,
                        }}
                      >
                        {userStatusLabel(query.data.user)}
                      </Label>
                    )}
                  </View>
                </View>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
                  {query.data.actions.update && (
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Button
                        label={t("editUser")}
                        displayLabel="Edit details"
                        icon={<Pencil size={20} color="#FFFFFF" />}
                        disabled={busy}
                        onPress={() => router.push(`/users/${id}/edit`)}
                      />
                    </View>
                  )}
                  {query.data.actions.access && (
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Button
                        variant="secondary"
                        label={t("access")}
                        displayLabel="Access"
                        icon={
                          <ShieldCheck size={20} color={colors.brand.primary} />
                        }
                        disabled={busy}
                        onPress={() => router.push(`/users/${id}/access`)}
                      />
                    </View>
                  )}
                </View>
                <Card>
                  {Object.entries(snapshot.fields)
                    .filter(
                      ([key, rule]) =>
                        rule.view &&
                        query.data!.user[
                          key as keyof typeof query.data.user
                        ] !== undefined,
                    )
                    .map(([key, rule]) => (
                      <DetailField
                        key={key}
                        label={rule.label}
                        value={
                          key === "status"
                            ? (userStatusLabel(query.data!.user) ?? "-")
                            : key === "roles"
                              ? query
                                  .data!.user.roles?.map((role) => role.name)
                                  .join(", ") || "-"
                              : key.endsWith("_at") &&
                                  typeof query.data!.user[
                                    key as keyof typeof query.data.user
                                  ] === "string"
                                ? date(
                                    String(
                                      query.data!.user[
                                        key as keyof typeof query.data.user
                                      ],
                                    ),
                                    snapshot.appearance.timezone,
                                  )
                                : String(
                                    query.data!.user[
                                      key as keyof typeof query.data.user
                                    ] ?? "-",
                                  )
                        }
                      />
                    ))}
                  <AdminAvatar
                    id={id}
                    available={query.data.avatar_available}
                    permitted={
                      !!query.data.actions.update &&
                      !!snapshot.fields.name?.edit
                    }
                    refresh={() => query.refetch()}
                  />
                </Card>
                <OwnerGovernance
                  id={id}
                  data={query.data}
                  refresh={() => query.refetch()}
                />
                <Card>
                  {Object.entries(actionLabels)
                    .filter(([action]) => query.data!.actions[action])
                    .map(([action, label]) => (
                      <Button
                        key={action}
                        label={t(label)}
                        variant={
                          ["status", "archive", "sessions"].includes(action)
                            ? "danger"
                            : "secondary"
                        }
                        disabled={busy}
                        onPress={() =>
                          void runUserAction(
                            action as Parameters<typeof runUserAction>[0],
                          )
                        }
                      />
                    ))}
                  <Label size="caption" tone="secondary">
                    {t("protectedOwner")}
                  </Label>
                  {Object.entries(query.data.action_reasons)
                    .filter(
                      ([action]) =>
                        !!actionLabels[action] &&
                        !!snapshot.actions["users." + action],
                    )
                    .map(([action, reason]) => (
                      <Label key={action} size="caption" tone="secondary">
                        {t(actionLabels[action]!)}:{reason}
                      </Label>
                    ))}
                </Card>
              </>
            )
          )}
          {!!error && <ErrorState error={error} />}
        </FeaturePane>
      </Screen>
    </Access>
  );
}
