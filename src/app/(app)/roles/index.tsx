import {
  Plus,
  Search,
  ShieldCheck,
  ChevronRight,
  CircleCheck,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme";
import { useTitle } from "@/components/forms";
import { router } from "expo-router";
import { z } from "zod";
import { useBootstrap } from "@/auth/session";
import { useRead, useSearch } from "@/api/hooks";
import { api, unwrap } from "@/api/client";
import { envelope } from "@/api/runtime";
import { roleListSchema } from "@/api/contracts";
import { Access } from "@/components/access";
import { Button, Card, Input, Label, Screen } from "@/components/ui";
import { Records } from "@/components/records";
import { ExportButton } from "@/features/exports";
import { t } from "@/localization";
export default function Roles() {
  useTitle(t("roles"));
  const { colors } = useTheme();
  const snapshot = useBootstrap();
  const { search, setSearch, debounced } = useSearch();
  const query = useRead(
    "roles",
    null,
    async (signal) =>
      unwrap(
        await api.GET("/v1/roles", { signal }),
        envelope(z.array(roleListSchema)),
      ).data,
    !!snapshot.modules.roles,
  );
  return (
    <Access module="roles">
      <Screen>
        <Label tone="secondary" size="secondary">
          Manage roles and permissions.
        </Label>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            {snapshot.actions["roles.manage"] && (
              <Button
                label={t("addRole")}
                icon={<Plus size={20} color="#FFFFFF" />}
                onPress={() => router.push("/roles/new")}
              />
            )}
          </View>
          <ExportButton resource="roles" iconOnly />
        </View>
        <Input
          label={t("search")}
          hideLabel
          leading={<Search size={18} color={colors.text.secondary} />}
          placeholder={t("rolesSearch")}
          value={search}
          onChangeText={setSearch}
          maxLength={100}
        />
        <Records
          rows={(query.data ?? []).filter(
            (role) =>
              !debounced ||
              [
                role.name,
                ...(role.permissions?.map((permission) => permission.name) ??
                  []),
              ].some((value) =>
                value
                  .toLocaleLowerCase()
                  .includes(debounced.toLocaleLowerCase()),
              ),
          )}
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
          refreshing={query.isRefetching}
          render={(role) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={role.name}
              onPress={() => router.push(`/roles/${role.id}`)}
              style={{ marginBottom: 12 }}
            >
              <Card style={{ padding: 14, gap: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 11,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 15,
                      backgroundColor: colors.accent.purpleSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ShieldCheck size={24} color={colors.accent.purple} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Label size="bodyMedium">{role.name}</Label>
                    {role.permissions && (
                      <Label size="secondary" tone="secondary">
                        {role.permissions.length}{" "}
                        {t("permissions").toLowerCase()}
                      </Label>
                    )}
                  </View>
                  <ChevronRight size={18} color={colors.brand.primary} />
                </View>
                {role.permissions && (
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}
                  >
                    {[
                      { key: "users", label: t("users") },
                      { key: "audit", label: t("activity") },
                      { key: "export", label: t("reports") },
                      { key: "roles", label: t("roles") },
                    ].map((group) => {
                      const granted = role.permissions!.some((permission) =>
                        group.key === "export"
                          ? permission.name.endsWith(".export")
                          : permission.name.startsWith(group.key + "."),
                      );
                      return (
                        <View
                          key={group.key}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            padding: 6,
                            borderRadius: 11,
                            backgroundColor: granted
                              ? colors.brand.primarySoft
                              : colors.surfaceMuted,
                          }}
                        >
                          <Label
                            size="caption"
                            tone={granted ? "primary" : "secondary"}
                          >
                            {group.label}
                          </Label>
                          {granted && (
                            <CircleCheck
                              size={12}
                              color={colors.status.successText}
                            />
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            </Pressable>
          )}
        />
      </Screen>
    </Access>
  );
}
