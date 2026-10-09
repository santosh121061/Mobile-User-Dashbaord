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
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={hint}
            accessibilityState={{ selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={onPress}
            style={{
                minHeight: 48,
                minWidth: 48,
                margin: 2,
                paddingHorizontal: 4,
                justifyContent: "center",
            }}
        >
            <View
                style={{
                    minHeight: 32,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 9999,
                    borderWidth: selected ? 1 : 0,
                    borderColor: colors.brand.primary,
                    backgroundColor: selected
                        ? colors.brand.primarySoft
                        : colors.surfaceMuted,
                }}
            >
                <Label
                    size="captionMedium"
                    style={{
                        color: disabled
                            ? colors.text.secondary
                            : selected
                              ? colors.brand.primary
                              : colors.text.primary,
                    }}
                >
                    {label}
                </Label>
            </View>
        </Pressable>
    );
}
