import { View } from "react-native";
import { Link2Off, House } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useRouter } from "expo-router";
import { Button, Label, Screen } from "@/components/ui";
import { BackHeader } from "@/components/chrome";
import { t } from "@/localization";
export default function Unavailable() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Screen
      safeTop
      header={<BackHeader title="Link unavailable" fallback="/" />}
      contentStyle={{
        flex: 1,
        gap: 15,
        maxWidth: 550,
      }}
    >
      <View
        style={{
          alignItems: "center",
          gap: 0,
          paddingTop: 52,
          paddingHorizontal: 10,
        }}
      >
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 24,
            backgroundColor: colors.status.successSoft,
            marginBottom: 23,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Link2Off size={34} color={colors.brand.primary} />
        </View>
        <Label size="h1" style={{ textAlign: "center" }}>
          This link isn’t available
        </Label>
        <Label
          tone="secondary"
          style={{ textAlign: "center", marginTop: 12, marginBottom: 24 }}
        >
          {t("unavailableHint")}
        </Label>
        <View style={{ width: "100%" }}>
          <Button
            label="Go to Home"
            icon={<House size={20} color="#FFFFFF" />}
            onPress={() => router.replace("/")}
          />
        </View>
      </View>
    </Screen>
  );
}
