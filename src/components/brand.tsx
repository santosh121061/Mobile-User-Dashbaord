import { useState } from "react";
import { Image, View } from "react-native";
import { useSession } from "@/auth/session";
import { useTheme } from "@/theme";
import { apiUrl } from "@/config/environment";
import { brandAssetSchema, type Branding } from "@/api/runtime";
import { t } from "@/localization";
import { Label } from "./ui";

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
    variant?: "full" | "compact" | "auth";
    wordmarkWidth?: number;
    wordmarkHeight?: number;
}) {
    const branding = useBranding();
    const { colors, dark } = useTheme();
    const name = branding?.name ?? t("workspace");
    const wordmark = selectWordmark(branding, dark);
    const compact = branding?.compact_logo;
    const auth = variant === "auth";
    const size = auth ? 64 : 36;
    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={name}
            style={{
                flexDirection: auth ? "column" : "row",
                alignItems: "center",
                gap: auth ? 16 : 10,
            }}
        >
            {(variant !== "full" || !wordmark) && (
                <View
                    style={{
                        width: size,
                        height: size,
                        borderRadius: auth ? 18 : 10,
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
                        <Label
                            size={auth ? "h1" : "title"}
                            style={{ color: colors.brand.primary }}
                        >
                            {name.slice(0, 1).toLocaleUpperCase()}
                        </Label>
                    )}
                </View>
            )}
            {variant !== "compact" &&
                (wordmark ? (
                    <BrandImage
                        path={wordmark}
                        width={auth ? 232 : wordmarkWidth}
                        height={auth ? 36 : wordmarkHeight}
                        fallback={
                            <Label size={auth ? "h2" : "bodyMedium"}>
                                {name}
                            </Label>
                        }
                    />
                ) : (
                    <Label
                        size={auth ? "h2" : "bodyMedium"}
                        style={{ color: colors.text.primary, flexShrink: 1 }}
                    >
                        {name}
                    </Label>
                ))}
        </View>
    );
}
