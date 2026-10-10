import { View, Pressable, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  ChevronLeft,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { BrandMark, useBranding } from "./brand";
import { Label } from "./ui";
import { useTheme } from "@/theme";
import { t } from "@/localization";
import { GradientFill } from "./gradient";

export function RootHeader({
  title,
  subtitle,
  children,
}: React.PropsWithChildren<{ title?: string; subtitle?: string }>) {
  const { width } = useWindowDimensions();
  const branding = useBranding();
  return (
    <View
      style={{
        minHeight: 70,
        paddingBottom: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 11,
        }}
      >
        {title ? (
          <>
            {width < 600 && <BrandMark />}
            <Label size={width < 600 ? "h1" : "appbar"} style={{ flex: 1 }}>
              {title}
            </Label>
          </>
        ) : (
          <>
            {width < 600 && <BrandMark />}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Label size="appbar">{branding?.name ?? t("workspace")}</Label>
              {!!subtitle && (
                <Label size="secondary" tone="secondary">
                  {subtitle}
                </Label>
              )}
            </View>
          </>
        )}
      </View>
      {children}
    </View>
  );
}

export function BackHeader({
  title,
  fallback = "/(auth)/login",
}: {
  title: string;
  fallback?: "/" | "/(auth)/login";
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 64,
        paddingBottom: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("back")}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace(fallback)
        }
        style={{
          width: 48,
          height: 48,
          marginStart: -10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronLeft
          size={22}
          strokeWidth={1.85}
          color={colors.brand.primary}
        />
      </Pressable>
      <Label size="appbar" style={{ flex: 1, letterSpacing: -0.5 }}>
        {title}
      </Label>
    </View>
  );
}

export function AuthArtwork() {
  const { colors, dark } = useTheme();
  const { width, height } = useWindowDimensions();
  if (height < 480) return null;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: 128,
        alignItems: "center",
        justifyContent: "center",
        marginTop: width >= 600 ? 25 : 10,
        marginBottom: 22,
      }}
    >
      <Svg
        pointerEvents="none"
        width={230}
        height={128}
        style={{ position: "absolute" }}
      >
        <Defs>
          <LinearGradient
            id="auth-orbit"
            gradientUnits="userSpaceOnUse"
            x1={24.76}
            y1={11.9}
            x2={205.24}
            y2={116.1}
          >
            <Stop offset="0" stopColor={dark ? "#1C5B52" : "#CBF5E9"} />
            <Stop offset="1" stopColor={dark ? "#213D6F" : "#D5E8FF"} />
          </LinearGradient>
        </Defs>
        <Path
          d="M115.826 11.5H130.688A74.312 43.349 0 0 1 205 54.849A105.688 61.651 0 0 1 99.312 116.5H84.45A59.45 34.679 0 0 1 25 81.821V64.48A90.826 52.98 0 0 1 115.826 11.5Z"
          fill="url(#auth-orbit)"
          transform="rotate(-10 115 64)"
        />
      </Svg>
      <View
        style={{
          transform: [{ rotate: "-8deg" }],
          borderRadius: 24,
          boxShadow: "0px 12px 25px rgba(20,123,229,0.168627)",
        }}
      >
        <BrandMark size={77} />
      </View>
      {[
        { Icon: ShieldCheck, left: "a" },
        { Icon: Users, left: "b" },
      ].map(({ Icon, left }) => (
        <View
          key={left}
          style={{
            position: "absolute",
            start: left === "a" ? "50%" : undefined,
            end: left === "b" ? "50%" : undefined,
            marginStart: left === "a" ? -108 : undefined,
            marginEnd: left === "b" ? -105 : undefined,
            top: left === "a" ? 18 : undefined,
            bottom: left === "b" ? 14 : undefined,
            width: 43,
            height: 43,
            borderRadius: 15,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: dark ? colors.border : "#E6F1FF",
            boxShadow: "0px 5px 15px rgba(29,91,152,0.070588)",
            alignItems: "center",
            justifyContent: "center",
            transform: [{ rotate: left === "a" ? "-10deg" : "10deg" }],
          }}
        >
          <Icon
            size={22}
            strokeWidth={1.85}
            color={
              left === "a" ? colors.brand.primary : colors.status.successText
            }
          />
        </View>
      ))}
    </View>
  );
}

export function AuthHeading({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        gap: 9,
        paddingTop: Icon ? 18 : 0,
        paddingBottom: 0,
      }}
    >
      {Icon && (
        <View
          style={{
            width: 67,
            height: 67,
            borderRadius: 21,
            backgroundColor: colors.brand.primarySoft,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 15,
            boxShadow: "0px 8px 22px rgba(35,111,250,0.043137)",
            overflow: "hidden",
          }}
        >
          <GradientFill
            colors={
              colors.canvas === "#0D1527"
                ? ["#243D67", "#224858"]
                : ["#DAEAFF", "#EBF7FF"]
            }
            angle={135}
          />
          <View style={{ width: 32, height: 32, zIndex: 1 }}>
            <Icon size={32} strokeWidth={1.85} color={colors.brand.primary} />
          </View>
        </View>
      )}
      <Label
        accessibilityRole="header"
        size="display"
        style={{ textAlign: "center", letterSpacing: -1 }}
      >
        {title}
      </Label>
      {!!subtitle && (
        <Label tone="secondary" style={{ textAlign: "center", maxWidth: 330 }}>
          {subtitle}
        </Label>
      )}
    </View>
  );
}
