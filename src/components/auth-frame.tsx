import { View } from "react-native";
import { Screen } from "./ui";
import { Brand } from "./brand";

/** Shared identity and readable form width for lock and recovery flows. */
export function AuthFrame({ children }: React.PropsWithChildren) {
    return (
        <Screen
            scroll
            contentStyle={{
                paddingHorizontal: 24,
                flexGrow: 1,
                justifyContent: "center",
                paddingVertical: 40,
            }}
        >
            <View
                style={{
                    width: "100%",
                    maxWidth: 440,
                    alignSelf: "center",
                    gap: 28,
                }}
            >
                <Brand variant="auth" />
                {children}
            </View>
        </Screen>
    );
}
