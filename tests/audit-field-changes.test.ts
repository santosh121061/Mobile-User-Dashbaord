import Ajv from "ajv";
import fixtures from "../api/fixtures.json";
import specification from "../api/openapi.json";
import type { components } from "../src/api/generated/schema";
import {
  auditFieldChangeSchema,
  auditSchema,
  type JsonValue,
} from "../src/api/runtime";

describe("Source-level audit field change JSON contracts", () => {
  const values: JsonValue[] = [
    null,
    false,
    2.5,
    "Updated",
    [null, true, 3, "text"],
    { nested: { values: [null, true, 4.5, "text", {}, []] } },
  ];
  it.each(values.map((value) => [value]))(
    "preserves both value keys for JSON %j",
    (value) => {
      const input = {
        field: "name",
        label: "Name",
        before: value,
        after: value,
      };
      const decoded: components["schemas"]["AuditFieldChange"] =
        auditFieldChangeSchema.parse(input);
      expect(decoded).toEqual(input);
      expect(Object.keys(decoded)).toEqual([
        "field",
        "label",
        "before",
        "after",
      ]);
    },
  );

  it.each([
    { field: "name", label: "Name", after: null },
    { field: "name", label: "Name", before: null },
    { field: "name", label: "Name", before: undefined, after: null },
    { field: "name", label: "Name", before: null, after: undefined },
    { field: "name", label: "Name", before: Number.NaN, after: null },
    { field: "name", label: "Name", before: null, after: Infinity },
    {
      field: "name",
      label: "Name",
      before: null,
      after: { nested: undefined },
    },
    { field: "name", label: "Name", before: null, after: () => "not JSON" },
  ])("rejects missing values or non-JSON input %j", (input) => {
    expect(auditFieldChangeSchema.safeParse(input).success).toBe(false);
  });

  it("keeps explicit nulls in the local recursive OpenAPI contract and requires both keys", () => {
    const validate = new Ajv({ strictKeywords: false }).compile({
      ...specification.components.schemas.AuditFieldChange,
      components: specification.components,
    });
    expect(
      validate({
        field: "name",
        label: "Name",
        before: null,
        after: { values: [true, 1, "text", null] },
      }),
    ).toBe(true);
    expect(validate({ field: "name", label: "Name", after: null })).toBe(false);
    expect(validate({ field: "name", label: "Name", before: null })).toBe(
      false,
    );
  });

  it("accepts non-null descriptions while preserving legacy omission compatibility", () => {
    const event = fixtures.audit.data[0];
    expect(
      auditSchema.parse({ ...event, description: "", field_changes: [] })
        .description,
    ).toBe("");
    expect(auditSchema.safeParse({ ...event, description: null }).success).toBe(
      false,
    );
    expect(auditSchema.parse(event)).not.toHaveProperty("description");
    expect(auditSchema.parse(event)).not.toHaveProperty("field_changes");
  });
});
