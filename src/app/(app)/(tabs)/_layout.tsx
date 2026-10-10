import { Link, Tabs } from "expo-router";
import { NavigationGlyph } from "@/components/navigation-glyph";
import { Pressable, StyleSheet, useWindowDimensions } from "react-native";
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
        sceneStyle: { backgroundColor: "transparent" },
        tabBarPosition: "bottom",
        tabBarVariant: "uikit",
        tabBarLabelPosition: mode === "sidebar" ? "beside-icon" : "below-icon",
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarActiveBackgroundColor: "transparent",
        tabBarInactiveBackgroundColor: "transparent",
        tabBarItemStyle: { minHeight: 52, marginEnd: 4 },
        tabBarIconStyle: { width: 36, height: 27 },
        tabBarLabel: ({ children, color, focused }) => (
          <Label
            size="micro"
            style={{
              color,
              fontFamily: focused ? "Inter_600SemiBold" : "Inter_500Medium",
              textAlign: mode === "sidebar" ? "left" : "center",
              maxWidth: mode === "rail" ? 64 : mode === "sidebar" ? 160 : 88,
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
          backgroundColor: colors.surface + "EB",
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: colors.divider + "A6",
          boxShadow: "0px -3px 18px rgba(40,81,138,0.023529)",
          borderTopLeftRadius: 25,
          borderTopRightRadius: 25,
          overflow: "hidden",
          ...(mode === "tabs"
            ? {
                height:
                  61 +
                  Math.max(0, fontScale - 1) * 32 +
                  Math.max(18, insets.bottom),
                paddingTop: 8,
                paddingBottom: Math.max(18, insets.bottom),
                paddingHorizontal: 12,
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
        const name = item.id as "home" | "users" | "activity" | "more";
        return (
          <Tabs.Screen
            key={item.id}
            name={item.tab.screen}
            options={{
              title: t(item.label),
              tabBarItemStyle: moduleAvailable(item, bootstrap)
                ? { minHeight: 52, marginEnd: name === "more" ? 0 : 4 }
                : { display: "none" },
              tabBarButton: (props) => moduleAvailable(item, bootstrap) ? (
                <Link href={item.route} asChild>
                  <Pressable
                    {...props}
                    ref={undefined}
                    style={StyleSheet.flatten([
                      props.style,
                      {
                        paddingVertical: 2,
                        paddingHorizontal: 6,
                        gap: 3,
                        justifyContent: "center",
                        borderRadius: 14,
                      },
                    ])}
                  />
                </Link>
              ) : null,
              tabBarIcon: ({ color }) => (
                <NavigationGlyph
                  name={name}
                  color={
                    typeof color === "string" ? color : colors.brand.primary
                  }
                />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
