import { File, Paths } from "expo-file-system";
import { storageNamespace } from "@/config/environment";

// Nonsecret installation/session marker. A missing, damaged or revoked marker never restores a keychain token.
const name =
    Array.from(storageNamespace).reduce(
        (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
        2166136261,
    ) >>> 0;
const file = () =>
    new File(Paths.document, `session-state-${name.toString(16)}.json`);
function write(value: object) {
    const target = file();
    target.create({ overwrite: true });
    target.write(JSON.stringify({ namespace: storageNamespace, ...value }));
}
export function activate(nonce: string) {
    write({ state: "active", nonce });
}
export function revoke() {
    write({ state: "revoked" });
}
export function matches(nonce: string) {
    const target = file();
    if (!target.exists) return false;
    try {
        const value = JSON.parse(target.textSync()) as Record<string, unknown>;
        return (
            value.namespace === storageNamespace &&
            value.state === "active" &&
            value.nonce === nonce
        );
    } catch {
        return false;
    }
}
