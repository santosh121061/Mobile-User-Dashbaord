import Ajv from "ajv";
import fixtures from "../api/fixtures.json";
import specification from "../api/openapi.json";
import { api, ApiError, attachSession, check, unwrap } from "../src/api/client";
import type { components } from "../src/api/generated/schema";
import {
  auditQuerySchema,
  accessSchema,
  directAccessWriteSchema,
  dashboardSchema,
  passwordLinkUserCreateSchema,
  roleCreateContextSchema,
  roleListSchema,
  rolePresetSchema,
  roleSchema,
  roleWriteSchema,
  userLifecycleActionSchema,
  userPageSchema,
  verificationFilterSchema,
} from "../src/api/contracts";
import {
  auditDetailSchema,
  bootstrapSchema,
  auditSchema,
  envelope,
  pageSchema,
  userSchema,
} from "../src/api/runtime";

// New examples are synthetic contract inputs, not database or live-server fixtures.
const passwordLinkPayload = {
  first_name: "Contract",
  last_name: "Example",
  email: "contract@example.test",
  phone: "+14155550123",
  role_ids: [2],
  lifecycle_status: "pending",
  provisioning: "password_link",
} satisfies components["schemas"]["PasswordLinkUserCreate"];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Developing API additions through the existing authenticated client", () => {
  const expireSession = jest.fn();
  const refreshAuthorization = jest.fn();
  let detachSession: () => boolean;

  beforeEach(() => {
    expireSession.mockClear();
    refreshAuthorization.mockClear();
    detachSession = attachSession(
      () => "contract-test-session",
      expireSession,
      refreshAuthorization,
    );
  });

  afterEach(() => {
    detachSession();
    jest.restoreAllMocks();
  });
  it("retains canonical availability on reads without deriving or granting actor actions", () => {
    const metadata = {
      capability_availability: { "roles.manage": true, "audit.view": false },
      availability_revision: "a".repeat(64),
    };
    const bootstrap = bootstrapSchema.parse({
      ...fixtures.bootstrap.data,
      ...metadata,
      actions: { "roles.manage": false, "audit.view": true },
    });
    expect(bootstrap.capability_availability).toEqual(
      metadata.capability_availability,
    );
    expect(bootstrap.actions).toEqual({
      "roles.manage": false,
      "audit.view": true,
    });
    expect(
      accessSchema.parse({ ...fixtures.access.data, ...metadata }),
    ).toMatchObject(metadata);
    expect(
      roleSchema.parse({ ...fixtures.role.data, ...metadata }),
    ).toMatchObject(metadata);
    expect(bootstrapSchema.parse(fixtures.bootstrap.data)).not.toHaveProperty(
      "availability_revision",
    );
    expect(
      bootstrapSchema.safeParse({
        ...fixtures.bootstrap.data,
        ...metadata,
        availability_revision: "invalid",
      }).success,
    ).toBe(false);
  });
  it("accepts optional availability revision on role writes in runtime and OpenAPI, rejecting malformed supplied revisions", () => {
    const validate = new Ajv({ strictKeywords: false }).compile({
      ...specification.components.schemas.RoleWrite,
      components: specification.components,
    });
    const legacy = { name: "Role", grants: [], scopes: {}, fields: {} };
    const current = { ...legacy, availability_revision: "b".repeat(64) };
    expect(roleWriteSchema.parse(current)).toEqual(current);
    expect(roleWriteSchema.parse(legacy)).toEqual(legacy);
    expect(validate(current)).toBe(true);
    expect(validate(legacy)).toBe(true);
    expect(validate({ ...current, availability_revision: "invalid" })).toBe(
      false,
    );
    expect(
      roleWriteSchema.safeParse({
        ...current,
        availability_revision: "invalid",
      }).success,
    ).toBe(false);
  });
  it("describes patch and legacy replacement modes only on direct access writes", () => {
    const schema =
      specification.paths["/v1/users/{user}/access"].put.requestBody.content[
        "application/json"
      ].schema;
    const validate = new Ajv({ strictKeywords: false }).compile(schema);
    const legacy = {
      effects: {},
      scopes: {},
      fields: {},
      assigned_ids: [8, 9],
    };
    for (const mode of [undefined, "replace", "patch"] as const) {
      const body = {
        ...legacy,
        ...(mode ? { update_mode: mode } : {}),
        availability_revision: "a".repeat(64),
      };
      expect(directAccessWriteSchema.parse(body)).toEqual(body);
      expect(validate(body)).toBe(true);
    }
    expect(directAccessWriteSchema.parse(legacy)).not.toHaveProperty(
      "update_mode",
    );
    expect(
      directAccessWriteSchema.safeParse({ ...legacy, update_mode: "merge" })
        .success,
    ).toBe(false);
    expect(validate({ ...legacy, update_mode: "merge" })).toBe(false);
    expect(
      roleWriteSchema.safeParse({
        name: "Role",
        grants: [],
        scopes: {},
        fields: {},
        update_mode: "patch",
      }).success,
    ).toBe(false);
    expect(
      specification.paths["/v1/users/{user}/delegation"].put.requestBody
        .content["application/json"].schema.properties,
    ).not.toHaveProperty("update_mode");
  });
  it("requires all direct access containers and complete valid assignments, including in patch mode", () => {
    const validate = new Ajv({ strictKeywords: false }).compile(
      specification.paths["/v1/users/{user}/access"].put.requestBody.content[
        "application/json"
      ].schema,
    );
    const body = {
      effects: { "users.view": "inherit" },
      scopes: { "users.view": "inherit" },
      fields: { phone: { view: "inherit", edit: "inherit" } },
      assigned_ids: [8],
      update_mode: "patch",
    };
    expect(directAccessWriteSchema.parse(body)).toEqual(body);
    expect(validate(body)).toBe(true);
    for (const key of ["effects", "scopes", "fields", "assigned_ids"]) {
      const missing = { ...body } as Record<string, unknown>;
      delete missing[key];
      expect(directAccessWriteSchema.safeParse(missing).success).toBe(false);
      expect(validate(missing)).toBe(false);
    }
    for (const assigned_ids of [
      [8, 8],
      [0],
      [1.5],
      Array.from({ length: 501 }, (_, i) => i + 1),
    ]) {
      expect(
        directAccessWriteSchema.safeParse({ ...body, assigned_ids }).success,
      ).toBe(false);
      expect(validate({ ...body, assigned_ids })).toBe(false);
    }
    expect(
      directAccessWriteSchema.safeParse({
        ...body,
        fields: { phone: { view: "inherit" } },
      }).success,
    ).toBe(false);
    expect(validate({ ...body, fields: { phone: { view: "inherit" } } })).toBe(
      false,
    );
    expect(
      directAccessWriteSchema.safeParse({
        ...body,
        availability_revision: null,
      }).success,
    ).toBe(false);
    expect(validate({ ...body, availability_revision: null })).toBe(false);
  });

  it.each(["active", "pending"] as const)(
    "sends %s password-link creation without a password or legacy status",
    async (lifecycle_status) => {
      const responseUser = {
        id: 7,
        public_id: "synthetic-created-user",
        lifecycle_status,
        status: lifecycle_status === "active" ? "enabled" : "disabled",
        is_owner: false,
      };
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(jsonResponse({ data: responseUser }, 201));
      const body: components["schemas"]["PasswordLinkUserCreate"] =
        passwordLinkUserCreateSchema.parse({
          ...passwordLinkPayload,
          lifecycle_status,
        });

      const created = unwrap(
        await api.POST("/v1/users", { body }),
        envelope(userSchema),
      );

      const request = fetcher.mock.calls[0]![0] as Request;
      expect(request.method).toBe("POST");
      expect(new URL(request.url).pathname).toBe("/api/v1/users");
      expect(request.headers.get("Authorization")).toBe(
        "Bearer contract-test-session",
      );
      expect(await request.json()).toEqual(body);
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("status");
      expect(created.data).toEqual({ ...responseUser, id: "7" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps existing password creation on the same route and transport", async () => {
    const body = {
      name: "Legacy Example",
      email: "legacy@example.test",
      status: "enabled",
      role_ids: [],
      password: "SyntheticPassword123!",
    };
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ data: fixtures.users.data[0] }, 201));
    unwrap(await api.POST("/v1/users", { body }), envelope(userSchema));
    expect(await (fetcher.mock.calls[0]![0] as Request).json()).toEqual(body);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a password in password-link provisioning in both runtime and OpenAPI schemas", () => {
    const validate = new Ajv({
      strictKeywords: false,
      formats: { password: () => true },
    }).compile({
      ...specification.paths["/v1/users"].post.requestBody.content[
        "application/json"
      ].schema,
      components: specification.components,
    });
    expect(validate(passwordLinkPayload)).toBe(true);
    const mixedPayload = {
      ...passwordLinkPayload,
      password: "SyntheticPassword123!",
    };
    expect(validate(mixedPayload)).toBe(false);
    expect(passwordLinkUserCreateSchema.safeParse(mixedPayload).success).toBe(
      false,
    );
    expect(
      validate({
        name: "Legacy Example",
        email: "legacy@example.test",
        status: "enabled",
        role_ids: [],
        password: "SyntheticPassword123!",
      }),
    ).toBe(true);
  });

  it.each([
    "4155550123",
    "+1 415 555 0123",
    "+04155550123",
    "+1234567890123456",
  ])("rejects noncanonical phone %s without guessing a country", (phone) => {
    expect(
      passwordLinkUserCreateSchema.safeParse({ ...passwordLinkPayload, phone })
        .success,
    ).toBe(false);
  });

  it("retains server field validation from password-link creation without replay", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        jsonResponse(
          { errors: { phone: ["Server rejected this phone"] } },
          422,
        ),
      );
    const result = await api.POST("/v1/users", {
      body: passwordLinkUserCreateSchema.parse(passwordLinkPayload),
    });
    expect(() => check(result)).toThrow(
      expect.objectContaining({
        status: 422,
        fields: { phone: ["Server rejected this phone"] },
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refreshAuthorization).not.toHaveBeenCalled();
  });

  it.each([
    ["enabled", "name_asc"],
    ["active", "name_desc"],
    ["pending", "recent"],
    ["suspended", "name_asc"],
    ["disabled", "name_desc"],
    ["archived", "recent"],
  ] as const)(
    "serializes state=%s and sort=%s alongside existing search and pagination",
    async (state, sort) => {
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(jsonResponse(fixtures.users));
      const result = unwrap(
        await api.GET("/v1/users", {
          params: {
            query: {
              state,
              sort,
              search: "Contract + Example",
              role: 2,
              page: 1,
              per_page: 30,
            },
          },
        }),
        userPageSchema,
      );
      const url = new URL((fetcher.mock.calls[0]![0] as Request).url);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        state,
        sort,
        search: "Contract + Example",
        role: "2",
        page: "1",
        per_page: "30",
      });
      expect(result.meta).not.toHaveProperty("status_counts");
    },
  );

  it("keeps permission-projected lifecycle fields absent and preserves legacy status", () => {
    const hidden = userSchema.parse({ id: 1, public_id: "projected-example" });
    for (const field of ["lifecycle_status", "is_owner", "last_active_at"])
      expect(hidden).not.toHaveProperty(field);
    expect(
      userSchema.parse({
        id: 1,
        public_id: "projected-example",
        status: "disabled",
        lifecycle_status: "pending",
        is_owner: false,
        last_active_at: null,
      }),
    ).toMatchObject({
      status: "disabled",
      lifecycle_status: "pending",
      is_owner: false,
      last_active_at: null,
    });
  });

  it("preserves four scoped status counts separately from the selected-filter total", () => {
    const status_counts = { active: 3, pending: 2, suspended: 1, disabled: 0 };
    const page = userPageSchema.parse({
      ...fixtures.users,
      meta: { ...fixtures.users.meta, total: 2, status_counts },
    });
    expect(page.meta?.status_counts).toEqual(status_counts);
    expect(page.meta?.total).toBe(2);
    expect(page.meta?.status_counts).not.toHaveProperty("archived");
    expect(
      userPageSchema.safeParse({
        ...fixtures.users,
        meta: {
          ...fixtures.users.meta,
          status_counts: { ...status_counts, pending: -1 },
        },
      }).success,
    ).toBe(false);
  });

  it("accepts hidden status counts as null and rejects partial or archived counts", () => {
    const page = {
      ...fixtures.users,
      meta: { ...fixtures.users.meta, status_counts: null },
    };
    expect(userPageSchema.parse(page).meta?.status_counts).toBeNull();
    for (const status_counts of [
      { pending: 2 },
      { active: 0, pending: 0, suspended: 0, disabled: 0, archived: 1 },
    ])
      expect(
        userPageSchema.safeParse({
          ...page,
          meta: { ...page.meta, status_counts },
        }).success,
      ).toBe(false);
  });

  it("accepts omitted role assignments and the explicit legacy-status fallback without adding defaults", () => {
    const {
      role_ids: _roles,
      lifecycle_status: _lifecycle,
      ...required
    } = passwordLinkPayload;
    const body: components["schemas"]["PasswordLinkUserCreate"] =
      passwordLinkUserCreateSchema.parse({
        ...required,
        email: "Contract@Example.Test",
        status: "disabled",
      });
    expect(body.email).toBe("contract@example.test");
    expect(body).not.toHaveProperty("role_ids");
    expect(body).not.toHaveProperty("lifecycle_status");
    expect(passwordLinkUserCreateSchema.safeParse(required).success).toBe(
      false,
    );
  });

  it.each([
    { first_name: "" },
    { last_name: null },
    { first_name: "x".repeat(101) },
    { phone: "+123456" },
    { role_ids: [2, 2] },
    { role_ids: Array.from({ length: 21 }, (_, index) => index + 1) },
    { lifecycle_status: "suspended" },
  ])("rejects source-invalid password-link input %j", (invalidFields) => {
    expect(
      passwordLinkUserCreateSchema.safeParse({
        ...passwordLinkPayload,
        ...invalidFields,
      }).success,
    ).toBe(false);
  });

  it("preserves a pending projection after an unchanged legacy disabled edit", async () => {
    const responseUser = {
      ...fixtures.users.data[0],
      status: "disabled",
      lifecycle_status: "pending",
    };
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ data: responseUser }));
    const result = unwrap(
      await api.PUT("/v1/users/{user}", {
        params: { path: { user: 7 } },
        body: { status: "disabled" },
      }),
      envelope(userSchema),
    );
    expect(result.data).toMatchObject({
      status: "disabled",
      lifecycle_status: "pending",
    });
    expect(await (fetcher.mock.calls[0]![0] as Request).json()).toEqual({
      status: "disabled",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("describes lifecycle edits while prohibiting provisioning on updates", () => {
    const validate = new Ajv({
      strictKeywords: false,
      formats: { password: () => true },
    }).compile(
      specification.paths["/v1/users/{user}"].put.requestBody.content[
        "application/json"
      ].schema,
    );
    for (const lifecycle_status of [
      "active",
      "pending",
      "suspended",
      "disabled",
    ])
      expect(validate({ lifecycle_status })).toBe(true);
    expect(validate({ lifecycle_status: "archived" })).toBe(false);
    expect(validate({ provisioning: "password_link" })).toBe(false);
  });

  it.each(["suspend", "reactivate"] as const)(
    "dispatches %s once using the existing action and bulk routes",
    async (requestedAction) => {
      const action: components["schemas"]["UserLifecycleAction"] =
        userLifecycleActionSchema.parse(requestedAction);
      const bulkResult = {
        status: "completed",
        updated_count: 1,
        skipped_count: 1,
      };
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(
          jsonResponse({
            message:
              action === "suspend"
                ? "Account suspended. Active sessions and API keys were revoked."
                : "Account activated. Sign in with the current password.",
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ data: bulkResult }));
      check(
        await api.POST("/v1/users/{user}/actions/{action}", {
          params: { path: { user: 7, action } },
        }),
      );
      const result = await api.POST("/v1/users/bulk", {
        body: {
          action,
          criteria: { search: "Contract" },
          selection: { mode: "selected", ids: [7, 8] },
        },
      });
      check(result);
      expect(result.data?.data).toEqual(bulkResult);
      expect(new URL((fetcher.mock.calls[0]![0] as Request).url).pathname).toBe(
        `/api/v1/users/7/actions/${action}`,
      );
      expect(await (fetcher.mock.calls[0]![0] as Request).text()).toBe("");
      expect(await (fetcher.mock.calls[1]![0] as Request).json()).toMatchObject(
        {
          action,
          selection: { mode: "selected", ids: [7, 8] },
        },
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it.each([401, 403, 422])(
    "honors a server %s rejection of lifecycle changes without fallback or replay",
    async (status) => {
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          jsonResponse({ message: "Synthetic rejection" }, status),
        );
      const result = await api.POST("/v1/users/{user}/actions/{action}", {
        params: { path: { user: 7, action: "suspend" } },
      });
      expect(() => check(result)).toThrow(ApiError);
      expect(expireSession).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
      expect(refreshAuthorization).toHaveBeenCalledTimes(
        status === 403 ? 1 : 0,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves the exact governance Owner rejection without reporting a successful action", async () => {
    const message =
      "Governance owners cannot be suspended or reactivated through this action.";
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ message }, 422));
    const result = await api.POST("/v1/users/{user}/actions/{action}", {
      params: { path: { user: 7, action: "suspend" } },
    });
    expect(() => check(result)).toThrow(
      expect.objectContaining({ status: 422, serverMessage: message }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["users", "today", "user"],
    ["security", "7d", "role"],
    ["reports", "all", "user"],
  ] as const)(
    "serializes audit category=%s, period=%s and subject_type=%s with existing filters",
    async (category, period, subject_type) => {
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(jsonResponse(fixtures.audit));
      unwrap(
        await api.GET("/v1/audit", {
          params: {
            query: auditQuerySchema.parse({
              category,
              period,
              ...(period === "all"
                ? { from: "2026-10-01", to: "2026-10-10" }
                : {}),
              actor_id: 7,
              subject_type,
              subject_id: 8,
              search: "Contract",
              state: "success",
              page: 1,
              per_page: 30,
            }),
          },
        }),
        pageSchema(auditSchema),
      );
      const url = new URL((fetcher.mock.calls[0]![0] as Request).url);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        category,
        period,
        ...(period === "all" ? { from: "2026-10-01", to: "2026-10-10" } : {}),
        actor_id: "7",
        subject_type,
        subject_id: "8",
        search: "Contract",
        state: "success",
        page: "1",
        per_page: "30",
      });
    },
  );

  it("uses the same credential while preserving 403 list and 404 inaccessible-detail responses", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ message: "Synthetic scope denial" }, 403),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: "Synthetic missing detail" }, 404),
      );
    const listResult = await api.GET("/v1/audit", {
      params: { query: { category: "security" } },
    });
    const detailResult = await api.GET("/v1/mobile/audit/{id}", {
      params: { path: { id: 9 } },
    });
    for (const result of [listResult, detailResult])
      expect(() => check(result)).toThrow(ApiError);
    for (const [request] of fetcher.mock.calls)
      expect((request as Request).headers.get("Authorization")).toBe(
        "Bearer contract-test-session",
      );
    expect(refreshAuthorization).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    { period: "today", from: "2026-10-01" },
    { period: "7d", to: "2026-10-10" },
    { subject_id: 7 },
    { actor_id: 0 },
    { subject_type: "user", subject_id: "7" },
    { from: "2026-02-30" },
  ])("rejects source-invalid audit filters %j", (query) => {
    expect(auditQuerySchema.safeParse(query).success).toBe(false);
  });

  it.each(["from", "to"] as const)(
    "serializes an independent %s user date bound",
    async (bound) => {
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(jsonResponse(fixtures.users));
      check(
        await api.GET("/v1/users", {
          params: { query: { [bound]: "2026-10-01" } },
        }),
      );
      expect(
        Object.fromEntries(
          new URL((fetcher.mock.calls[0]![0] as Request).url).searchParams,
        ),
      ).toEqual({ [bound]: "2026-10-01" });
    },
  );

  it("decodes numeric audit detail, string morph IDs and authorized links while stripping private fields", async () => {
    const event = {
      ...fixtures.audit.data[0],
      id: 9,
      subject_id: "7",
      subject_type: "App\\Models\\User",
      category: "users",
      related: [{ resource: "users", id: 7, path: "/users/7" }],
      actor: { public_id: null, name: null, id: 7 },
      description: "Synthetic authorized audit description",
      field_changes: [
        { field: "name", label: "Name", before: null, after: "Updated" },
      ],
    };
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ data: event }));
    const result = unwrap(
      await api.GET("/v1/mobile/audit/{id}", {
        params: { path: { id: event.id } },
      }),
      envelope(auditDetailSchema),
    );
    expect(new URL((fetcher.mock.calls[0]![0] as Request).url).pathname).toBe(
      `/api/v1/mobile/audit/${event.id}`,
    );
    expect(result.data).toMatchObject({
      id: String(event.id),
      subject_id: "7",
      subject_type: "App\\Models\\User",
      category: "users",
      related: event.related,
      description: event.description,
      field_changes: event.field_changes,
    });
    expect(result.data).not.toHaveProperty("ip");
    expect(result.data).not.toHaveProperty("metadata");
    expect(result.data.actor).not.toHaveProperty("id");
  });

  it("retains optional role metadata from reads while accepting deployed role fixtures", async () => {
    const metadata = {
      description: "Synthetic role description",
      default_scope: "self",
      assigned_count: 2,
      assigned_count_scope: "visible_unarchived_accounts",
      updated_at: "2026-10-10T12:00:00.000000Z",
      can_edit: false,
    };
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ ...fixtures.roles.data[0], ...metadata }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { ...fixtures.role.data, ...metadata } }),
      );
    const list = unwrap(
      await api.GET("/v1/roles"),
      envelope(roleListSchema.array()),
    );
    const detail = unwrap(
      await api.GET("/v1/roles/{role}", {
        params: { path: { role: fixtures.role.data.id } },
      }),
      envelope(roleSchema),
    );
    expect(list.data[0]).toMatchObject(metadata);
    expect(detail.data).toMatchObject(metadata);
    for (const field of Object.keys(metadata)) {
      expect(roleListSchema.parse(fixtures.roles.data[0])).not.toHaveProperty(
        field,
      );
      expect(roleSchema.parse(fixtures.role.data)).not.toHaveProperty(field);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("types the supplied role presets without assuming a preset endpoint or permission grants", () => {
    const presets: components["schemas"]["RolePreset"][] = [
      "viewer",
      "editor",
      "manager",
    ];
    expect(presets.map((preset) => rolePresetSchema.parse(preset))).toEqual(
      presets,
    );
    expect(rolePresetSchema.safeParse("owner").success).toBe(false);
  });

  it("preserves nullable derived scope and unavailable assigned counts without inventing edit authority", () => {
    const value = roleSchema.parse({
      ...fixtures.role.data,
      description: null,
      default_scope: null,
      updated_at: null,
      assigned_count: null,
      assigned_count_scope: "visible_unarchived_accounts",
      can_edit: false,
      protected: true,
    });
    expect(value).toMatchObject({
      default_scope: null,
      assigned_count: null,
      can_edit: false,
    });
    expect(value).not.toHaveProperty("protected");
    expect(
      roleSchema.safeParse({ ...fixtures.role.data, default_scope: "mixed" })
        .success,
    ).toBe(false);
  });

  it("serializes nullable role description and optional default scope through the existing role write", async () => {
    const body = {
      name: "Contract role",
      grants: ["users.view"],
      scopes: { "users.view": "self" },
      fields: { name: { view: true, edit: false } },
      description: null,
      default_scope: "assigned" as const,
    } satisfies components["schemas"]["RoleWrite"];
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ data: { id: "9", name: body.name } }));
    check(
      await api.PUT("/v1/roles/{role}", {
        params: { path: { role: "9" } },
        body,
      }),
    );
    expect(await (fetcher.mock.calls[0]![0] as Request).json()).toEqual(body);
    const validate = new Ajv({ strictKeywords: false }).compile({
      ...specification.paths["/v1/roles/{role}"].put.requestBody.content[
        "application/json"
      ].schema,
      components: specification.components,
    });
    expect(validate(body)).toBe(true);
    expect(validate({ ...body, description: "x".repeat(501) })).toBe(false);
    const { description: _description, ...omitted } = body;
    expect(validate(omitted)).toBe(true);
  });

  it("fetches the exact role create-context route with existing transport and server delegation ceilings", async () => {
    const preset = {
      label: "Synthetic preset",
      grants: ["users.view"],
      scopes: { "users.view": "self" as const },
      fields: { name: { view: true, edit: false } },
      available: false,
    };
    const context: components["schemas"]["RoleCreateContext"] = {
      presets: { viewer: preset, editor: preset, manager: preset },
      catalog: { "users.view": "View users" },
      scope_options: {
        all: "All",
        self: "Self",
        created: "Created",
        assigned: "Assigned",
      },
    };
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ data: context }));
    const result = unwrap(
      await api.GET("/v1/mobile/roles/create-context"),
      envelope(roleCreateContextSchema),
    );
    const request = fetcher.mock.calls[0]![0] as Request;
    expect(new URL(request.url).pathname).toBe(
      "/api/v1/mobile/roles/create-context",
    );
    expect(request.headers.get("Authorization")).toBe(
      "Bearer contract-test-session",
    );
    expect(result.data).toEqual(context);
    expect(result.data.presets.viewer.available).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("surfaces a deployed-server create-context 404 without trying a second role service", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        jsonResponse({ message: "Synthetic route unavailable" }, 404),
      );
    const result = await api.GET("/v1/mobile/roles/create-context");
    expect(() => check(result)).toThrow(
      expect.objectContaining({ status: 404 }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([7, 30] as const)(
    "decodes %s dashboard days while preserving nullable metrics and server zero buckets",
    async (period) => {
      const activity_series = Array.from({ length: period }, (_, index) => {
        const day = new Date(Date.UTC(2026, 9, 10 - period + 1 + index));
        return {
          date: day.toISOString().slice(0, 10),
          label: new Intl.DateTimeFormat("en", {
            weekday: "short",
            timeZone: "UTC",
          }).format(day),
          count: index === period - 1 ? 1 : 0,
        };
      });
      const data = {
        ...fixtures.dashboard.data,
        period,
        daily_metrics: {
          total_users: 2,
          active_today: null,
          events_today: 1,
          roles: null,
        },
        activity_series,
        activity_precision_seconds: 60,
        new_users: activity_series.map((bucket) => ({
          ...bucket,
          date: new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${bucket.date}T00:00:00Z`)),
        })),
      };
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(jsonResponse({ data }));
      const result = unwrap(
        await api.GET("/v1/dashboard", { params: { query: { period } } }),
        envelope(dashboardSchema),
      );
      expect(
        new URL((fetcher.mock.calls[0]![0] as Request).url).searchParams.get(
          "period",
        ),
      ).toBe(String(period));
      expect(result.data).toEqual({
        ...data,
        recent: data.recent.map((event) => ({
          ...event,
          id: String(event.id),
        })),
      });
      expect(result.data.activity_series).toHaveLength(period);
      expect(result.data.activity_series?.at(-1)?.date).toBe("2026-10-10");
      expect(result.data.activity_series?.[0]?.count).toBe(0);
      expect(result.data.new_users.at(-1)?.date).toBe("10 Oct 2026");
    },
  );

  it("accepts legacy dashboard omissions and access-hidden metrics without fabricating data", () => {
    const legacy = dashboardSchema.parse(fixtures.dashboard.data);
    for (const field of [
      "daily_metrics",
      "activity_series",
      "activity_precision_seconds",
    ])
      expect(legacy).not.toHaveProperty(field);
    const denied = dashboardSchema.parse({
      ...fixtures.dashboard.data,
      daily_metrics: {
        total_users: null,
        active_today: null,
        events_today: null,
        roles: null,
      },
      activity_series: [],
      activity_precision_seconds: 60,
    });
    expect(denied.activity_series).toEqual([]);
    expect(Object.values(denied.daily_metrics!)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(
      dashboardSchema.safeParse({
        ...fixtures.dashboard.data,
        daily_metrics: { total_users: 2 },
      }).success,
    ).toBe(false);
    expect(
      dashboardSchema.safeParse({
        ...fixtures.dashboard.data,
        activity_precision_seconds: 30,
      }).success,
    ).toBe(false);
  });

  it.each(["viewer", "editor", "manager"] as const)(
    "sends preset %s with omitted collections and a null scope override through existing role transport",
    async (preset) => {
      const body: components["schemas"]["RoleWrite"] = roleWriteSchema.parse({
        name: "Synthetic preset role",
        preset,
        default_scope: null,
      });
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(
          jsonResponse({ data: { id: "9", name: body.name } }),
        );
      check(await api.POST("/v1/roles", { body }));
      expect(await (fetcher.mock.calls[0]![0] as Request).json()).toEqual({
        name: body.name,
        preset,
        default_scope: null,
      });
      for (const collection of ["grants", "scopes", "fields"])
        expect(body).not.toHaveProperty(collection);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves explicit empty/partial preset overrides and requires all collections without a preset", () => {
    const overrides = {
      name: "Synthetic explicit role",
      preset: "editor",
      grants: [],
      scopes: { "users.view": "assigned" },
      fields: { name: { view: true, edit: false } },
      description: null,
      default_scope: null,
    };
    const body: components["schemas"]["RoleWrite"] =
      roleWriteSchema.parse(overrides);
    expect(body).toEqual(overrides);
    const validate = new Ajv({ strictKeywords: false }).compile({
      ...specification.components.schemas.RoleWrite,
      components: specification.components,
    });
    expect(validate(body)).toBe(true);
    expect(validate({ name: "Minimal preset", preset: "viewer" })).toBe(true);
    expect(
      roleWriteSchema.safeParse({ name: "Missing collections" }).success,
    ).toBe(false);
    expect(validate({ name: "Missing collections" })).toBe(false);
    expect(
      roleWriteSchema.safeParse({
        name: "Explicit role",
        grants: [],
        scopes: {},
        fields: {},
      }).success,
    ).toBe(true);
    expect(
      roleWriteSchema.safeParse({ ...overrides, default_scope: "mixed" })
        .success,
    ).toBe(false);
    expect(
      roleWriteSchema.safeParse({ ...overrides, preset: "owner" }).success,
    ).toBe(false);
    expect(
      roleWriteSchema.safeParse({ ...overrides, description: "x".repeat(501) })
        .success,
    ).toBe(false);
  });

  it.each(["verified", "unverified", null, undefined] as const)(
    "serializes the clarified optional/nullable verification filter %s",
    async (input) => {
      const verification = verificationFilterSchema.parse(input);
      const fetcher = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(jsonResponse(fixtures.users));
      check(
        await api.GET("/v1/users", { params: { query: { verification } } }),
      );
      const value = new URL(
        (fetcher.mock.calls[0]![0] as Request).url,
      ).searchParams.get("verification");
      expect(value).toBe(verification ?? null);
      expect(verificationFilterSchema.safeParse("any").success).toBe(false);
    },
  );

  it("normalizes only outer whitespace/case in quoted provisioning email and rejects controls", () => {
    const email = '"Quoted Local"@Example.Test';
    const body = passwordLinkUserCreateSchema.parse({
      ...passwordLinkPayload,
      email: `  ${email}  `,
    });
    expect(body.email).toBe('"quoted local"@example.test');
    for (const email of [
      '"quoted\tlocal"@example.test',
      "\nquoted@example.test",
    ])
      expect(
        passwordLinkUserCreateSchema.safeParse({
          ...passwordLinkPayload,
          email,
        }).success,
      ).toBe(false);
  });

  it("preserves independent credential readiness instead of deriving it from account lifecycle", () => {
    const base = { id: 7, public_id: "synthetic-credential-account" };
    const active = userSchema.parse({
      ...base,
      status: "enabled",
      lifecycle_status: "active",
      password_setup_required: true,
    });
    const pending = userSchema.parse({
      ...base,
      status: "disabled",
      lifecycle_status: "pending",
      password_setup_required: false,
    });
    expect(active).toMatchObject({
      lifecycle_status: "active",
      password_setup_required: true,
    });
    expect(pending).toMatchObject({
      lifecycle_status: "pending",
      status: "disabled",
      password_setup_required: false,
    });
    expect(userSchema.parse(base)).not.toHaveProperty(
      "password_setup_required",
    );
  });

  it("retains the unready activation acknowledgement without treating password setup as complete", async () => {
    const message: components["schemas"]["LifecycleActionResult"]["message"] =
      "Account activated. Complete password setup before signing in.";
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ message }));
    const result = await api.POST("/v1/users/{user}/actions/{action}", {
      params: { path: { user: 7, action: "reactivate" } },
    });
    check(result);
    expect(result.data?.message).toBe(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
