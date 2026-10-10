import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { View, useWindowDimensions } from "react-native";
import { useId, useRef, useState } from "react";
import { useTheme } from "@/theme";

export function CanvasTint() {
  const { dark } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { width, height } = useWindowDimensions();
  const view = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const cx = width * (dark ? 1 : 0.96) - origin.x;
  const cy = height * (dark ? 0 : 0.1) - origin.y;
  const rx = width * (dark ? 1 : 0.96) * Math.SQRT2;
  const ry = height * (dark ? 1 : 0.9) * Math.SQRT2;
  return (
    <View
      ref={view}
      pointerEvents="none"
      accessible={false}
      style={{ position: "absolute", inset: 0 }}
      onLayout={() =>
        view.current?.measureInWindow((x, y) => setOrigin({ x, y }))
      }
    >
      <Svg accessible={false} width="100%" height="100%">
        <Defs>
          <RadialGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            cx={0}
            cy={0}
            rx={1}
            ry={1}
            r={1}
            gradientTransform={`translate(${cx} ${cy}) scale(${rx} ${ry})`}
          >
            <Stop
              offset={0}
              stopColor={dark ? "#174570" : "#E4F5FF"}
              stopOpacity={dark ? 0.133333 : 0.333333}
            />
            <Stop
              offset={dark ? 0.55 : 0.48}
              stopColor={dark ? "#174570" : "#E4F5FF"}
              stopOpacity={0}
            />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Reference gradients share one native SVG implementation. */
export function GradientFill({
  colors,
  angle = 110,
  locations,
}: {
  colors: readonly string[];
  angle?: number;
  locations?: readonly number[];
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const radians = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(radians),
    dy = Math.sin(radians);
  const length = Math.abs(size.width * dx) + Math.abs(size.height * dy);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{ position: "absolute", inset: 0 }}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize({ width: layout.width, height: layout.height })
      }
    >
      <Svg accessible={false} pointerEvents="none" width="100%" height="100%">
        <Defs>
          <LinearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            x1={(size.width - length * dx) / 2}
            y1={(size.height - length * dy) / 2}
            x2={(size.width + length * dx) / 2}
            y2={(size.height + length * dy) / 2}
          >
            {colors.map((color, index) => (
              <Stop
                key={index}
                offset={
                  locations?.[index] ?? index / Math.max(1, colors.length - 1)
                }
                stopColor={color}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
