import type { PropsWithChildren } from "react";
import { View } from "react-native";
/** Keep forms readable in tablet/sidebar layouts while allowing text to grow. */
export function FeaturePane({
    children,
    wide = false,
}: PropsWithChildren<{ wide?: boolean }>) {
    return (
        <View
            style={{
                width: "100%",
                maxWidth: wide ? 960 : 720,
                alignSelf: "center",
                gap: 16,
            }}
        >
            {children}
        </View>
    );
}
