import { Pressable, View } from "react-native";
import { Label } from "@/components/ui";
import { useTheme } from "@/theme";
/** Feature choices expose selected/disabled state and retain a full touch target. */
export function Choice({
  label,
  selected,
  disabled,
  onPress,
  hint,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  hint?: string;
}) {
  const { colors, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={2}
      style={{
        minHeight: 44,
        minWidth: 48,
        marginEnd: 7,
        paddingHorizontal: 0,
        justifyContent: "flex-start",
      }}
    >
      <View
        style={{
          minHeight: 42,
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 15,
          borderWidth: 1,
          borderColor: selected
            ? dark
              ? "#395384"
              : "#D8E7FF"
            : "transparent",
          backgroundColor: selected
            ? dark
              ? colors.brand.primarySoft
              : "#DCEBFF"
            : colors.surfaceMuted,
        }}
      >
        <Label
          size="captionMedium"
          style={{
            fontFamily: selected ? "Inter_600SemiBold" : "Inter_500Medium",
            color: disabled
              ? colors.text.secondary
              : selected
                ? colors.brand.primary
                : colors.text.secondary,
          }}
        >
          {label}
        </Label>
      </View>
    </Pressable>
  );
}
