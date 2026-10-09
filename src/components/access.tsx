import { useBootstrap } from "@/auth/session";
import { ErrorState } from "./ui";
import { ApiError } from "@/api/client";
export function Access({
    module,
    action,
    children,
}: React.PropsWithChildren<
    { module: string; action?: string } | { module?: undefined; action: string }
>) {
    const snapshot = useBootstrap();
    return (!module || snapshot.modules[module]) &&
        (!action || snapshot.actions[action]) ? (
        children
    ) : (
        <ErrorState error={new ApiError(403, {}, null)} />
    );
}
