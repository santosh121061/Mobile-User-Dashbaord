import React, { createContext, useContext } from "react";
import type { Href } from "expo-router";
import type { Bootstrap } from "@/api/runtime";
import { useBootstrap } from "@/auth/session";
import type { StringKey } from "@/localization";

export type NavigationSurface = "tabs" | "more";
export type NavigationIcon = "home" | "users" | "activity" | "menu";
export type ExportResource =
  "users" | "roles" | "audit" | "notifications" | "keys";
export type ExportResourceDescriptor = Readonly<{
  resource: ExportResource;
  label: StringKey;
  module: string;
  capability?: string;
}>;
const exportResources: readonly ExportResourceDescriptor[] = [
  {
    resource: "users",
    label: "exportUsers",
    module: "users",
    capability: "users.export",
  },
  {
    resource: "roles",
    label: "exportRoles",
    module: "roles",
    capability: "roles.export",
  },
  {
    resource: "audit",
    label: "exportAudit",
    module: "activity",
    capability: "audit.export",
  },
  {
    resource: "keys",
    label: "keys",
    module: "keys",
    capability: "api.manage",
  },
  // The existing recipient-owned inbox export has no invented admin export grant.
  {
    resource: "notifications",
    label: "exportInbox",
    module: "notifications",
  },
];
export function permittedExportResources(bootstrap: Bootstrap) {
  return exportResources.filter(
    (item) =>
      bootstrap.features["api.enabled"] === true &&
      bootstrap.features["exports.enabled"] === true &&
      bootstrap.modules[item.module] === true &&
      (!item.capability || bootstrap.actions[item.capability] === true),
  );
}
export function exportResourceAllowed(
  resource: ExportResource,
  bootstrap: Bootstrap,
) {
  return permittedExportResources(bootstrap).some(
    (item) => item.resource === resource,
  );
}
export function searchableResources(bootstrap: Bootstrap) {
  return (
    [
      { resource: "users", label: "users", module: "users" },
      { resource: "audit", label: "activity", module: "activity" },
    ] as const
  ).filter(
    (item) =>
      bootstrap.features["api.enabled"] === true &&
      bootstrap.modules[item.module] === true,
  );
}
export type ModuleDescriptor = Readonly<{
  id: string;
  label: StringKey;
  route: Href;
  surfaces: readonly NavigationSurface[];
  tab?: Readonly<{ screen: string; icon: NavigationIcon }>;
  module?: string;
  feature?: string;
  capability?: string;
  anySource?: readonly Readonly<{ module: string; capability: string }>[];
  exportHub?: boolean;
}>;

// Compiled presentation metadata only. These booleans originate in the server
// bootstrap; record/field/delegation authority stays in the existing backend.
export const compiledModules: readonly ModuleDescriptor[] = [
  {
    id: "home",
    label: "home",
    route: "/(app)/(tabs)",
    surfaces: ["tabs"],
    tab: { screen: "index", icon: "home" },
  },
  {
    id: "users",
    label: "users",
    route: "/(app)/(tabs)/users",
    surfaces: ["tabs"],
    tab: { screen: "users", icon: "users" },
    module: "users",
  },
  {
    id: "activity",
    label: "activity",
    route: "/(app)/(tabs)/activity",
    surfaces: ["tabs"],
    tab: { screen: "activity", icon: "activity" },
    module: "activity",
  },
  {
    id: "more",
    label: "more",
    route: "/(app)/(tabs)/more",
    surfaces: ["tabs"],
    tab: { screen: "more", icon: "menu" },
  },
  { id: "profile", label: "profile", route: "/profile", surfaces: ["more"] },
  {
    id: "preferences",
    label: "appearance",
    route: "/preferences",
    surfaces: ["more"],
  },
  {
    id: "sessions",
    label: "sessions",
    route: "/sessions",
    surfaces: ["more"],
  },
  {
    id: "notifications",
    label: "notifications",
    route: "/notifications",
    surfaces: ["more"],
    module: "notifications",
  },
  {
    id: "roles",
    label: "roles",
    route: "/roles",
    surfaces: ["more"],
    module: "roles",
  },
  {
    id: "settings",
    label: "settings",
    route: "/settings",
    surfaces: ["more"],
    module: "settings",
  },
  {
    id: "keys",
    label: "keys",
    route: "/keys",
    surfaces: ["more"],
    module: "keys",
  },
  {
    id: "reports",
    label: "reports",
    route: "/reports",
    surfaces: ["more"],
    exportHub: true,
  },
];

export function moduleAvailable(item: ModuleDescriptor, bootstrap: Bootstrap) {
  return (
    bootstrap.features["api.enabled"] === true &&
    (!item.module || bootstrap.modules[item.module] === true) &&
    (!item.feature || bootstrap.features[item.feature] === true) &&
    (!item.capability || bootstrap.actions[item.capability] === true) &&
    (!item.exportHub || permittedExportResources(bootstrap).length > 0) &&
    (!item.anySource ||
      item.anySource.some(
        (source) =>
          bootstrap.modules[source.module] === true &&
          bootstrap.actions[source.capability] === true,
      ))
  );
}

export function modulesFor(
  surface: NavigationSurface,
  bootstrap: Bootstrap,
  registry: readonly ModuleDescriptor[] = compiledModules,
  includeUnavailable = false,
) {
  return registry.filter(
    (item) =>
      item.surfaces.includes(surface) &&
      (includeUnavailable || moduleAvailable(item, bootstrap)),
  );
}

const Registry = createContext(compiledModules);
export function ModuleRegistryProvider({
  children,
  modules = compiledModules,
}: React.PropsWithChildren<{ modules?: readonly ModuleDescriptor[] }>) {
  return <Registry.Provider value={modules}>{children}</Registry.Provider>;
}
export function useModules(
  surface: NavigationSurface,
  includeUnavailable = false,
) {
  return modulesFor(
    surface,
    useBootstrap(),
    useContext(Registry),
    includeUnavailable,
  );
}
