import { GradientFill } from "./gradient";
import Svg, { Path } from "react-native-svg";
import { t } from "@/localization";
import { Pressable, View, type ViewStyle } from "react-native";
import {
  Search,
  Plus,
  File,
  ShieldCheck,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";
import { Card, Label } from "./ui";
import { useTheme, tokens } from "@/theme";

export function dashboardCardStyle(dark: boolean): ViewStyle {
  return {
    borderColor: dark ? "#29415B" : "#EAF0FA",
    boxShadow: `0px 4px 18px ${dark ? "rgba(0,0,0,0.1)" : "rgba(76,112,170,0.045)"}`,
  };
}

export function IconButton({
  label,
  children,
  onPress,
  disabled = false,
  inField = false,
  variant = "plain",
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  inField?: boolean;
  variant?: "plain" | "accent" | "surface";
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={inField ? { left: 9, right: 9 } : undefined}
      onPress={(event) => {
        event?.stopPropagation();
        onPress();
      }}
      style={({ pressed }) => ({
        width: inField ? 30 : 48,
        minHeight: 48,
        marginVertical: inField ? -1 : 0,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        backgroundColor:
          pressed || variant === "accent"
            ? colors.brand.primarySoft
            : variant === "surface"
              ? colors.surface
              : "transparent",
        borderWidth: variant === "surface" ? 1 : 0,
        borderColor: colors.border,
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}
    >
      {children}
    </Pressable>
  );
}

export function SearchLauncher({
  label,
  onPress,
  displayLabel,
}: {
  label: string;
  onPress: () => void;
  displayLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "transparent",
        backgroundColor: pressed
          ? colors.brand.primarySoft
          : colors.surfaceMuted,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      <Search size={22} color={colors.text.secondary} />
      <Label tone="secondary" style={{ flex: 1 }}>
        {displayLabel ?? label}
      </Label>
    </Pressable>
  );
}

export function QuickAction({
  label,
  icon: Icon,
  onPress,
  tone = "blue",
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  tone?: "blue" | "mint" | "purple" | "gold";
}) {
  const { colors, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 80,
        minWidth: 64,
        flex: 1,
        paddingHorizontal: 5,
        paddingVertical: 8,
        borderRadius: 18,
        borderWidth: 1,
        ...dashboardCardStyle(dark),
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: pressed ? colors.brand.primarySoft : colors.surface,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor:
            tone === "blue"
              ? colors.brand.primarySoft
              : colors.accent[`${tone}Soft`],
        }}
      >
        <Icon
          size={21}
          strokeWidth={1.9}
          color={tone === "blue" ? colors.brand.primary : colors.accent[tone]}
        />
      </View>
      <Label size="captionMedium" style={{ textAlign: "center" }}>
        {label}
      </Label>
    </Pressable>
  );
}

export function FloatingAdd({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        position: "absolute",
        bottom: 16,
        end: 16,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: pressed
          ? colors.brand.primaryPressed
          : colors.brand.primary,
        alignItems: "center",
        justifyContent: "center",
        ...tokens.shadows.elevation2,
      })}
    >
      {({ pressed }) => (
        <Plus
          size={24}
          color={
            pressed ? colors.brand.primaryPressedText : colors.brand.primaryText
          }
        />
      )}
    </Pressable>
  );
}

export function IllustratedEmpty({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 200,
        padding: 24,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <File size={40} color={colors.text.secondary} />
      <Label size="title" style={{ textAlign: "center" }}>
        {title}
      </Label>
      <Label size="caption" tone="secondary" style={{ textAlign: "center" }}>
        {hint}
      </Label>
    </View>
  );
}

export function HomeSkeleton({
  label,
  count,
  cardWidth,
  gap,
}: {
  label: string;
  count: number;
  cardWidth: number | `${number}%`;
  gap: number;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={label} style={{ gap }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap,
        }}
      >
        {Array.from({ length: count }, (_, key) => (
          <Card
            key={key}
            style={{
              width: cardWidth,
              minHeight: 82,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 16,
                backgroundColor: colors.surfaceMuted,
              }}
            />
            <View style={{ flex: 1, gap: 8 }}>
              <View
                style={{
                  height: 18,
                  width: "70%",
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: 4,
                }}
              />
              <View
                style={{
                  height: 12,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: 4,
                }}
              />
            </View>
          </Card>
        ))}
      </View>
      <Card>
        {[0, 1, 2].map((key) => (
          <View
            key={key}
            style={{
              height: 64,
              borderRadius: 16,
              backgroundColor: colors.surfaceMuted,
            }}
          />
        ))}
      </Card>
    </View>
  );
}

export function DashboardBanner({ onPress }: { onPress: () => void }) {
  const { colors, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("updatesBanner")}
      onPress={onPress}
      style={{
        minHeight: 70,
        borderRadius: 20,
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <GradientFill
        colors={
          dark
            ? ["#173B36", "#1B3746", "#243655"]
            : ["#DDFAF1", "#E2F9FA", "#E4EFFF"]
        }
        angle={112}
        locations={[0, dark ? 0.62 : 0.55, 1]}
      />
      <Svg
        width={168}
        height={86}
        viewBox="0 0 200 100"
        pointerEvents="none"
        style={{ position: "absolute", right: 0, bottom: 0, opacity: 0.2 }}
      >
        <Path d="M0 100C60 96 77 14 131 19S185 57 200 26V100Z" fill="#6BDFDC" />
        <Path
          d="M51 100C104 91 111 47 151 45S179 67 200 59V100Z"
          fill="#6BDFDC"
          opacity={0.65}
        />
      </Svg>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 13,
          backgroundColor: dark ? "#1E5848" : "#C9F5E5",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ShieldCheck size={22} color={dark ? "#84E6C3" : "#059B74"} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2, zIndex: 1 }}>
        <Label size="bodyMedium">{t("updatesBanner")}</Label>
        <Label size="secondary" style={{ color: dark ? "#B4D0D5" : "#4B728B" }}>
          {t("updatesBannerHint")}
        </Label>
      </View>
      <View style={{ width: 16, height: 16, zIndex: 1 }}>
        <ChevronRight size={16} color={colors.brand.primary} />
      </View>
    </Pressable>
  );
}
