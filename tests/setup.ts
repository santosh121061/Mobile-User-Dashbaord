import { AppState } from "react-native";
import { cleanup } from "@testing-library/react-native";
import type { Query } from "@tanstack/react-query";
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
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

const fixtureQueries = new Set<Query>();
let stopTrackingQueries: (() => void) | undefined;
beforeEach(() => {
  const { queryClient } = jest.requireActual<typeof import("../src/api/query")>("../src/api/query");
  stopTrackingQueries = queryClient.getQueryCache().subscribe(({ query }) => {
    fixtureQueries.add(query);
  });
});
afterEach(async () => {
  cleanup();
  const { queryClient } = jest.requireActual<typeof import("../src/api/query")>("../src/api/query");
  await queryClient.cancelQueries();
  queryClient.clear();
  stopTrackingQueries?.();
  // Logout removes observed queries from the cache before unmount schedules GC.
  // Dispose those detached fixture queries as well as the current cache.
  for (const query of fixtureQueries) query.destroy();
  fixtureQueries.clear();
});
