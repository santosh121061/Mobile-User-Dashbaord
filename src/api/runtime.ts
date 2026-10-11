import { z } from "zod";
import { availabilityReadFields } from "./availability";

// Validate dynamic, permission-projected records. Missing hidden fields stay missing.
export const idSchema = z
    .union([z.string(), z.number().int().nonnegative()])
    .transform(String);
export const dictionary = <T extends z.ZodType>(value: T) =>
    z.preprocess(
        (input) => (Array.isArray(input) && input.length === 0 ? {} : input),
        z.record(z.string(), value),
    );
export const jsonValueSchema = z.json();
export type JsonValue = z.infer<typeof jsonValueSchema>;
export const auditFieldChangeSchema = z.object({
    field: z.string(),
    label: z.string(),
    before: jsonValueSchema,
    after: jsonValueSchema,
});
export type AuditFieldChange = z.infer<typeof auditFieldChangeSchema>;
export const userLifecycleStatusSchema = z.enum(["active", "pending", "suspended", "disabled", "archived"]);
export const userSchema = z.object({
    id: idSchema,
    public_id: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    status: z.enum(["enabled", "disabled"]).optional(),
    lifecycle_status: userLifecycleStatusSchema.optional(),
    is_owner: z.boolean().optional(),
    last_active_at: z.string().nullable().optional(),
    password_setup_required: z.boolean().optional(),
    created_at: z.string().optional(),
    archived: z.boolean().optional(),
    roles: z.array(z.object({ id: idSchema, name: z.string() })).optional(),
});
export type UserRecord = z.infer<typeof userSchema>;
// Only existing, public, same-origin admin asset routes are accepted.
export const brandAssetSchema = z.string().regex(/^\/branding\/(logo|dark_logo|compact_logo|favicon)\?v=[a-f0-9]{64}$/).nullable();
export const brandingSchema = z.object({
    name: z.string().trim().min(1).max(150),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    logo: brandAssetSchema,
    dark_logo: brandAssetSchema,
    compact_logo: brandAssetSchema,
    favicon: brandAssetSchema,
});
export type Branding = z.infer<typeof brandingSchema>;
export const publicConfigurationSchema = z.object({
    schema_version: z.literal(1).optional(),
    features: z.object({ "api.enabled": z.boolean() }).catchall(z.boolean()),
    branding: brandingSchema.optional(),
});
export const bootstrapSchema = z.object({
    ...availabilityReadFields,
    schema_version: z.literal(1),
    account: userSchema.extend({
        name: z.string(),
        email: z.string(),
        status: z.enum(["enabled", "disabled"]),
        email_verified_at: z.string().nullable(),
    }),
    access_revision: z.number().int(),
    configuration_revision: z.string(),
    features: z.record(z.string(), z.boolean()),
    branding: brandingSchema.optional(),
    actions: z.record(z.string(), z.boolean()),
    fields: z.record(
        z.string(),
        z.object({ label: z.string(), view: z.boolean(), edit: z.boolean() }),
    ),
    modules: z.record(z.string(), z.boolean()),
    expires_at: z.string().nullable(),
    session_needs_sync: z.boolean(),
    appearance: z
        .object({
            theme: z.enum(["light", "dark", "system"]).optional(),
            timezone: z.string().optional(),
            date_format: z.enum(['d M Y', 'd/m/Y', 'm/d/Y']).optional(),
            direction: z.string().optional(),
        })
        .passthrough(),
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export const sessionSchema = z.object({
    access_token: z.string().min(1).max(2048),
    expires_at: z.string().datetime({ offset: true }),
    token_type: z.literal("Bearer"),
});
export const envelope = <T extends z.ZodType>(schema: T) =>
    z.object({ data: schema });
export const paginationMetaSchema = z.object({
    current_page: z.coerce.number(),
    last_page: z.coerce.number(),
    total: z.coerce.number(),
    per_page: z.coerce.number(),
});
export const pageSchema = <T extends z.ZodType>(schema: T) =>
    z.object({
        data: z.array(schema),
        meta: paginationMetaSchema.optional(),
        current_page: z.coerce.number().optional(),
        last_page: z.coerce.number().optional(),
        total: z.coerce.number().optional(),
    });
export const noticeSchema = z.object({
    id: z.string(),
    read_at: z.string().nullable(),
    created_at: z.string(),
    data: z
        .object({
            title: z.string().optional(),
            message: z.string().optional(),
            path: z.string().nullable().optional(),
        })
        .passthrough(),
});
export const auditSchema = z.object({
    id: idSchema,
    public_id: z.string(),
    action: z.string(),
    outcome: z.string(),
    created_at: z.string(),
    actor: z.object({
        name: z.string().nullable(),
        public_id: z.string().nullable(),
    }),
    changes: dictionary(z.unknown()).optional(),
    request_id: z.string().nullable().optional(),
    subject_id: z.string().nullable().optional(),
    subject_type: z.string().nullable().optional(),
    category: z.enum(["users", "security", "reports"]).nullable().optional(),
    field_changes: z.array(auditFieldChangeSchema).optional(),
    description: z.string().optional(),
    related: z.array(z.object({
        resource: z.enum(["users", "roles"]),
        id: z.number().int().positive(),
        path: z.string(),
    })).optional(),
});
export const auditDetailSchema = auditSchema.extend({
    id: z.number().int().positive().transform(String),
    public_id: z.uuid(),
    created_at: z.iso.datetime(),
});
