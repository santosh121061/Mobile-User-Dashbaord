import { Pressable, View } from "react-native";
import { Circle, CircleCheck } from "lucide-react-native";
import { useTheme } from "@/theme";
import { t } from "@/localization";
import { Label } from "./ui";
import { GradientFill } from "./gradient";
export function ThemeChoice({
  mode,
  selected,
  disabled,
  onPress,
}: {
  mode: "light" | "dark" | "system";
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, dark } = useTheme();
  const Icon = selected ? CircleCheck : Circle;
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(mode)}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={{
          width: "100%",
          minWidth: 0,
          minHeight: 138,
          borderWidth: 1,
          borderColor: selected ? colors.brand.primary : colors.border,
          borderRadius: 18,
          paddingVertical: selected ? 12.5 : 13,
          paddingHorizontal: selected ? 6.5 : 7,
          alignItems: "center",
          gap: 8,
          backgroundColor: selected ? colors.brand.primarySoft : colors.surface,
          opacity: disabled ? 0.45 : 1,
          boxShadow: dark
            ? "0px 3px 18px rgba(0,0,0,0.062745)"
            : "0px 3px 16px rgba(49,88,148,0.023529)",
        }}
      >
        <View
          style={{
            width: 44,
            height: 57,
            borderRadius: 9,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: mode === "dark" ? "#647C9C" : "#9DB0CF",
            backgroundColor: mode === "dark" ? "#17243B" : "#FFFFFF",
            boxShadow: "0px 2px 4px rgba(40,63,99,0.070588)",
          }}
        >
          {mode === "system" && (
            <GradientFill
              colors={["#FFFFFF", "#FFFFFF", "#17243B", "#17243B"]}
              locations={[0, 0.5, 0.5, 1]}
              angle={90}
            />
          )}
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={{
                position: "absolute",
                top: 9 + 12 * index,
                left: 5,
                right: 5,
                height: 7,
                borderRadius: 3,
                backgroundColor:
                  index === 0
                    ? mode === "dark"
                      ? "#639BF9"
                      : "#A7C7FF"
                    : mode === "dark"
                      ? "#354A67"
                      : "#E0EAF7",
                zIndex: 1,
              }}
            />
          ))}
        </View>
        <Label
          size="captionMedium"
          style={{
            color: selected ? colors.brand.primary : colors.text.secondary,
          }}
        >
          {t(mode)}
        </Label>
        <Icon
          size={17}
          strokeWidth={1.85}
          color={selected ? colors.brand.primary : colors.text.secondary}
        />
      </Pressable>
    </View>
  );
}
