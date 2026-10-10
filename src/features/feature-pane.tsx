import type { PropsWithChildren } from "react";
import { View, useWindowDimensions } from "react-native";
/** Keep forms readable in tablet/sidebar layouts while allowing text to grow. */
export function FeaturePane({
  children,
  wide = false,
}: PropsWithChildren<{ wide?: boolean }>) {
  const { width, height } = useWindowDimensions();
  const maxWidth = wide
    ? undefined
    : width >= 840 && height >= 480
      ? 502
      : width >= 600
        ? 492
        : undefined;
  return (
    <View
      style={{
        width: "100%",
        maxWidth,
        alignSelf: "center",
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}
