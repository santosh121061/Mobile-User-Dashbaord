import type { PropsWithChildren } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "@/theme";
import { t } from "@/localization";
import { Label } from "./ui";
import { IconButton } from "./visuals";
export function Sheet({
  children,
  title,
  close,
  closeDisabled = false,
}: PropsWithChildren<{
  title: string;
  close: () => void;
  closeDisabled?: boolean;
}>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      transparent
      animationType={width < 600 ? "slide" : "fade"}
      onRequestClose={() => {
        if (!closeDisabled) close();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: width < 600 ? "flex-end" : "center",
          padding: width < 600 ? 0 : 24,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "90%",
            width: "100%",
            maxWidth: 470,
            alignSelf: "center",
            borderTopStartRadius: 18,
            borderTopEndRadius: 18,
            borderBottomStartRadius: 0,
            borderBottomEndRadius: 0,
            overflow: "hidden",
            backgroundColor: colors.surface,
          }}
        >
          {width < 600 && (
            <View
              style={{
                width: 32,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#AEBED3",
                alignSelf: "center",
                marginTop: 9,
                marginBottom: 3,
              }}
            />
          )}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Label
              size="appbar"
              accessibilityRole="header"
              style={{ flex: 1, letterSpacing: -0.5 }}
            >
              {title}
            </Label>
            <IconButton
              label={t("closeDialog")}
              disabled={closeDisabled}
              onPress={close}
              visualSize={36}
              round
              variant="muted"
            >
              <X size={17} color={colors.text.secondary} />
            </IconButton>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 2,
              paddingBottom: 18 + insets.bottom,
              gap: 16,
            }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
