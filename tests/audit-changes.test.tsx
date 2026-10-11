import React from "react";
import { render } from "@testing-library/react-native";
import { AuditChanges } from "../src/components/audit-changes";

it("shows projected before/after values without losing null, false, zero or nested JSON", () => {
  const screen = render(
    <AuditChanges
      changes={[
        { field: "name", label: "Name", before: null, after: "Ada" },
        { field: "active", label: "Active", before: false, after: true },
        { field: "roles", label: "Roles", before: [], after: [0, { id: 2 }] },
      ]}
    />,
  );
  expect(screen.getByRole("header", { name: "What changed" })).toBeTruthy();
  for (const value of ["null", '"Ada"', "false", "true", "[]", '[0,{"id":2}]'])
    expect(screen.getByText(value)).toBeTruthy();
});
it("does not fabricate field changes for an empty authorized projection", () => {
  const screen = render(<AuditChanges changes={[]} />);
  expect(screen.queryByText("What changed")).toBeNull();
});
