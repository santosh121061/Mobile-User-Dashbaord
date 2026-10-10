export function navigationMode(width: number) {
  return width < 600 ? "tabs" : width < 768 ? "rail" : "sidebar";
}
export function kpiColumns(width: number, fontScale: number) {
  const navigation = width < 600 ? 0 : width < 768 ? 72 : 240;
  const padding = width < 768 ? 32 : 48;
  return width >= 900 &&
    width - navigation - padding >= 4 * 120 * fontScale + 3 * 16
    ? 4
    : 2;
}
export function uniqueRows<T extends { id: string }>(
  pages: readonly { data: readonly T[] }[],
): T[] {
  const rows = new Map<string, T>();
  for (const page of pages) for (const row of page.data) rows.set(row.id, row);
  return [...rows.values()];
}
export const requiresLocalLock = (backgroundedAt: number, resumedAt: number) =>
  resumedAt < backgroundedAt || resumedAt - backgroundedAt >= 180000;
