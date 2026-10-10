import queryString from "query-string";
describe("Patched decoder used by Expo Router", () => {
  it("round trips Unicode route parameters through the actual dependency", () => {
    const encoded = queryString.stringify(
      { name: "Colleague + नमस्ते", page: "2" },
      { sort: false },
    );
    expect({ ...queryString.parse(encoded) }).toEqual({
      name: "Colleague + नमस्ते",
      page: "2",
    });
  });
  it("handles malformed percent sequences without crashing navigation", () => {
    expect(() => queryString.parse("q=%E0%A4%A&value=%")).not.toThrow();
    expect(queryString.parse("q=%E0%A4%A&value=%").value).toBe("%");
  });
});
