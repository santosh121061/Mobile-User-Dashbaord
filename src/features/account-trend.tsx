import Svg, { Polyline } from "react-native-svg";
import { View } from "react-native";
import { useTheme } from "@/theme";

type Day = { date: string; label: string; count: number };

// Fixed logical coordinates scale to the card width; the existing labelled
// day/count rows remain the accessible, exact representation of this series.
export function trendPoints(days: readonly Day[]): string | null {
    if (
        !days.length ||
        days.length > 30 ||
        days.some((day) => !Number.isFinite(day.count) || day.count < 0)
    )
        return null;
    const maximum = Math.max(1, ...days.map((day) => day.count));
    return days
        .map((day, index) => {
            const x =
                days.length === 1 ? 150 : 3 + (index * 294) / (days.length - 1);
            const y = 69 - (day.count / maximum) * 66;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
}

export function AccountTrend({ days }: { days: readonly Day[] }) {
    const { colors } = useTheme();
    const points = trendPoints(days);
    if (!points) return null;
    return (
        <View
            testID="account-trend"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <Svg width="100%" height={72} viewBox="0 0 300 72">
                <Polyline
                    points={points}
                    fill="none"
                    stroke={colors.brand.primary}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            </Svg>
        </View>
    );
}
