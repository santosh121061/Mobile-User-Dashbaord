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
        tabBarActiveBackgroundColor: "#EEF4FF",
        tabBarInactiveBackgroundColor: "transparent",
        tabBarItemStyle: { minHeight: 48, marginEnd: 4 },
        tabBarIconStyle: { width: 28, height: 23 },
        tabBarLabel: ({ children, color, focused }) => (
          <Label
            size="micro"
            style={{
              color,
              fontSize: 10,
              lineHeight: 16,
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
          fontSize: 10,
        },
        tabBarStyle: {
          display: mode === "tabs" ? "flex" : "none",
          backgroundColor: colors.surface + "EB",
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: colors.divider + "A6",
          boxShadow: "0px -3px 12px rgba(27,58,101,0.06)",
          borderTopLeftRadius: 17,
          borderTopRightRadius: 17,
          overflow: "hidden",
          ...(mode === "tabs"
            ? {
                height:
                  54 +
                  Math.max(0, fontScale - 1) * 32 +
                  Math.max(12, insets.bottom),
                paddingTop: 6,
                paddingBottom: Math.max(12, insets.bottom),
                paddingHorizontal: 8,
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
                ? { minHeight: 48, marginEnd: name === "more" ? 0 : 4 }
                : { display: "none" },
              tabBarButton: (props) =>
                moduleAvailable(item, bootstrap) ? (
                  <Link href={item.route} asChild>
                    <Pressable
                      {...props}
                      ref={undefined}
                      style={StyleSheet.flatten([
                        props.style,
                        {
                          paddingVertical: 2,
                          paddingHorizontal: 6,
                          gap: 1,
                          justifyContent: "center",
                          borderRadius: 10,
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
