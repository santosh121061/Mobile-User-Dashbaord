import { Pressable, View } from "react-native";
import { Search, Plus, File, type LucideIcon } from "lucide-react-native";
import { Card, Label } from "./ui";
import { useTheme, tokens } from "@/theme";

export function IconButton({
    label,
    children,
    onPress,
    disabled = false,
    inField = false,
}: {
    label: string;
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    inField?: boolean;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={(event) => {
                event.stopPropagation();
                onPress();
            }}
            style={({ pressed }) => ({
                width: 48,
                minHeight: 48,
                marginVertical: inField ? -1 : 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: pressed ? colors.surfaceMuted : "transparent",
            })}
        >
            {children}
        </Pressable>
    );
}

export function SearchLauncher({
    label,
    onPress,
}: {
    label: string;
    onPress: () => void;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
            })}
        >
            <Search size={20} color={colors.text.tertiary} />
            <Label tone="tertiary" style={{ flex: 1 }}>
                {label}
            </Label>
        </Pressable>
    );
}

export function QuickAction({
    label,
    icon: Icon,
    onPress,
}: {
    label: string;
    icon: LucideIcon;
    onPress: () => void;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => ({
                minHeight: 72,
                minWidth: 64,
                flex: 1,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                backgroundColor: pressed
                    ? colors.brand.primarySoft
                    : colors.surface,
            })}
        >
            <Icon size={24} color={colors.brand.primary} />
            <Label size="captionMedium" style={{ textAlign: "center" }}>
                {label}
            </Label>
        </Pressable>
    );
}

export function FloatingAdd({
    label,
    onPress,
}: {
    label: string;
    onPress: () => void;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => ({
                position: "absolute",
                bottom: 16,
                end: 16,
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: pressed
                    ? colors.brand.primaryPressed
                    : colors.brand.primary,
                alignItems: "center",
                justifyContent: "center",
                ...tokens.shadows.elevation2,
            })}
        >
            {({ pressed }) => (
                <Plus
                    size={24}
                    color={
                        pressed
                            ? colors.brand.primaryPressedText
                            : colors.brand.primaryText
                    }
                />
            )}
        </Pressable>
    );
}

export function IllustratedEmpty({
    title,
    hint,
}: {
    title: string;
    hint: string;
}) {
    const { colors } = useTheme();
    return (
        <View
            style={{
                minHeight: 200,
                padding: 24,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
            }}
        >
            <File size={40} color={colors.text.secondary} />
            <Label size="title" style={{ textAlign: "center" }}>
                {title}
            </Label>
            <Label
                size="caption"
                tone="secondary"
                style={{ textAlign: "center" }}
            >
                {hint}
            </Label>
        </View>
    );
}

export function HomeSkeleton({
    label,
    count,
    cardWidth,
    gap,
}: {
    label: string;
    count: number;
    cardWidth: `${number}%`;
    gap: number;
}) {
    const { colors } = useTheme();
    return (
        <View accessibilityLabel={label} style={{ gap }}>
            <View
                style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap,
                }}
            >
                {Array.from({ length: count }, (_, key) => (
                    <Card
                        key={key}
                        style={{
                            width: cardWidth,
                            minHeight: 88,
                            padding: 12,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <View
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 12,
                                backgroundColor: colors.surfaceMuted,
                            }}
                        />
                        <View style={{ flex: 1, gap: 8 }}>
                            <View
                                style={{
                                    height: 18,
                                    width: "70%",
                                    backgroundColor: colors.surfaceMuted,
                                    borderRadius: 4,
                                }}
                            />
                            <View
                                style={{
                                    height: 12,
                                    backgroundColor: colors.surfaceMuted,
                                    borderRadius: 4,
                                }}
                            />
                        </View>
                    </Card>
                ))}
            </View>
            <Card>
                {[0, 1, 2].map((key) => (
                    <View
                        key={key}
                        style={{
                            height: 64,
                            borderRadius: 12,
                            backgroundColor: colors.surfaceMuted,
                        }}
                    />
                ))}
            </Card>
        </View>
    );
}
