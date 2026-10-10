import { View } from "react-native";
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
  const foreground =
    tone === "blue" ? colors.brand.primary : colors.accent[tone];
  const background =
    tone === "blue" ? colors.brand.primarySoft : colors.accent[`${tone}Soft`];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        marginBottom: prominent ? 0 : 7,
      }}
    >
      <View
        style={{
          width: prominent ? 55 : 48,
          height: prominent ? 55 : 48,
          borderRadius: prominent ? 18 : 16,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={24} strokeWidth={1.8} color={foreground} />
      </View>
      <View style={{ flex: 1, gap: prominent ? 4 : 2 }}>
        <Label size={prominent ? "h1" : "title"}>{title}</Label>
        <Label size="secondary" tone="secondary">
          {subtitle}
        </Label>
      </View>
    </View>
  );
}
