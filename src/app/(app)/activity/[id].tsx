import { useTitle } from "@/components/forms";
import { CircleCheck, CircleX, History } from "lucide-react-native";
import { View } from "react-native";
import { KeyRow } from "@/components/details";
import { activityTitle } from "@/features/activity-row";
import { useTheme } from "@/theme";
import { useLocalSearchParams } from "expo-router";
import { useRead } from "@/api/hooks";
import { api, unwrap } from "@/api/client";
import { envelope, auditSchema } from "@/api/runtime";
import { useBootstrap } from "@/auth/session";
import { Access } from "@/components/access";
import { Card, ErrorState, Label, Loading, Screen } from "@/components/ui";
import { date, t } from "@/localization";
export default function AuditDetail() {
  useTitle("Activity details");
  const { id } = useLocalSearchParams<{ id: string }>();
  const snapshot = useBootstrap();
  const { colors } = useTheme();
  const query = useRead(
    "audit-detail",
    id,
    async (signal) =>
      unwrap(
        await api.GET("/v1/mobile/audit/{id}", {
          params: { path: { id } },
          signal,
        }),
        envelope(auditSchema),
      ).data,
    !!snapshot.modules.activity,
  );
  return (
    <Access module="activity">
      <Screen scroll>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          query.data && (
            <>
              <Card
                style={{
                  padding: 18,
                  borderRadius: 22,
                  borderColor: colors.border,
                  boxShadow: "none",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  marginTop: 4,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    backgroundColor: colors.status.successSoft,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <History
                    size={23}
                    strokeWidth={1.9}
                    color={colors.status.successText}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Label size="title" style={{ letterSpacing: -0.4 }}>
                    {activityTitle(query.data.action)}
                  </Label>
                  <Label
                    size="secondary"
                    tone="secondary"
                    style={{ marginTop: 4 }}
                  >
                    {query.data.actor.name ?? t("system")}
                  </Label>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      backgroundColor:
                        query.data.outcome === "success"
                          ? colors.status.successSoft
                          : colors.status.dangerSoft,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      marginTop: 10,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: 11,
                    }}
                  >
                    {query.data.outcome === "success" ? (
                      <CircleCheck
                        size={14}
                        strokeWidth={2}
                        color={colors.status.successText}
                      />
                    ) : (
                      <CircleX
                        size={14}
                        strokeWidth={2}
                        color={colors.status.dangerText}
                      />
                    )}
                    <Label
                      size="micro"
                      style={{
                        color:
                          query.data.outcome === "success"
                            ? colors.status.successText
                            : colors.status.dangerText,
                      }}
                    >
                      {query.data.outcome === "success"
                        ? "Succeeded"
                        : query.data.outcome === "denied"
                          ? "Denied"
                          : query.data.outcome === "failed"
                            ? "Failed"
                            : query.data.outcome}
                    </Label>
                  </View>
                </View>
              </Card>
              <View style={{ gap: 10 }}>
                <View style={{ minHeight: 27, justifyContent: "center" }}>
                  <Label size="title">Event details</Label>
                </View>
                <Card
                  style={{ gap: 0, paddingHorizontal: 16, paddingVertical: 2 }}
                >
                  <KeyRow
                    label="Performed by"
                    value={query.data.actor.name ?? t("system")}
                  />
                  <KeyRow label="Outcome" value={query.data.outcome} />
                  <KeyRow
                    label="Date and time"
                    last
                    value={date(
                      query.data.created_at,
                      snapshot.appearance.timezone,
                    )}
                  />
                  {query.data.request_id && (
                    <Label size="caption">
                      {t("supportId")}: {query.data.request_id}
                    </Label>
                  )}
                </Card>
              </View>
              {query.data.changes &&
                Object.entries(query.data.changes).map(([key, value]) => (
                  <Card key={key}>
                    <Label size="caption">{key}</Label>
                    <Label>{JSON.stringify(value)}</Label>
                  </Card>
                ))}
            </>
          )
        )}
      </Screen>
    </Access>
  );
}
