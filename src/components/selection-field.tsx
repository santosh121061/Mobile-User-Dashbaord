import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useTheme } from "@/theme";
import { Button, Label } from "./ui";
import { Sheet } from "./sheet";

export function SelectionField({
  label,
  value,
  disabled,
  error,
  children,
}: React.PropsWithChildren<{
  label: string;
  value: string;
  disabled?: boolean;
  error?: string;
}>) {
  const { colors, dark } = useTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Label
        size="captionMedium"
        tone="secondary"
        style={{
          fontFamily: "Inter_650DemiBold",
          fontSize: 11,
          lineHeight: 16,
          letterSpacing: width < 370 ? 0.11 : 0.44,
        }}
      >
        {label}
      </Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          minHeight: width < 370 ? 48 : 50,
          borderWidth: 1,
          borderColor: dark ? colors.border : "#D7E0EA",
          borderRadius: 11,
          paddingHorizontal: 14,
          paddingVertical: 13,
          backgroundColor: colors.surface,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Label
          style={{ flex: 1, fontSize: width < 370 ? 13 : 14, lineHeight: 22 }}
        >
          {value || "Choose"}
        </Label>
        <ChevronDown size={18} color={colors.text.secondary} />
      </Pressable>
      {error && (
        <Label
          size="caption"
          accessibilityLiveRegion="polite"
          style={{ color: "#B4233F", fontSize: 10, lineHeight: 15 }}
        >
          {error}
        </Label>
      )}
      {open && (
        <Sheet
          title={label}
          closeDisabled={disabled}
          close={() => setOpen(false)}
        >
          {children}
          <Button
            label="Done"
            disabled={disabled}
            onPress={() => setOpen(false)}
          />
        </Sheet>
      )}
    </View>
  );
}
