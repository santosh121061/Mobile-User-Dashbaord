// Browser review uses an ephemeral session. Credentials never enter browser storage.
const memory = new Map<string, string>();
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = "memory";
export async function getItemAsync(key: string) {
  return memory.get(key) ?? null;
}
export async function setItemAsync(
  key: string,
  value: string,
  _options?: unknown,
) {
  memory.set(key, value);
}
export async function deleteItemAsync(key: string) {
  memory.delete(key);
}
