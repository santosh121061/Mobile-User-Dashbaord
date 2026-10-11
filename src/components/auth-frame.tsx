import { View, useWindowDimensions } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Card, Screen } from "./ui";
import { Brand } from "./brand";
import { AuthHeading, BackHeader } from "./chrome";
import { useTheme } from "@/theme";

export function AuthCard({ children }: React.PropsWithChildren) {
  const { colors } = useTheme();
  return (
    <Card
      style={{
        paddingVertical: 18,
        paddingHorizontal: 16,
        borderRadius: 18,
        borderColor: colors.border,
        boxShadow: "0px 8px 26px rgba(27,68,128,0.08)",
        gap: 18,
        marginTop: 23,
      }}
    >
      {children}
    </Card>
  );
}

/** Shared identity and readable form width for lock and recovery flows. */
export function AuthFrame({
  children,
  title,
  subtitle,
  icon,
  barTitle,
}: React.PropsWithChildren<{
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  barTitle?: string;
}>) {
  const { width, height } = useWindowDimensions();
  const maxWidth =
    width >= 840 && height >= 480 ? 550 : width >= 600 ? 540 : 480;
  return (
    <Screen
      safeTop
      scroll
      header={barTitle ? <BackHeader title={barTitle} /> : undefined}
      contentStyle={{
        flexGrow: 1,
        maxWidth,
        paddingTop: width < 600 ? 18 : 16,
        paddingBottom: 30,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth,
          alignSelf: "center",
          gap: 0,
        }}
      >
        {!barTitle && (
          <View style={{ minHeight: 64, justifyContent: "center" }}>
            <Brand variant="auth" />
          </View>
        )}
        {title && <AuthHeading title={title} subtitle={subtitle} icon={icon} />}
        {children}
      </View>
    </Screen>
  );
}
