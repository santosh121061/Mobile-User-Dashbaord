import { Download } from "lucide-react-native";
import { IconButton } from "@/components/visuals";
import { Sheet } from "@/components/sheet";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { z } from "zod";
import { api, check } from "@/api/client";
import { operationSchema } from "@/api/contracts";
import { useBootstrap, useSession } from "@/auth/session";
import type { PrivateWork } from "@/auth/private-work";
import { Button, Chip, ErrorState, Label } from "@/components/ui";
import { t } from "@/localization";
import { apiUrl } from "@/config/environment";
import { useTheme } from "@/theme";
import {
  exportResourceAllowed,
  type ExportResource as Resource,
} from "@/modules/registry";
import { rememberOperation } from "./session-operations";
import { downloadBrowserExport } from "./browser-export";
export const bytes = (value: unknown): ArrayBuffer =>
  z.instanceof(ArrayBuffer).parse(value);
const columns: Record<Resource, string[]> = {
  users: ["name", "email", "status", "roles", "created_at"],
  roles: ["name", "members", "grants", "created_at"],
  audit: ["action", "actor", "outcome", "request_id", "created_at"],
  notifications: ["title", "message", "read_at", "created_at"],
  keys: ["name", "abilities", "last_used_at", "expires_at", "created_at"],
};
export function exportLocation(value: string, id: string) {
  const base = new URL(apiUrl);
  const url = new URL(value, base);
  if (
    url.origin !== base.origin ||
    url.pathname !==
      base.pathname.replace(/\/$/, "") + `/v1/operations/${id}/download` ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Invalid export destination");
  const expires = url.searchParams.get("expires");
  const signature = url.searchParams.get("signature");
  if (
    !expires ||
    !/^\d+$/.test(expires) ||
    !Number.isSafeInteger(Number(expires)) ||
    Number(expires) <= 0 ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new Error("Invalid export link");
  return { expires: Number(expires), signature };
}
export function ExportButton({
  resource,
  criteria = {},
  variant = "secondary",
  iconOnly = false,
  displayLabel,
}: {
  resource: Resource;
  criteria?: Record<string, string>;
  variant?: "secondary" | "tertiary";
  iconOnly?: boolean;
  displayLabel?: string;
}) {
  const snapshot = useBootstrap();
  const { captureWork } = useSession();
  const active = useRef<PrivateWork | null>(null);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const available = columns[resource].filter(
    (field) => resource !== "users" || snapshot.fields[field]?.view,
  );
  const [selected, setSelected] = useState<string[]>(available);
  const privateFile = useRef<File | null>(null);
  const { colors } = useTheme();
  useEffect(() => {
    const holder = privateFile;
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
      if (holder.current?.exists) holder.current.delete();
    };
  }, []);
  const permitted = exportResourceAllowed(resource, snapshot);
  const start = async () => {
    if (busy || active.current) return;
    let scope: PrivateWork;
    try {
      scope = captureWork();
    } catch {
      return;
    }
    active.current = scope;
    const cancelled = () => {
      if (mounted.current && active.current === scope) {
        setBusy(false);
        setOpen(false);
      }
    };
    scope.signal.addEventListener("abort", cancelled);
    setBusy(true);
    setError(null);
    try {
      const response = await api.POST("/v1/exports/{resource}", {
        params: { path: { resource } },
        body: {
          criteria,
          columns: selected.filter((field) => available.includes(field)),
          selection: { mode: "all", excluded: [] },
        },
        parseAs: "arrayBuffer",
        signal: scope.signal,
      });
      scope.assertCurrent();
      if (response.response.status === 202) {
        const text = new TextDecoder().decode(bytes(response.data));
        const operation = operationSchema.parse(JSON.parse(text));
        rememberOperation(operation.id, resource, snapshot, captureWork);
        setOpen(false);
        router.push(`/operations/${operation.id}`);
      } else {
        check(response);
        await shareBytes(bytes(response.data), privateFile, scope);
        scope.assertCurrent();
        setOpen(false);
      }
    } catch (failure) {
      if (scope.isCurrent()) setError(failure);
    } finally {
      scope.signal.removeEventListener("abort", cancelled);
      if (mounted.current && active.current === scope) setBusy(false);
      scope.release();
      if (active.current === scope) active.current = null;
    }
  };
  if (!permitted) return null;
  return (
    <>
      {!open ? (
        iconOnly ? (
          <IconButton
            label={t(
              resource === "users"
                ? "exportUsers"
                : resource === "roles"
                  ? "exportRoles"
                  : resource === "audit"
                    ? "exportAudit"
                    : resource === "notifications"
                      ? "exportInbox"
                      : "reports",
            )}
            onPress={() => {
              setSelected(available);
              setOpen(true);
            }}
          >
            <Download size={20} color={colors.brand.primary} />
          </IconButton>
        ) : (
          <Button
            displayLabel={displayLabel}
            label={t(
              resource === "users"
                ? "exportUsers"
                : resource === "roles"
                  ? "exportRoles"
                  : resource === "audit"
                    ? "exportAudit"
                    : resource === "notifications"
                      ? "exportInbox"
                      : "reports",
            )}
            variant={variant}
            onPress={() => {
              setSelected(available);
              setOpen(true);
            }}
          />
        )
      ) : (
        <Sheet
          title={t("reports")}
          close={() => {
            if (!busy) setOpen(false);
          }}
        >
          <Label size="caption">{t("exportHint")}</Label>
          {available.map((field) => (
            <Chip
              key={field}
              label={
                snapshot.fields[field]?.label ?? field.replaceAll("_", " ")
              }
              selected={selected.includes(field)}
              onPress={() =>
                setSelected((old) =>
                  old.includes(field)
                    ? old.filter((key) => key !== field)
                    : [...old, field],
                )
              }
            />
          ))}
          {!!error && <ErrorState error={error} />}
          <Button
            label={t("download")}
            loading={busy}
            disabled={!selected.some((field) => available.includes(field))}
            onPress={() => void start()}
          />
          <Button
            label={t("cancel")}
            variant="secondary"
            onPress={() => setOpen(false)}
            disabled={busy}
          />
          <Label size="caption" style={{ color: colors.text.secondary }}>
            {t("onlineOnly")}
          </Label>
        </Sheet>
      )}
    </>
  );
}
export async function shareBytes(
  buffer: ArrayBuffer,
  holder: { current: File | null },
  scope: PrivateWork,
) {
  scope.assertCurrent();
  if (!buffer.byteLength || buffer.byteLength > 32 * 1024 * 1024)
    throw new Error("Export size unsupported");
  if (Platform.OS === "web") {
    downloadBrowserExport(buffer, scope);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing unavailable on this platform");
  scope.assertCurrent();
  const file = new File(
    Paths.cache,
    `export-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`,
  );
  let created = false;
  const cleanup = () => {
    try {
      if (created && file.exists) file.delete();
      if (holder.current === file) holder.current = null;
    } catch {
      // Retain the owned handle so unmount can retry cleanup.
    }
  };
  scope.signal.addEventListener("abort", cleanup);
  try {
    scope.assertCurrent();
    file.create({ overwrite: false });
    created = true;
    holder.current = file;
    file.write(new Uint8Array(buffer));
    scope.assertCurrent();
    await Sharing.shareAsync(file.uri, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });
  } finally {
    scope.signal.removeEventListener("abort", cleanup);
    cleanup();
  }
}
export const exportPayload = z.object({ data: operationSchema });
