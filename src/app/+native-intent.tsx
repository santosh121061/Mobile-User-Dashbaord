import Constants from "expo-constants";
import { receiveIntent } from "@/auth/intents";
import { apiUrl } from "@/config/environment";
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  const scheme = Constants.expoConfig?.scheme;
  const appScheme = typeof scheme === "string" ? scheme : "userdashboard-dev";
  // Expo Router synthesizes the scheme root when launched from the app icon.
  if (
    initial &&
    ["", "/", `${appScheme}://`, `${appScheme}:///`].includes(path)
  )
    return "/";
  return receiveIntent(path, appScheme, apiUrl);
}
