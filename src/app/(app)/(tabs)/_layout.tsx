import { Tabs } from "expo-router";
import { Home, Users, Activity, Menu } from "lucide-react-native";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Label } from "@/components/ui";
import { useBootstrap } from "@/auth/session";
import { useModules, moduleAvailable } from "@/modules/registry";
import { useTheme } from "@/theme";
import { navigationMode } from "@/utils/layout";
import { t } from "@/localization";
export default function TabsLayout() {
    const bootstrap = useBootstrap();
    const destinations = useModules("tabs", true);
    const { colors } = useTheme();
    const { width, fontScale } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const mode = navigationMode(width);
    return (
        <Tabs
            backBehavior="none"
            screenOptions={{
                headerShown: false,
                tabBarPosition: "bottom",
                tabBarVariant: "uikit",
                tabBarLabelPosition:
                    mode === "sidebar" ? "beside-icon" : "below-icon",
                tabBarActiveTintColor: colors.brand.primary,
                tabBarInactiveTintColor: colors.text.secondary,
                tabBarActiveBackgroundColor: colors.brand.primarySoft,
                tabBarInactiveBackgroundColor: colors.surface,
                tabBarItemStyle: { minHeight: 64 },
                tabBarLabel: ({ children, color }) => (
                    <Label
                        size="captionMedium"
                        style={{
                            color,
                            textAlign: mode === "sidebar" ? "left" : "center",
                            maxWidth:
                                mode === "rail"
                                    ? 64
                                    : mode === "sidebar"
                                      ? 160
                                      : 88,
                        }}
                    >
                        {children}
                    </Label>
                ),
                tabBarLabelStyle: {
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                },
                tabBarStyle: {
                    display: mode === "tabs" ? "flex" : "none",
                    backgroundColor: colors.surface,
                    borderColor: colors.divider,
                    ...(mode === "tabs"
                        ? {
                              height:
                                  64 +
                                  Math.max(0, fontScale - 1) * 32 +
                                  insets.bottom,
                          }
                        : {
                              width: mode === "rail" ? 72 : 240,
                              minWidth: mode === "rail" ? 72 : 240,
                              paddingStart: mode === "rail" ? 0 : 12,
                              paddingEnd: mode === "rail" ? 0 : 12,
                          }),
                },
            }}
        >
            {destinations.map((item) => {
                if (!item.tab) return null;
                const Icon = {
                    home: Home,
                    users: Users,
                    activity: Activity,
                    menu: Menu,
                }[item.tab.icon];
                return (
                    <Tabs.Screen
                        key={item.id}
                        name={item.tab.screen}
                        options={{
                            title: t(item.label),
                            href: moduleAvailable(item, bootstrap)
                                ? item.route
                                : null,
                            tabBarIcon: ({ color }) => (
                                <Icon color={color} size={24} />
                            ),
                        }}
                    />
                );
            })}
        </Tabs>
    );
}
