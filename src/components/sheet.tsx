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
import { useTheme } from "@/theme";
import { Label } from "./ui";
export function Sheet({
  children,
  title,
  close,
}: PropsWithChildren<{ title: string; close: () => void }>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      transparent
      animationType={width < 600 ? "slide" : "fade"}
      onRequestClose={close}
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
          style={{
            maxHeight: "90%",
            width: "100%",
            maxWidth: 470,
            alignSelf: "center",
            borderTopStartRadius: 28,
            borderTopEndRadius: 28,
            borderBottomStartRadius: width < 600 ? 0 : 28,
            borderBottomEndRadius: width < 600 ? 0 : 28,
            overflow: "hidden",
            backgroundColor: colors.surface,
          }}
        >
          <View
            style={{
              width: 34,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.controlBorder,
              alignSelf: "center",
              marginTop: 9,
            }}
          />
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Label size="appbar">{title}</Label>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: 20,
              paddingBottom: 25 + insets.bottom,
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
