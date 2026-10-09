import { en, type StringKey } from "./en";
export type { StringKey } from "./en";
export const t = (
    key: StringKey,
    values: Record<string, string | number> = {},
) =>
    en[key].replace(/\{(\w+)\}/g, (match, name: string) =>
        String(values[name] ?? match),
    );
export const number = (value: number) =>
    new Intl.NumberFormat("en").format(value);
export type DateFormat = "d M Y" | "d/m/Y" | "m/d/Y";
type DatePreferences = { timezone?: string; date_format?: DateFormat };
let datePreferences: () => DatePreferences | null | undefined = () => null;
/** Bind display preferences to the active session, without persisting another account's settings. */
export function attachDatePreferences(read: typeof datePreferences) {
    datePreferences = read;
    return () => {
        if (datePreferences === read) datePreferences = () => null;
    };
}
export function date(
    value: string | null | undefined,
    timezone?: string,
    format?: DateFormat,
) {
    if (!value) return "—";
    try {
        const preferences = datePreferences();
        const timeZone = timezone ?? preferences?.timezone ?? "UTC";
        const selected = format ?? preferences?.date_format ?? "d M Y";
        const instant = new Date(value);
        const parts = new Intl.DateTimeFormat("en", {
            day: "2-digit",
            month: selected === "d M Y" ? "short" : "2-digit",
            year: "numeric",
            timeZone,
        }).formatToParts(instant);
        const part = (name: Intl.DateTimeFormatPartTypes) =>
            parts.find((item) => item.type === name)?.value ?? "";
        const calendar =
            selected === "d/m/Y"
                ? `${part("day")}/${part("month")}/${part("year")}`
                : selected === "m/d/Y"
                  ? `${part("month")}/${part("day")}/${part("year")}`
                  : `${part("day")} ${part("month")} ${part("year")}`;
        const time = new Intl.DateTimeFormat("en", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            timeZone,
        }).format(instant);
        return `${calendar}, ${time}`;
    } catch {
        return "—";
    }
}
