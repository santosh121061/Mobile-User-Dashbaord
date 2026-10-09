type Names = { name: string; first_name: string; last_name: string };
/** Project each changed component independently, preserving omitted hidden components on the server. */
export function namePayload(
    values: Names,
    dirty: Partial<Record<keyof Names, boolean>>,
    editable: (field: string) => boolean | undefined,
    creating: boolean,
) {
    const body: Record<string, string | null> = {};
    if (editable("name") && (creating || dirty.name))
        body.name = values.name || null;
    for (const key of ["first_name", "last_name"] as const) {
        if (editable(key) && ((creating && values[key]) || dirty[key]))
            body[key] = values[key] || null;
    }
    if ("first_name" in body || "last_name" in body) delete body.name;
    return body;
}
