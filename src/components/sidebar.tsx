import { NavigationGlyph } from "./navigation-glyph";
import { router, usePathname } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import {
  Home,
  Users,
  Activity,
  ChartNoAxesColumn,
  Settings,
  Menu,
  LogOut,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useModules } from "@/modules/registry";
import { useSession } from "@/auth/session";
import { useTheme } from "@/theme";
import { t } from "@/localization";
import { Label } from "./ui";
import { Brand } from "./brand";

// The app shell owns this navigation, so it stays mounted around child routes.
export function Sidebar({ rail }: { rail: boolean }) {
  const tabs = useModules("tabs");
  const { logout } = useSession();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const destinations = [
    ...tabs.filter((item) => item.id !== "more"),
    ...tabs.filter((item) => item.id === "more"),
  ];
  const icons = {
    home: Home,
    users: Users,
    activity: Activity,
    reports: ChartNoAxesColumn,
    settings: Settings,
    more: Menu,
  };
  return (
    <View
      style={{
        width: rail ? 88 : 240,
        backgroundColor: colors.surface,
        borderEndWidth: 1,
        borderColor: colors.divider,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View
        style={{
          minHeight: 72,
          padding: 12,
          flexDirection: rail ? "column" : "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Brand variant={rail ? "compact" : "full"} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: rail ? 4 : 12,
          gap: 8,
        }}
      >
        {destinations.map((item) => {
          const Icon = icons[item.id as keyof typeof icons];
          if (!Icon) return null;
          const selected =
            item.id === "home"
              ? pathname === "/"
              : pathname === `/${item.id}` ||
                pathname.startsWith(`/${item.id}/`);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={t(item.label)}
              accessibilityState={{ selected }}
              onPress={() => router.navigate(item.route)}
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: rail ? 4 : 12,
                paddingVertical: 8,
                borderRadius: 12,
                flexDirection: rail ? "column" : "row",
                alignItems: "center",
                gap: rail ? 4 : 12,
                backgroundColor: selected
                  ? colors.brand.primarySoft
                  : pressed
                    ? colors.surfaceMuted
                    : colors.surface,
              })}
            >
              <NavigationGlyph
                name={
                  item.id === "home"
                    ? "home"
                    : item.id === "users"
                      ? "users"
                      : item.id === "activity"
                        ? "activity"
                        : "more"
                }
                color={
                  selected ? colors.brand.primary : colors.accent.slateIcon
                }
              />
              <Label
                size="captionMedium"
                style={{
                  color: selected
                    ? colors.brand.primary
                    : colors.text.secondary,
                  flexShrink: 1,
                  textAlign: rail ? "center" : "left",
                }}
              >
                {t(item.label)}
              </Label>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("logout")}
        onPress={() => void logout()}
        style={{
          minHeight: 48,
          margin: 12,
          padding: 8,
          flexDirection: rail ? "column" : "row",
          gap: 8,
          alignItems: "center",
          justifyContent: rail ? "center" : "flex-start",
        }}
      >
        <LogOut size={24} color={colors.text.secondary} />
        <Label size="captionMedium" tone="secondary">
          {t("logout")}
        </Label>
      </Pressable>
    </View>
  );
}
