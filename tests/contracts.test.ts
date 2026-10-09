import { z } from "zod";
import fixtures from "../api/fixtures.json";
import {
    bootstrapSchema,
    envelope,
    pageSchema,
    userSchema,
    auditSchema,
    noticeSchema,
    dictionary,
} from "../src/api/runtime";
import {
    accessSchema,
    roleSchema,
    roleListSchema,
    targetSchema,
    profileSchema,
    creationSchema,
    listContextSchema,
} from "../src/api/contracts";
const schemas = {
    bootstrap: envelope(bootstrapSchema),
    users: pageSchema(userSchema),
    target: envelope(targetSchema),
    profile: envelope(profileSchema),
    profile_write: envelope(profileSchema),
    creation: envelope(creationSchema),
    list_context: envelope(listContextSchema),
    security_email_write: envelope(z.object({ email_security: z.boolean() })),
    access: envelope(accessSchema),
    roles: envelope(z.array(roleListSchema)),
    role: envelope(roleSchema),
    audit: pageSchema(auditSchema),
    inbox: pageSchema(noticeSchema),
    settings: envelope(
        z.object({
            values: dictionary(z.unknown()),
            version: z.string().length(64),
        }),
    ),
    dashboard: envelope(
        z.object({
            metrics: dictionary(z.number()),
            new_users: z.array(
                z.object({
                    date: z.string(),
                    label: z.string(),
                    count: z.number(),
                }),
            ),
            recent: z.array(auditSchema),
        }),
    ),
};
describe("Actual isolated Laravel response fixtures", () => {
    for (const [name, schema] of Object.entries(schemas))
        it(`validates ${name} without replacing hidden data`, () => {
            expect(() =>
                schema.parse(fixtures[name as keyof typeof fixtures]),
            ).not.toThrow();
        });
    it("keeps missing user fields absent", () => {
        const value = userSchema.parse({ id: 1, public_id: "fixture" });
        expect(value).not.toHaveProperty("email");
        expect(value).not.toHaveProperty("name");
    });
    it("strips raw audit metadata and network addresses", () => {
        const value = auditSchema.parse({
            ...fixtures.audit.data[0],
            ip: "127.0.0.1",
            metadata: { private: "hidden" },
        });
        expect(value).not.toHaveProperty("ip");
        expect(value).not.toHaveProperty("metadata");
    });
    it("accepts empty PHP dictionaries but rejects non-empty arrays", () => {
        expect(dictionary(z.string()).parse([])).toEqual({});
        expect(() => dictionary(z.string()).parse(["wrong"])).toThrow();
    });
});
