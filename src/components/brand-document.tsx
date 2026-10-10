import { useEffect } from "react";
import { Platform } from "react-native";
import { useBranding, brandAssetUrl } from "./brand";

/** Browser identity is driven by the same public settings; native icons are build assets. */
export function BrandDocument() {
  const branding = useBranding();
  useEffect(() => {
    if (Platform.OS !== "web" || !branding) return;
    document.title = branding.name;
    const href = brandAssetUrl(branding.favicon);
    if (!href) return;
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = href;
    document.head.appendChild(icon);
    return () => icon.remove();
  }, [branding]);
  return null;
}
