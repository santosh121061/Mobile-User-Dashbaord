import Constants from "expo-constants";
import { receiveIntent } from "@/auth/intents";
import { apiUrl } from "@/config/environment";
export function redirectSystemPath({
    path,
}: {
    path: string;
    initial: boolean;
}) {
    const scheme = Constants.expoConfig?.scheme;
    return receiveIntent(
        path,
        typeof scheme === "string" ? scheme : "userdashboard-dev",
        apiUrl,
    );
}
