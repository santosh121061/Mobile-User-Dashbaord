import { router } from "expo-router";
import { Pressable, View } from "react-native";
import {
  ShieldCheck,
  UserRound,
  SlidersHorizontal,
  Bell,
  FileChartColumn,
  KeyRound,
  Laptop,
  Settings2,
  ChevronRight,
  Users,
  LogOut,
  Search,
} from "lucide-react-native";
import { useBootstrap, useSession } from "@/auth/session";
import { Button, Label, Row, Screen } from "@/components/ui";
import { RootHeader } from "@/components/chrome";
import { IconButton } from "@/components/visuals";
import { t } from "@/localization";
import { useModules, searchableResources } from "@/modules/registry";
import { InboxDestination } from "@/features/inbox";
import { useTheme } from "@/theme";
import { GradientFill } from "@/components/gradient";
export default function More() {
  const snapshot = useBootstrap();
  const session = useSession();
  const destinations = useModules("more");
  const { colors, dark } = useTheme();
  const icons = {
    profile: UserRound,
    preferences: SlidersHorizontal,
    notifications: Bell,
    reports: FileChartColumn,
    keys: KeyRound,
    sessions: Laptop,
    settings: Settings2,
    roles: ShieldCheck,
    users: Users,
  };
  const workspaceIds = ["roles", "reports", "settings", "users"];
  const descriptions = {
    roles: "rolesDestinationHint",
    reports: "reportsDestinationHint",
    settings: "settingsDestinationHint",
    profile: "profileDestinationHint",
    preferences: "preferencesDestinationHint",
    sessions: "sessionsDestinationHint",
    keys: "keysDestinationHint",
  } as const;
  const render = (item: (typeof destinations)[number]) => {
    if (item.id === "notifications") return <InboxDestination key={item.id} />;
    const Icon = icons[item.id as keyof typeof icons] ?? Settings2;
    const purple = ["roles", "sessions"].includes(item.id),
      mint = ["reports", "profile"].includes(item.id),
      gold = item.id === "keys";
    const foreground = purple
      ? colors.accent.purple
      : mint
        ? colors.accent.mint
        : gold
          ? colors.accent.gold
          : colors.brand.primary;
    const background = purple
      ? colors.accent.purpleSoft
      : mint
        ? colors.accent.mintSoft
        : gold
          ? colors.accent.goldSoft
          : colors.brand.primarySoft;
    const description = descriptions[item.id as keyof typeof descriptions];
    return (
      <Row
        key={item.id}
        title={
          item.id === "profile"
            ? "My profile"
            : item.id === "preferences"
              ? "Preferences"
              : item.id === "settings"
                ? "Workspace settings"
                : t(item.label)
        }
        accessibilityLabel={t(item.label)}
        subtitle={description ? t(description) : undefined}
        leading={
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={21} strokeWidth={1.8} color={foreground} />
          </View>
        }
        onPress={() => router.push(item.route)}
      />
    );
  };
  return (
    <Screen
      safeTop
      scroll
      header={
        <RootHeader title={t("more")}>
          {searchableResources(snapshot).length > 0 && (
            <IconButton
              label={t("search")}
              onPress={() => router.push("/search")}
            >
              <Search size={20} color={colors.text.secondary} />
            </IconButton>
          )}
        </RootHeader>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("accountHome")}, ${snapshot.account.name}`}
        onPress={() => router.push("/profile")}
        style={{
          backgroundColor: colors.brand.primarySoft,
          borderRadius: 20,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 13,
          marginBottom: 10,
          minHeight: 84,
          overflow: "hidden",
        }}
      >
        <GradientFill
          colors={dark ? ["#233B65", "#173D37"] : ["#E9F1FF", "#EEFCF5"]}
          angle={115}
        />
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Label size="bodyMedium" style={{ color: colors.brand.primary }}>
            {snapshot.account.name
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </Label>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Label size="bodyMedium">{snapshot.account.name}</Label>
          <Label size="secondary" tone="secondary">
            {snapshot.account.email}
          </Label>
        </View>
        <ChevronRight size={18} color={colors.text.secondary} />
      </Pressable>
      {!!destinations.filter((item) => workspaceIds.includes(item.id))
        .length && (
        <>
          <Label size="title">{t("workspace")}</Label>
          <View style={{ gap: 0, marginBottom: 10 }}>
            {destinations
              .filter((item) => workspaceIds.includes(item.id))
              .sort(
                (a, b) =>
                  workspaceIds.indexOf(a.id) - workspaceIds.indexOf(b.id),
              )
              .map(render)}
          </View>
        </>
      )}
      <Label size="title">{t("accountHome")}</Label>
      <View style={{ gap: 0 }}>
        {destinations
          .filter((item) => !workspaceIds.includes(item.id))
          .sort(
            (a, b) =>
              [
                "profile",
                "notifications",
                "preferences",
                "sessions",
                "keys",
              ].indexOf(a.id) -
              [
                "profile",
                "notifications",
                "preferences",
                "sessions",
                "keys",
              ].indexOf(b.id),
          )
          .map(render)}
      </View>
      <Button
        variant="secondary"
        label={t("logout")}
        icon={<LogOut size={18} color={colors.brand.primary} />}
        onPress={() => void session.logout()}
      />
    </Screen>
  );
}
