import { z } from "zod";
import { idSchema, userSchema, dictionary } from "./runtime";
export const roleListSchema = z.object({
    id: idSchema,
    name: z.string(),
    permissions: z.array(z.object({ name: z.string() })).optional(),
});
export const targetSchema = z.object({
    user: userSchema,
    actions: z.record(z.string(), z.boolean()),
    role_options: z.array(roleListSchema),
    action_reasons: dictionary(z.string()),
    governance: z.object({ owner: z.boolean(), locked: z.boolean(), membership_change_allowed: z.boolean(), lock_allowed: z.boolean() }).nullable(),
    avatar_available: z.boolean(),
});
export const creationSchema = z.object({role_options: z.array(roleListSchema), can_create_owner: z.boolean()});
export const listContextSchema = z.object({role_options: z.array(roleListSchema)});
export const profileSchema = userSchema.extend({
    name: z.string(), email: z.string(), status: z.enum(["enabled", "disabled"]),
    email_verified_at: z.string().nullable(), first_name: z.string().nullable(), last_name: z.string().nullable(), phone: z.string().nullable(),
    avatar_available: z.boolean(), email_security: z.boolean(),
    appearance: z.object({theme: z.enum(["light","dark","system"]).optional(),timezone: z.string().optional(), date_format: z.enum(["d M Y","d/m/Y","m/d/Y"]).optional()}).passthrough(),
});
const fieldRule = z.object({
    field: z.string(),
    can_view: z.boolean().nullable(),
    can_edit: z.boolean().nullable(),
});
const scopeRule = z.object({ name: z.string(), scope: z.string() });
export const effectiveRuleSchema = z.object({
    key: z.string(),
    label: z.string(),
    allowed: z.boolean(),
    scopes: z.array(z.string()),
    scope_description: z.string(),
    origin: z.string(),
    reason: z.string(),
});
export const accessSchema = z.object({
    effects: dictionary(z.enum(["allow", "deny"])),
    scopes: dictionary(z.string()),
    fields: z.array(fieldRule),
    assigned_ids: z.array(idSchema),
    revision: z.number(),
    effective: z.array(effectiveRuleSchema),
    catalog: z.record(z.string(), z.string()),
    field_catalog: z.record(z.string(), z.string()),
    delegatable: z.record(z.string(), z.array(z.string())),
    field_delegatable: z.record(z.string(), z.object({ view: z.boolean(), edit: z.boolean() })),
    delegation: z
        .object({ rules: z.array(scopeRule), fields: z.array(fieldRule) })
        .nullable(),
});
export const roleSchema = z.object({
    id: idSchema,
    name: z.string(),
    grants: z.array(z.string()),
    scopes: z.array(scopeRule),
    fields: z.array(fieldRule),
});
export const operationSchema = z.object({
    id: z.string().uuid(),
    kind: z.string(),
    status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
    total: z.number(),
    updated_count: z.number(),
    skipped_count: z.number(),
    message: z.string().nullable(),
    download_url: z.string().nullable(),
    failures: z.array(z.unknown()).optional(),
    action_label: z.string().nullable().optional(),
});
