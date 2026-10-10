import { z } from "zod";
import * as SecureStore from "./secure";
import * as fence from "./fence";
import { storageNamespace } from "@/config/environment";
const key = storageNamespace + ".session";
const biometricKey = storageNamespace + ".biometric";
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const shape = z.object({
  token: z.string().min(1).max(2048),
  expires: z.string().datetime({ offset: true }),
  nonce: z.string().min(1),
});
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
}
export class StorageCleanupError extends Error {
  constructor() {
    super("Session storage cleanup failed");
  }
}
export class StorageWriteError extends Error {
  constructor() {
    super("Session storage write failed");
  }
}
export function loadSession() {
  return serial(async () => {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const value = shape.parse(JSON.parse(raw));
    return fence.matches(value.nonce) ? value : null;
  });
}
export function loadBiometric() {
  return serial(
    async () => (await SecureStore.getItemAsync(biometricKey)) === "true",
  );
}
export function saveSession(
  token: string,
  expires: string,
  current: () => boolean,
) {
  return serial(async () => {
    if (!current()) return false;
    // A correlation marker, never a credential or authorization secret.
    const nonce =
      Date.now().toString(36) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2);
    try {
      await SecureStore.setItemAsync(
        key,
        JSON.stringify({ token, expires, nonce }),
        options,
      );
      if (!current()) return false;
      fence.activate(nonce);
    } catch {
      throw new StorageWriteError();
    }
    return true;
  });
}
export function clearSession() {
  // Revoke synchronously, before queued keychain I/O or remote logout can wait.
  let fenceFailed = false;
  try {
    fence.revoke();
  } catch {
    fenceFailed = true;
  }
  return serial(async () => {
    let failed = fenceFailed;
    for (const item of [key, biometricKey]) {
      try {
        await SecureStore.deleteItemAsync(item);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new StorageCleanupError();
  });
}
export function saveBiometric(enabled: boolean, current: () => boolean) {
  return serial(async () => {
    if (!current()) return false;
    await SecureStore.setItemAsync(biometricKey, String(enabled), options);
    return current();
  });
}
