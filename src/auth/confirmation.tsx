import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { Modal, View } from "react-native";
import { z } from "zod";
import { api, unwrap } from "@/api/client";
import { useSession } from "./session";
import { cancelledWork, type PrivateWork } from "./private-work";
import { Button, Card, ErrorState, Input, Label } from "@/components/ui";
import { t } from "@/localization";
import { useTheme } from "@/theme";
type Method = "POST" | "PUT" | "PATCH" | "DELETE";
type Perform = <T>(
    method: Method,
    path: string,
    action: (approval: string, signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
) => Promise<T>;
type Task = {
    scope: PrivateWork;
    action: (approval: string, signal: AbortSignal) => Promise<unknown>;
    resolve: (result: unknown) => void;
    reject: (error: unknown) => void;
    unsubscribe: () => void;
};
const context = createContext<Perform | null>(null);
export function ConfirmationProvider({ children }: React.PropsWithChildren) {
    const { refresh, captureWork, phase } = useSession();
    const { colors } = useTheme();
    const [pending, setPending] = useState<{
        method: Method;
        path: string;
    } | null>(null);
    const [password, setPassword] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState<unknown>(null);
    const task = useRef<Task | null>(null);
    const mounted = useRef(true);
    const close = useCallback(() => {
        const previous = task.current;
        task.current = null;
        previous?.unsubscribe();
        previous?.scope.release();
        previous?.reject(cancelledWork());
        if (mounted.current) {
            setPending(null);
            setPassword("");
            setError(null);
            setBusy(false);
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            close();
        };
    }, [close]);
    useEffect(() => {
        if (
            [
                "locked",
                "signedOut",
                "unavailable",
                "loggingOut",
                "storageBlocked",
            ].includes(phase)
        )
            close();
    }, [phase, close]);
    const perform: Perform = (method, path, action, callerSignal) =>
        new Promise((resolve, reject) => {
            if (callerSignal?.aborted) {
                reject(cancelledWork());
                return;
            }
            if (task.current) {
                reject(new Error("An action is already pending"));
                return;
            }
            let scope: PrivateWork;
            try {
                scope = captureWork();
            } catch (failure) {
                reject(failure);
                return;
            }
            const abort = () => {
                if (task.current?.scope === scope) close();
            };
            task.current = {
                scope,
                action,
                resolve: (result) =>
                    resolve(result as Awaited<ReturnType<typeof action>>),
                reject,
                unsubscribe: () => {
                    scope.signal.removeEventListener("abort", abort);
                    callerSignal?.removeEventListener("abort", abort);
                },
            };
            scope.signal.addEventListener("abort", abort);
            callerSignal?.addEventListener("abort", abort);
            if (scope.signal.aborted || callerSignal?.aborted) {
                close();
                return;
            }
            setPassword("");
            setError(null);
            setPending({ method, path });
        });
    const submit = async () => {
        const active = task.current;
        if (!pending || !active || busy) return;
        setBusy(true);
        setError(null);
        let executing = false;
        try {
            await refresh();
            active.scope.assertCurrent();
            if (task.current !== active) return;
            const request = api.POST("/v1/mobile/step-up", {
                body: {
                    method: pending.method,
                    path: pending.path,
                    current_password: password,
                },
                signal: active.scope.signal,
            });
            setPassword("");
            const approval = unwrap(
                await request,
                z.object({ approval: z.string() }),
            ).approval;
            active.scope.assertCurrent();
            if (task.current !== active) return;
            executing = true;
            const result = await active.action(approval, active.scope.signal);
            active.scope.assertCurrent();
            if (task.current !== active) return;
            task.current = null;
            active.unsubscribe();
            active.scope.release();
            active.resolve(result);
            setPending(null);
        } catch (failure) {
            if (task.current === active) {
                setPassword("");
                if (executing || !active.scope.isCurrent()) {
                    task.current = null;
                    active.unsubscribe();
                    active.scope.release();
                    active.reject(failure);
                    setPending(null);
                } else setError(failure);
            }
        } finally {
            if (mounted.current && (!task.current || task.current === active))
                setBusy(false);
        }
    };
    return (
        <context.Provider value={perform}>
            {children}
            <Modal
                visible={!!pending}
                transparent
                animationType="none"
                onRequestClose={() => {
                    if (!busy) close();
                }}
            >
                <View
                    style={{
                        flex: 1,
                        justifyContent: "center",
                        padding: 24,
                        backgroundColor: colors.overlay,
                    }}
                >
                    <Card>
                        <Label accessibilityRole="header" size="title">
                            {t("confirm")}
                        </Label>
                        <Label tone="secondary">{t("confirmHint")}</Label>
                        <Input
                            testID="confirmation-password"
                            label={t("currentPassword")}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoComplete="current-password"
                            autoFocus
                            maxLength={256}
                        />
                        {!!error && <ErrorState error={error} />}
                        <Button
                            testID="confirm-action"
                            label={t("confirm")}
                            onPress={() => void submit()}
                            loading={busy}
                            disabled={!password}
                        />
                        <Button
                            variant="secondary"
                            label={t("cancel")}
                            onPress={close}
                            disabled={busy}
                        />
                    </Card>
                </View>
            </Modal>
        </context.Provider>
    );
}
export function useConfirmation() {
    const value = useContext(context);
    const owner = useRef(new AbortController());
    useEffect(() => {
        if (owner.current.signal.aborted) owner.current = new AbortController();
        const current = owner.current;
        return () => current.abort();
    }, []);
    const perform = useCallback<Perform>(
        (method, path, action, callerSignal) => {
            if (!value)
                return Promise.reject(
                    new Error("Confirmation provider missing"),
                );
            const controller = new AbortController();
            const ownerSignal = owner.current.signal;
            const abort = () => controller.abort();
            ownerSignal.addEventListener("abort", abort);
            callerSignal?.addEventListener("abort", abort);
            if (ownerSignal.aborted || callerSignal?.aborted) abort();
            return value(method, path, action, controller.signal).finally(
                () => {
                    ownerSignal.removeEventListener("abort", abort);
                    callerSignal?.removeEventListener("abort", abort);
                },
            );
        },
        [value],
    );
    if (!value) throw new Error("Confirmation provider missing");
    return perform;
}
