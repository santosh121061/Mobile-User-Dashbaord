import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import * as SecureStore from "@/storage/secure";
import tokens from "./tokens.json";
import { storageNamespace } from "@/config/environment";
import { useSession } from "@/auth/session";
type Mode = "light" | "dark" | "system";
const Context = createContext({
  colors: tokens.colors.light,
  mode: "system" as Mode,
  dark: false,
  setMode: (_mode: Mode) => {},
});
export function ThemeProvider({ children }: React.PropsWithChildren) {
  const system = useColorScheme();
  const [webSystem, setWebSystem] = useState(system);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window.matchMedia !== "function")
      return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setWebSystem(query.matches ? "dark" : "light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const { bootstrap } = useSession();
  const [local, setLocal] = useState<Mode | null>(null);
  const [override, setOverride] = useState<{
    snapshot: typeof bootstrap;
    value: Mode;
  } | null>(null);
  useEffect(() => {
    void SecureStore.getItemAsync(storageNamespace + ".signed-out-theme")
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system")
          setLocal(value);
      })
      .catch(() => {});
  }, []);
  const mode = bootstrap
    ? override?.snapshot === bootstrap
      ? override.value
      : (bootstrap.appearance.theme ?? "system")
    : (local ?? "system");
  const activeSystem = Platform.OS === "web" ? webSystem : system;
  const dark =
    mode === "dark" || (mode === "system" && activeSystem === "dark");
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const colors = dark ? tokens.colors.dark : tokens.colors.light;
    const style = document.createElement("style");
    style.textContent = `input:focus { outline: none; } input:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px ${colors.surface} inset; -webkit-text-fill-color: ${colors.text.primary}; caret-color: ${colors.text.primary}; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [dark]);
  const setMode = (value: Mode) => {
    if (bootstrap) {
      setOverride({ snapshot: bootstrap, value });
      return;
    }
    setLocal(value);
    void SecureStore.setItemAsync(
      storageNamespace + ".signed-out-theme",
      value,
    ).catch(() => {});
  };
  return (
    <Context.Provider
      value={{
        colors: dark ? tokens.colors.dark : tokens.colors.light,
        mode,
        dark,
        setMode,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTheme = () => useContext(Context);
export { tokens };
