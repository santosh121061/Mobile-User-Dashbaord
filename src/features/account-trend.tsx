import Svg, {
  Polyline,
  Polygon,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Label } from "@/components/ui";
import { number } from "@/localization";
import { useId } from "react";

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
      const x = days.length === 1 ? 150 : 3 + (index * 294) / (days.length - 1);
      const y = 69 - (day.count / maximum) * 66;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function AccountTrend({ days }: { days: readonly Day[] }) {
  const { colors } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const points = trendPoints(days);
  if (!points) return null;
  return (
    <View
      accessibilityLabel={days
        .map((day) => `${day.label}, ${number(day.count)}`)
        .join("; ")}
      accessible
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ height: 90, justifyContent: "space-between" }}>
          {[1, 0.5, 0].map((ratio) => (
            <Label key={ratio} size="caption" tone="secondary">
              {number(
                Math.round(
                  Math.max(1, ...days.map((day) => day.count)) * ratio,
                ),
              )}
            </Label>
          ))}
        </View>
        <Svg
          testID="account-trend"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          width="88%"
          height={90}
          viewBox="0 0 300 72"
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0"
                stopColor={colors.accent.chart}
                stopOpacity={0.16}
              />
              <Stop
                offset="1"
                stopColor={colors.accent.chart}
                stopOpacity={0.015}
              />
            </LinearGradient>
          </Defs>
          {[3, 20, 37, 54, 71].map((y) => (
            <Line
              key={y}
              x1={0}
              y1={y}
              x2={300}
              y2={y}
              stroke={colors.divider}
              strokeWidth={0.6}
            />
          ))}
          <Polygon points={`3,72 ${points} 297,72`} fill={`url(#${id})`} />
          <Polyline
            points={points}
            fill="none"
            stroke={colors.accent.chart}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        {days
          .filter(
            (_, index) =>
              index === 0 ||
              index === days.length - 1 ||
              index % Math.max(1, Math.ceil(days.length / 7)) === 0,
          )
          .map((day) => (
            <Label key={day.date} size="caption" tone="secondary">
              {day.label}
            </Label>
          ))}
      </View>
    </View>
  );
}
