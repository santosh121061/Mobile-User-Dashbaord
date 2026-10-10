import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useTheme } from "@/theme";
import { Button, Label } from "./ui";
import { Sheet } from "./sheet";

export function SelectionField({
  label,
  value,
  disabled,
  children,
}: React.PropsWithChildren<{
  label: string;
  value: string;
  disabled?: boolean;
}>) {
  const { colors, dark } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <Label size="captionMedium" tone="secondary">
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
          minHeight: 54,
          borderWidth: 1,
          borderColor: dark ? "#344A6B" : "#D7E2F2",
          borderRadius: 13,
          paddingHorizontal: 13,
          paddingVertical: 13,
          backgroundColor: colors.inputSurface,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Label style={{ flex: 1 }}>{value || "Choose"}</Label>
        <ChevronDown size={18} color={colors.text.secondary} />
      </Pressable>
      {open && (
        <Sheet title={label} close={() => setOpen(false)}>
          {children}
          <Button label="Done" onPress={() => setOpen(false)} />
        </Sheet>
      )}
    </View>
  );
}
