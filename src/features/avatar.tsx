import { useEffect, useState } from "react";
import { Image, Platform, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, check } from "@/api/client";
import { useRead } from "@/api/hooks";
import { useSession } from "@/auth/session";
import { Button, ErrorState, Label } from "@/components/ui";
import { t } from "@/localization";
import { useTheme } from "@/theme";
import { useFeatureWork } from "./use-feature-work";

export type AvatarAsset = ImagePicker.ImagePickerAsset;
export function appendAvatar(body: FormData, asset: AvatarAsset) {
  const filename = asset.fileName ?? "avatar.jpg";
  if (Platform.OS === "web" && asset.file)
    body.append("avatar", asset.file, filename);
  else
    body.append("avatar", {
      uri: asset.uri,
      name: filename,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
}
export function blobImage(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => {
      reader.abort();
      reject(new Error("Image read cancelled"));
    };
    reader.onload = () => {
      signal.removeEventListener("abort", cancel);
      resolve(String(reader.result));
    };
    reader.onerror = () => {
      signal.removeEventListener("abort", cancel);
      reject(new Error("Image unavailable"));
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    reader.readAsDataURL(blob);
  });
}
export function AvatarView({
  available,
  userId,
  version,
  name,
  size = 88,
}: {
  available: boolean;
  userId?: string;
  version?: number;
  name: string;
  size?: number;
}) {
  const { phase, bootstrap } = useSession();
  const { colors } = useTheme();
  const permitted =
    phase === "ready" &&
    !!bootstrap?.features["users.avatar.enabled"] &&
    available;
  const query = useRead(
    "avatar",
    { userId: userId ?? "self", version },
    async (signal) => {
      const result = userId
        ? await api.GET("/v1/users/{user}/avatar", {
            params: { path: { user: Number(userId) } },
            parseAs: "blob",
            signal,
          })
        : await api.GET("/v1/profile/avatar", {
            parseAs: "blob",
            signal,
          });
      check(result);
      return blobImage(result.data as Blob, signal);
    },
    permitted,
  );
  return (
    <View style={{ gap: 8, alignItems: "flex-start" }}>
      <View
        style={
          size >= 80
            ? {
                padding: 4,
                borderRadius: (size + 8) / 2,
                backgroundColor: colors.surface,
                boxShadow: "0px 5px 20px rgba(75,122,173,0.101961)",
              }
            : undefined
        }
      >
        {permitted && query.data ? (
          <Image
            accessibilityLabel={t("avatarOf", { name })}
            source={{ uri: query.data }}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
            }}
          />
        ) : (
          <View
            accessibilityLabel={t("avatarOf", { name })}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.brand.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Label
              size="title"
              style={{
                fontSize: Math.round(size / 3),
                lineHeight: Math.round(size / 2.4),
                fontFamily: "Inter_700Bold",
                color: colors.brand.primary,
              }}
            >
              {name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </Label>
          </View>
        )}
      </View>
      {permitted && query.isPending && (
        <Label accessibilityLiveRegion="polite">{t("loading")}</Label>
      )}
      {permitted && !!query.error && (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      )}
    </View>
  );
}
export function AvatarPicker({
  enabled,
  value,
  onChange,
  disabled,
}: {
  enabled: boolean;
  value: AvatarAsset | null;
  onChange: (asset: AvatarAsset | null) => void;
  disabled?: boolean;
}) {
  const work = useFeatureWork();
  const [permissionDenied, setPermissionDenied] = useState(false);
  useEffect(() => {
    if (!enabled) onChange(null);
  }, [enabled, onChange]);
  if (!enabled) return null;
  const choose = () =>
    work.run(async (scope) => {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      scope.assertCurrent();
      setPermissionDenied(!permission.granted);
      if (!permission.granted) return;
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      scope.assertCurrent();
      if (!selection.canceled && selection.assets[0]) {
        const asset = selection.assets[0];
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024)
          throw new Error(t("avatarSize"));
        onChange(asset);
      }
    });
  return (
    <View style={{ gap: 12 }}>
      <Label size="caption">{t("avatarHint")}</Label>
      {!!value && (
        <Image
          source={{ uri: value.uri }}
          accessibilityLabel={t("avatarPreview")}
          style={{ width: 88, height: 88, borderRadius: 44 }}
        />
      )}
      <Button
        label={t("chooseAvatar")}
        variant="secondary"
        disabled={disabled}
        loading={work.busy}
        onPress={() => void choose()}
      />
      {!!value && (
        <Button
          label={t("cancelAvatar")}
          variant="secondary"
          disabled={disabled || work.busy}
          onPress={() => onChange(null)}
        />
      )}
      {permissionDenied && (
        <Label accessibilityLiveRegion="polite">{t("photoPermission")}</Label>
      )}
      {work.error instanceof Error && work.error.message === t("avatarSize") ? (
        <Label accessibilityLiveRegion="polite">{t("avatarSize")}</Label>
      ) : (
        !!work.error && <ErrorState error={work.error} />
      )}
    </View>
  );
}
