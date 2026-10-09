import { AppState } from "react-native";
jest.mock("expo-constants", () => ({
    __esModule: true,
    default: {
        expoConfig: {
            extra: {
                environment: "development",
                apiUrl: "http://127.0.0.1:9081/api",
            },
        },
    },
}));
jest.mock("expo-font", () => ({
    useFonts: () => [true, null],
    isLoaded: () => true,
    loadAsync: jest.fn(),
}));
jest.mock("expo-secure-store", () => ({
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device",
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined),
}));
Object.defineProperty(AppState, "currentState", {
    configurable: true,
    writable: true,
    value: "active",
});
