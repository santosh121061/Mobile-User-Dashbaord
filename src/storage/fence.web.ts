// Browser preview session metadata is ephemeral, like its credential adapter.
let current: string | null = null;
export function activate(nonce: string) {
    current = nonce;
}
export function revoke() {
    current = null;
}
export function matches(nonce: string) {
    return current === nonce;
}
