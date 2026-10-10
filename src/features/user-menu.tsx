import { Modal, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { api, check, unwrap } from "@/api/client";
import { useRead } from "@/api/hooks";
import { envelope } from "@/api/runtime";
import { targetSchema } from "@/api/contracts";
import { Button, Card, ErrorState, Label, Loading } from "@/components/ui";
import { useTheme } from "@/theme";
import { t, type StringKey } from "@/localization";
import { useFeatureWork } from "./use-feature-work";
import { useFeatureConfirmation } from "./use-feature-confirmation";

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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const work = useFeatureWork();
  const confirm = useFeatureConfirmation();
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
  const run = (action: keyof typeof labels) =>
    work.run(async (scope) => {
      await confirm(
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
      );
      scope.assertCurrent();
      await refresh();
      scope.assertCurrent();
      close();
    });
  return (
    <Modal
      transparent
      animationType={width < 600 ? "slide" : "fade"}
      onRequestClose={() => {
        if (!work.busy) close();
      }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: width < 600 ? "flex-end" : "center",
          padding: width < 600 ? 0 : 24,
          backgroundColor: colors.overlay,
        }}
      >
        <ScrollView
          style={{
            maxHeight: "90%",
            width: "100%",
            maxWidth: 470,
            alignSelf: "center",
          }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <Card
            style={{
              borderRadius: 28,
              borderBottomStartRadius: width < 600 ? 0 : 28,
              borderBottomEndRadius: width < 600 ? 0 : 28,
              paddingBottom: 16 + insets.bottom,
            }}
          >
            <View
              style={{
                width: 34,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.controlBorder,
                alignSelf: "center",
                marginBottom: 8,
              }}
            />
            <Label size="appbar">{name}</Label>
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
                  <Button
                    variant="secondary"
                    label={t("detail")}
                    disabled={work.busy}
                    onPress={() => {
                      close();
                      router.push(`/users/${id}`);
                    }}
                  />
                  {context.data.actions.update && (
                    <Button
                      label={t("editUser")}
                      disabled={work.busy}
                      onPress={() => {
                        close();
                        router.push(`/users/${id}/edit`);
                      }}
                    />
                  )}
                  {context.data.actions.access && (
                    <Button
                      variant="secondary"
                      label={t("access")}
                      disabled={work.busy}
                      onPress={() => {
                        close();
                        router.push(`/users/${id}/access`);
                      }}
                    />
                  )}
                  {(Object.keys(labels) as (keyof typeof labels)[])
                    .filter((action) => context.data!.actions[action])
                    .map((action) => (
                      <Button
                        key={action}
                        variant={
                          ["status", "archive", "sessions"].includes(action)
                            ? "danger"
                            : "secondary"
                        }
                        label={t(labels[action])}
                        disabled={work.busy}
                        onPress={() => void run(action)}
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
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}
