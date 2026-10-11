import { z } from "zod";

export const pushProviderSchema = z.object({
  provider: z.literal("expo"),
  status: z.enum(["disabled", "unconfigured", "ready"]),
  project_id: z.string().uuid().nullable(),
  available: z.boolean().optional(),
  unavailable_reason: z
    .enum(["api_disabled", "in_app_disabled", "disabled", "unconfigured"])
    .nullable()
    .optional(),
});
export const pushPreferencesSchema = z.object({
  enabled: z.boolean(),
  provider: pushProviderSchema,
  current_device_registered: z.boolean(),
});
export const pushRegistrationSchema = z.object({
  id: z.string().uuid(),
  registered: z.literal(true),
});
export const pushDestinationSchema = z.object({
  notification_id: z.string().uuid(),
  path: z.string(),
});
export type PushPreferences = z.infer<typeof pushPreferencesSchema>;

// Push data cannot introduce private text, arbitrary URLs, router parameters or recovery secrets.
const payloadSchema = z.object({ notification_id: z.string().uuid() }).strict();
export function notificationId(data: unknown): string | null {
  const result = payloadSchema.safeParse(data);
  return result.success ? result.data.notification_id : null;
}
