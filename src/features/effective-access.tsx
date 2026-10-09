import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { t } from "@/localization";
import { effectiveRuleSchema } from "@/api/contracts";
// Read the resolver's explanation verbatim; the client does not recompute grants.
const explanation = z.array(effectiveRuleSchema);
export function EffectiveAccess({ value }: { value: unknown }) {
    const parsed = explanation.safeParse(value);
    return (
        <>
            <Label size="title">{t("effectiveAccess")}</Label>
            <Label size="caption" tone="secondary">
                {t("effectiveAccessHint")}
            </Label>
            {parsed.success ? (
                parsed.data.map((rule) => (
                    <Card key={rule.key}>
                        <Label size="bodyMedium">
                            {rule.label}: {t(rule.allowed ? "allow" : "deny")}
                        </Label>
                        <Label size="caption">
                            {t("accessOrigin")}: {rule.origin || t("inherit")}
                        </Label>
                        <Label size="caption">
                            {t("accessScope")}:{" "}
                            {rule.scope_description ||
                                rule.scopes.join(" OR ") ||
                                "-"}
                        </Label>
                        <Label size="caption" tone="secondary">
                            {t("accessReason")}: {rule.reason}
                        </Label>
                    </Card>
                ))
            ) : (
                <Label>{t("unavailable")}</Label>
            )}
        </>
    );
}
