import { useState } from "react";
import { Image, View } from "react-native";
import { useSession } from "@/auth/session";
import { useTheme } from "@/theme";
import { apiUrl } from "@/config/environment";
import { brandAssetSchema, type Branding } from "@/api/runtime";
import { t } from "@/localization";
import { Label } from "./ui";
import { GradientFill } from "./gradient";

export function BrandMark({ size = 42 }: { size?: number }) {
  const branding = useBranding();
  const name = branding?.name ?? t("workspace");
  const fallback = (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <GradientFill
        colors={["#376EFF", "#17AED4", "#55D384"]}
        angle={137}
        locations={[0.02, 0.56, 1]}
      />
      <Label
        style={{
          color: "#FFFFFF",
          fontFamily: "Inter_700Bold",
          fontSize: size * 0.74,
          lineHeight: size,
          letterSpacing: -size * 0.05,
        }}
      >
        {name.slice(0, 1).toLocaleUpperCase()}
      </Label>
    </View>
  );
  const mark = branding?.compact_logo ? (
    <BrandImage
      path={branding.compact_logo}
      width={size}
      height={size}
      fallback={fallback}
    />
  ) : (
    fallback
  );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        boxShadow: size <= 42
          ? "inset 0px 1px 1px rgba(255,255,255,0.439216), 0px 3px 8px rgba(20,103,250,0.082353)"
          : undefined,
      }}
    >
      {mark}
    </View>
  );
}

export function brandAssetUrl(
  path: string | null | undefined,
): string | undefined {
  if (!path || !brandAssetSchema.safeParse(path).success) return;
  try {
    const base = new URL(apiUrl);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password
    )
      return;
    const asset = new URL(path, base);
    if (asset.origin === base.origin) return asset.toString();
  } catch {}
}

export function selectWordmark(branding: Branding | undefined, dark: boolean) {
  return dark
    ? (branding?.dark_logo ?? branding?.logo)
    : (branding?.logo ?? branding?.dark_logo);
}

export function useBranding() {
  const session = useSession();
  return session.bootstrap?.branding ?? session.branding;
}

function BrandImage({
  path,
  width,
  height,
  fallback,
}: {
  path: string;
  width: number;
  height: number;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState<string>();
  const uri = brandAssetUrl(path);
  if (!uri || failed === uri) return <>{fallback}</>;
  return (
    <Image
      testID="admin-brand-image"
      accessible={false}
      source={{ uri }}
      resizeMode="contain"
      style={{ width, height }}
      onError={() => setFailed(uri)}
    />
  );
}

/** Preserve admin artwork proportions; never recolour or replace an uploaded mark. */
export function Brand({
  variant = "full",
  wordmarkWidth = 192,
  wordmarkHeight = 40,
}: {
  variant?: "full" | "compact" | "auth" | "wordmark";
  wordmarkWidth?: number;
  wordmarkHeight?: number;
}) {
  const branding = useBranding();
  const { colors, dark } = useTheme();
  const name = branding?.name ?? t("workspace");
  const wordmark = selectWordmark(branding, dark);
  const compact = branding?.compact_logo;
  const auth = variant === "auth";
  const size = 42;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
      }}
    >
      {variant !== "wordmark" &&
        ((variant !== "full" && variant !== "auth") || !wordmark) && (
          <View
            style={{
              width: size,
              height: size,
              borderRadius: 14,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: compact
                ? "transparent"
                : colors.brand.primarySoft,
            }}
          >
            {compact ? (
              <BrandImage
                path={compact}
                width={size}
                height={size}
                fallback={
                  <Label size={auth ? "h1" : "title"}>
                    {name.slice(0, 1).toLocaleUpperCase()}
                  </Label>
                }
              />
            ) : (
              <BrandMark size={size} />
            )}
          </View>
        )}
      {variant !== "compact" &&
        (wordmark ? (
          <BrandImage
            path={wordmark}
            width={auth ? 232 : wordmarkWidth}
            height={auth ? 36 : wordmarkHeight}
            fallback={<Label size="appbar">{name}</Label>}
          />
        ) : (
          <Label
            size="appbar"
            style={{ color: colors.text.primary, flexShrink: 1 }}
          >
            {name}
          </Label>
        ))}
    </View>
  );
}
