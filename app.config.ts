import type { ExpoConfig } from "expo/config";

const environment = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const isDevelopment = environment === "development";
const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
if (
  !isDevelopment &&
  (!apiUrl.startsWith("https://") ||
    !process.env.APP_ANDROID_PACKAGE ||
    !process.env.APP_IOS_BUNDLE_ID ||
    !process.env.APP_LINK_SCHEME)
) {
  throw new Error(
    "Preview/release requires HTTPS API URL and explicit app identifiers/link scheme.",
  );
}
const config: ExpoConfig = {
  name: "User Dashboard",
  slug: "user-dashboard-development",
  version: "0.1.0",
  orientation: "default",
  userInterfaceStyle: "automatic",
  icon: "./assets/development-mark.png",
  scheme: process.env.APP_LINK_SCHEME ?? "userdashboard-dev",
  ios: {
    supportsTablet: true,
    bundleIdentifier:
      process.env.APP_IOS_BUNDLE_ID ?? "com.example.userdashboard.dev",
    infoPlist: {
      NSFaceIDUsageDescription: "Unlock your signed-in session.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: process.env.APP_ANDROID_PACKAGE ?? "com.example.userdashboard.dev",
    permissions: [],
    adaptiveIcon: {
      foregroundImage: "./assets/development-mark.png",
      backgroundColor: "#2563EB",
    },
  },
  plugins: [
    "expo-router",
    ["expo-secure-store", { configureAndroidBackup: true }],
    "expo-font",
    "expo-notifications",
    [
      "expo-local-authentication",
      { faceIDPermission: "Unlock your signed-in session." },
    ],
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: isDevelopment,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildArchs: ["arm64-v8a"],
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          enableBundleCompression: true,
          useLegacyPackaging: true,
        },
        ios: { deploymentTarget: "16.4" },
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/development-mark.png",
        imageWidth: 80,
        backgroundColor: "#F7FAFF",
        dark: { backgroundColor: "#0B1220" },
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Choose a profile photo.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
  ],
  updates: { enabled: false },
  extra: { environment, apiUrl },
};
export default config;
