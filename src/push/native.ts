import { Platform } from "react-native";
import { z } from "zod";
import { storageNamespace } from "@/config/environment";
import * as SecureStore from "@/storage/secure";
import type { PrivateWork } from "@/auth/private-work";

type Notifications = typeof import("expo-notifications");
let sdk: Notifications | null = null;
let loading: Promise<Notifications> | null = null;
let cleaning: Promise<void> | null = null;
let epoch = 0;
let cached: { project: string; token: string } | null = null;
export const nativePushSupported = () =>
  Platform.OS === "android" || Platform.OS === "ios";
export class PushPermissionDenied extends Error {}
export class PushNativeUnavailable extends Error {}

async function load(scope: PrivateWork): Promise<Notifications> {
  scope.assertCurrent();
  if (!nativePushSupported() || cleaning) throw new PushNativeUnavailable();
  if (sdk) return sdk;
  if (!loading) {
    const generation = epoch;
    const pending = (async () => {
      // Metro and the Jest Expo preset both support lazy CommonJS loading.
      // Keep the optional native module unloaded until configured private work starts.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const notifications: Notifications = require("expo-notifications");
      // App lifecycle owns rotation. Disable the SDK's persisted background registration queue.
      await notifications.setAutoServerRegistrationEnabledAsync(false);
      if (generation !== epoch) throw new PushNativeUnavailable();
      sdk = notifications;
      return notifications;
    })();
    loading = pending;
    void pending
      .finally(() => {
        if (loading === pending) loading = null;
      })
      .catch(() => {});
  }
  const result = await loading;
  scope.assertCurrent();
  return result;
}

export async function preparePush(
  scope: PrivateWork,
  project: string,
  prompt: boolean,
) {
  const notifications = await load(scope);
  if (Platform.OS === "android") {
    await notifications.setNotificationChannelAsync("account-notifications", {
      name: "Account notifications",
      importance: notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE,
    });
    scope.assertCurrent();
  }
  let permission = await notifications.getPermissionsAsync();
  scope.assertCurrent();
  if (!permission.granted && prompt) {
    permission = await notifications.requestPermissionsAsync();
    scope.assertCurrent();
  }
  if (!permission.granted) throw new PushPermissionDenied();
  if (!cached || cached.project !== project) {
    const result = await notifications.getExpoPushTokenAsync({
      projectId: project,
      // Same fixed official endpoint; explicit URL prevents SDK auto-registration being enabled.
      url: "https://exp.host/--/api/v2/push/getExpoPushToken",
    });
    scope.assertCurrent();
    const token = z
      .string()
      .max(255)
      .regex(/^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/)
      .parse(result.data);
    cached = { project, token };
  }
  const key = storageNamespace + ".push-installation";
  const stored = await SecureStore.getItemAsync(key);
  scope.assertCurrent();
  let installation = z.string().uuid().safeParse(stored);
  if (!installation.success) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto: typeof import("expo-crypto") = require("expo-crypto");
    scope.assertCurrent();
    const id = crypto.randomUUID();
    await SecureStore.setItemAsync(key, id, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    scope.assertCurrent();
    installation = z.string().uuid().safeParse(id);
  }
  if (!installation.success) throw new PushNativeUnavailable();
  return {
    installation_id: installation.data,
    project_id: project,
    platform: Platform.OS as "android" | "ios",
    push_token: cached.token,
  };
}

export async function listenPush(
  scope: PrivateWork,
  changed: () => void,
  tapped: (data: unknown) => void,
  received: (data: unknown) => void,
) {
  const notifications = await load(scope);
  scope.assertCurrent();
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const token = notifications.addPushTokenListener(() => {
    cached = null;
    changed();
  });
  const response = notifications.addNotificationResponseReceivedListener(
    (event) => {
      tapped(event.notification.request.content.data);
      notifications.clearLastNotificationResponse();
    },
  );
  const notice = notifications.addNotificationReceivedListener((event) =>
    received(event.request.content.data),
  );
  const previous = notifications.getLastNotificationResponse();
  notifications.clearLastNotificationResponse();
  if (previous) tapped(previous.notification.request.content.data);
  return () => {
    token.remove();
    response.remove();
    notice.remove();
  };
}

/** Never imports the native SDK in an unconfigured app, and never keeps an auth credential. */
export function clearNativePush(): Promise<void> {
  epoch++;
  cached = null;
  if (cleaning) return cleaning;
  if (!sdk) return Promise.resolve();
  const notifications = sdk;
  const task = (async () => {
    notifications.clearLastNotificationResponse();
    await notifications
      .setAutoServerRegistrationEnabledAsync(false)
      .catch(() => {});
    await Promise.allSettled([
      notifications.dismissAllNotificationsAsync(),
      notifications.setBadgeCountAsync(0),
      notifications.unregisterForNotificationsAsync(),
    ]);
  })();
  cleaning = task;
  void task
    .finally(() => {
      if (cleaning === task) cleaning = null;
    })
    .catch(() => {});
  return task;
}
