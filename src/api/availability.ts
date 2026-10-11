import { z } from "zod";
import { ApiError } from "./client";

// The server supplies the capability mapping. Availability never grants authority.
export const availabilityRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const availabilityReadFields = {
  capability_availability: z.record(z.string(), z.boolean()).optional(),
  availability_revision: availabilityRevisionSchema.optional(),
};
export type Availability = {
  capability_availability?: Record<string, boolean>;
  availability_revision?: string;
};
export function capabilityAvailable(context: Availability, key: string) {
  return context.capability_availability?.[key] === true;
}
export function availabilityMatches(actor: Availability, context: Availability) {
  return !!actor.availability_revision &&
    !!actor.capability_availability &&
    !!context.capability_availability &&
    actor.availability_revision === context.availability_revision;
}
export function activeEntries<T>(context: Availability, values: Record<string, T>) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => capabilityAvailable(context, key)));
}
export function catalogEntries<T>(catalog: Record<string, unknown>, values: Record<string, T>) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => Object.hasOwn(catalog, key)));
}
export function staleAvailability(error: unknown) {
  return error instanceof ApiError && error.status === 422 &&
    !!error.fields.availability_revision?.length;
}
