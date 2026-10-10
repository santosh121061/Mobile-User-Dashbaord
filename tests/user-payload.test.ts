import { namePayload } from "../src/features/user-payload";
const values = {
  name: "Previous Display Name",
  first_name: "HiddenFirst",
  last_name: "ChangedLast",
};
it("sends surname-only edits without sending a hidden first name or stale display name", () => {
  expect(
    namePayload(
      values,
      { last_name: true },
      (field) => field === "last_name",
      false,
    ),
  ).toEqual({ last_name: "ChangedLast" });
});
it("preserves omitted surname when only the first name is editable", () => {
  expect(
    namePayload(
      values,
      { first_name: true, last_name: true },
      (field) => field === "first_name",
      false,
    ),
  ).toEqual({ first_name: "HiddenFirst" });
});
it("explicitly clears an editable surname and ignores dirty hidden fields", () => {
  expect(
    namePayload(
      { ...values, last_name: "" },
      { last_name: true, first_name: true },
      (field) => field === "last_name",
      false,
    ),
  ).toEqual({ last_name: null });
  expect(
    namePayload(
      values,
      { name: true, first_name: true, last_name: true },
      () => false,
      false,
    ),
  ).toEqual({});
});
