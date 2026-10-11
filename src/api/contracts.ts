import { z } from "zod";
import { availabilityReadFields, availabilityRevisionSchema } from "./availability";
import { idSchema, userSchema, dictionary, pageSchema, paginationMetaSchema, auditSchema } from "./runtime";
export const roleScopeSchema = z.enum(["all", "self", "created", "assigned"]);
export type RoleScope = z.infer<typeof roleScopeSchema>;
// Developing additions stay optional on reads until the deployed server supplies them.
const roleMetadataFields = {
    description: z.string().nullable().optional(),
    default_scope: roleScopeSchema.nullable().optional(),
    updated_at: z.iso.datetime({ offset: true }).nullable().optional(),
    assigned_count: z.number().int().nonnegative().nullable().optional(),
    assigned_count_scope: z.literal("visible_unarchived_accounts").optional(),
    can_edit: z.boolean().optional(),
};
export const rolePresetSchema = z.enum(["viewer", "editor", "manager"]);
export type RolePreset = z.infer<typeof rolePresetSchema>;
const roleWriteFields = {
    availability_revision: availabilityRevisionSchema.optional(),
    name: z.string(),
    description: z.string().max(500).nullable().optional(),
    default_scope: roleScopeSchema.nullable().optional(),
};
const roleGrantsSchema = z.array(z.string());
const roleScopesSchema = z.record(z.string(), roleScopeSchema);
const roleFieldsSchema = z.record(z.string(), z.object({ view: z.boolean(), edit: z.boolean() }));
export const roleWriteSchema = z.union([
    z.strictObject({
        ...roleWriteFields,
        preset: rolePresetSchema,
        grants: roleGrantsSchema.optional(),
        scopes: roleScopesSchema.optional(),
        fields: roleFieldsSchema.optional(),
    }),
    z.strictObject({
        ...roleWriteFields,
        preset: z.undefined().optional(),
        grants: roleGrantsSchema,
        scopes: roleScopesSchema,
        fields: roleFieldsSchema,
    }),
]);
export type RoleWrite = z.infer<typeof roleWriteSchema>;
export const verificationFilterSchema = z.enum(["verified", "unverified"]).nullable().optional();
export const userLifecycleActionSchema = z.enum(["suspend", "reactivate"]);
export type UserLifecycleAction = z.infer<typeof userLifecycleActionSchema>;
const passwordLinkUserFields = {
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    email: z.string().refine((email) => !/[\u0000-\u001f\u007f]/.test(email), "Email control characters are prohibited").trim().pipe(z.email({ pattern: z.regexes.rfc5322Email }).max(254).toLowerCase()),
    phone: z.string().regex(/^\+[1-9][0-9]{6,14}$/),
    role_ids: z.array(z.number().int().positive()).max(20).refine((ids) => new Set(ids).size === ids.length, "Role IDs must be distinct").optional(),
    provisioning: z.literal("password_link"),
};
export const passwordLinkUserCreateSchema = z.union([
    z.strictObject({
        ...passwordLinkUserFields,
        lifecycle_status: z.enum(["active", "pending"]),
        status: z.enum(["enabled", "disabled"]).optional(),
    }),
    z.strictObject({
        ...passwordLinkUserFields,
        lifecycle_status: z.undefined().optional(),
        status: z.enum(["enabled", "disabled"]),
    }),
]);
export type PasswordLinkUserCreate = z.infer<typeof passwordLinkUserCreateSchema>;
export const userStatusCountsSchema = z.strictObject({
    active: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    suspended: z.number().int().nonnegative(),
    disabled: z.number().int().nonnegative(),
});
export const userPageSchema = pageSchema(userSchema).extend({
    meta: paginationMetaSchema.extend({
        status_counts: userStatusCountsSchema.nullable().optional(),
    }).optional(),
});
const rolePresetDefinitionSchema = z.object({
    label: z.string(),
    grants: z.array(z.string()),
    scopes: dictionary(roleScopeSchema),
    fields: dictionary(z.object({ view: z.boolean(), edit: z.boolean() })),
    available: z.boolean(),
});
export const roleCreateContextSchema = z.object({
    ...availabilityReadFields,
    field_catalog: dictionary(z.string()).optional(),
    field_delegatable: dictionary(z.object({ view: z.boolean(), edit: z.boolean() })).optional(),
    delegatable: dictionary(z.array(roleScopeSchema)).optional(),
    presets: z.object({
        viewer: rolePresetDefinitionSchema,
        editor: rolePresetDefinitionSchema,
        manager: rolePresetDefinitionSchema,
    }),
    catalog: dictionary(z.string()),
    scope_options: z.record(roleScopeSchema, z.string()),
});
const dailyMetricSchema = z.number().int().nonnegative().nullable();
export const dashboardSchema = z.object({
    metrics: dictionary(z.number()),
    new_users: z.array(z.object({ date: z.string(), label: z.string(), count: z.number() })),
    recent: z.array(auditSchema),
    timezone: z.string().optional(),
    period: z.union([z.literal(7), z.literal(30)]).optional(),
    daily_metrics: z.object({
        total_users: dailyMetricSchema,
        active_today: dailyMetricSchema,
        events_today: dailyMetricSchema,
        roles: dailyMetricSchema,
    }).optional(),
    activity_series: z.array(z.object({
        date: z.iso.date(),
        label: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
        count: z.number().int().nonnegative(),
    })).optional(),
    activity_precision_seconds: z.literal(60).optional(),
});
export const auditQuerySchema = z.strictObject({
    search: z.string().max(100).optional(),
    state: z.enum(["success", "denied", "failed"]).optional(),
    outcome: z.string().optional(),
    category: z.enum(["users", "security", "reports"]).optional(),
    period: z.enum(["today", "7d", "all"]).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    actor_id: z.number().int().positive().optional(),
    subject_type: z.enum(["user", "role"]).optional(),
    subject_id: z.number().int().positive().optional(),
    page: z.number().int().positive().optional(),
    per_page: z.number().int().min(1).max(100).optional(),
}).superRefine((query, context) => {
    if (query.subject_id !== undefined && query.subject_type === undefined)
        context.addIssue({ code: "custom", path: ["subject_type"], message: "Subject type is required with subject ID" });
    if (query.period !== undefined && query.period !== "all" && (query.from !== undefined || query.to !== undefined))
        context.addIssue({ code: "custom", path: ["period"], message: "Relative periods cannot be combined with explicit date bounds" });
});
export const roleListSchema = z.object({
    id: idSchema,
    name: z.string(),
    permissions: z.array(z.object({ name: z.string() })).optional(),
    ...roleMetadataFields,
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
    ...availabilityReadFields,
    effects: dictionary(z.enum(["allow", "deny"])),
    scopes: dictionary(z.string()),
    fields: z.array(fieldRule),
    assigned_ids: z.array(idSchema),
    revision: z.number(),
    effective: z.array(effectiveRuleSchema),
    catalog: dictionary(z.string()),
    field_catalog: dictionary(z.string()),
    delegatable: dictionary(z.array(z.string())),
    field_delegatable: dictionary(z.object({ view: z.boolean(), edit: z.boolean() })),
    delegation: z
        .object({ rules: z.array(scopeRule), fields: z.array(fieldRule) })
        .nullable(),
});
const directAccessEffectSchema = z.enum(["inherit", "allow", "deny"]);
// Omitted mode keeps the server's legacy replacement behavior. Mobile saves use patch.
export const directAccessWriteSchema = z.strictObject({
    effects: z.record(z.string(), directAccessEffectSchema),
    scopes: z.record(z.string(), z.string()),
    fields: z.record(z.string(), z.strictObject({
        view: directAccessEffectSchema,
        edit: directAccessEffectSchema,
    })),
    assigned_ids: z.array(z.number().int().positive()).max(500).refine(ids => new Set(ids).size === ids.length, "Assignment IDs must be distinct"),
    availability_revision: availabilityRevisionSchema.optional(),
    update_mode: z.enum(["patch", "replace"]).optional(),
});
export type DirectAccessWrite = z.infer<typeof directAccessWriteSchema>;
export const roleSchema = z.object({
    ...availabilityReadFields,
    id: idSchema,
    name: z.string(),
    grants: z.array(z.string()),
    scopes: z.array(z.object({ name: z.string(), scope: roleScopeSchema })),
    fields: z.array(fieldRule),
    ...roleMetadataFields,
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
