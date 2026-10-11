import { View, useWindowDimensions } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Label } from "./ui";
import { useTheme } from "@/theme";
export function FormIntro({
  icon: Icon,
  title,
  subtitle,
  tone = "blue",
  prominent = false,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tone?: "blue" | "mint" | "purple" | "gold";
  prominent?: boolean;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 370;
  const foreground =
    tone === "blue" ? colors.brand.primary : colors.accent[tone];
  const background =
    tone === "blue" ? colors.brand.primarySoft : colors.accent[`${tone}Soft`];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: narrow ? 9 : 12,
        minHeight: narrow ? 38 : 44,
        marginBottom: prominent ? 0 : narrow ? 2 : 9,
      }}
    >
      <View
        style={{
          width: prominent ? 55 : narrow ? 38 : 44,
          height: prominent ? 55 : narrow ? 38 : 44,
          borderRadius: prominent ? 18 : narrow ? 10 : 13,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={24} strokeWidth={1.8} color={foreground} />
      </View>
      <View style={{ flex: 1, gap: prominent ? 4 : 2 }}>
        <Label
          size={prominent ? "h1" : "title"}
          style={
            narrow && !prominent ? { fontSize: 16, lineHeight: 21 } : undefined
          }
        >
          {title}
        </Label>
        <Label
          size="secondary"
          tone="secondary"
          style={
            narrow && !prominent ? { fontSize: 11, lineHeight: 16 } : undefined
          }
        >
          {subtitle}
        </Label>
      </View>
    </View>
  );
}
