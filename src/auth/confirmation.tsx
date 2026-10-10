import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal, View, useWindowDimensions } from "react-native";
import { useSession } from "./session";
import { cancelledWork, type PrivateWork } from "./private-work";
import { Button, Card, ErrorState, Label } from "@/components/ui";
import { t } from "@/localization";
import { useTheme } from "@/theme";
type Method = "POST" | "PUT" | "PATCH" | "DELETE";
type Perform = <T>(
  method: Method,
  path: string,
  action: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal,
) => Promise<T>;
type Task = {
  scope: PrivateWork;
  action: (signal: AbortSignal) => Promise<unknown>;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  unsubscribe: () => void;
};
const context = createContext<Perform | null>(null);
export function ConfirmationProvider({ children }: React.PropsWithChildren) {
  const { refresh, captureWork, phase } = useSession();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<{
    method: Method;
    path: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
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
      executing = true;
      const result = await active.action(active.scope.signal);
      active.scope.assertCurrent();
      if (task.current !== active) return;
      task.current = null;
      active.unsubscribe();
      active.scope.release();
      active.resolve(result);
      setPending(null);
    } catch (failure) {
      if (task.current === active) {
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
        animationType={width < 600 ? "slide" : "fade"}
        onRequestClose={() => {
          if (!busy) close();
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: width < 600 ? "flex-end" : "center",
            padding: width < 600 ? 0 : 24,
            backgroundColor: colors.overlay,
          }}
        >
          <Card
            style={{
              width: "100%",
              maxWidth: 470,
              alignSelf: "center",
              borderRadius: 28,
              borderBottomStartRadius: width < 600 ? 0 : 28,
              borderBottomEndRadius: width < 600 ? 0 : 28,
              padding: 20,
              paddingBottom: 20 + insets.bottom,
            }}
          >
            <View
              style={{
                width: 34,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.controlBorder,
                alignSelf: "center",
                marginBottom: 8,
              }}
            />
            <Label accessibilityRole="header" size="appbar">
              {t("confirm")}
            </Label>
            <Label tone="secondary">{t("confirmHint")}</Label>
            {!!error && <ErrorState error={error} />}
            <Button
              testID="confirm-action"
              label={t("confirm")}
              onPress={() => void submit()}
              loading={busy}
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
        return Promise.reject(new Error("Confirmation provider missing"));
      const controller = new AbortController();
      const ownerSignal = owner.current.signal;
      const abort = () => controller.abort();
      ownerSignal.addEventListener("abort", abort);
      callerSignal?.addEventListener("abort", abort);
      if (ownerSignal.aborted || callerSignal?.aborted) abort();
      return value(method, path, action, controller.signal).finally(() => {
        ownerSignal.removeEventListener("abort", abort);
        callerSignal?.removeEventListener("abort", abort);
      });
    },
    [value],
  );
  if (!value) throw new Error("Confirmation provider missing");
  return perform;
}
