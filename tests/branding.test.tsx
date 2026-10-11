import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Image } from "react-native";
import { Brand, brandAssetUrl, selectWordmark } from "../src/components/brand";
import { brandingSchema, type Branding } from "../src/api/runtime";
import { useSession } from "../src/auth/session";
import { useTheme } from "../src/theme";
import tokens from "../src/theme/tokens.json";
import { Input } from "../src/components/ui";
import { SelectionField } from "../src/components/selection-field";
import { apiUrl } from "../src/config/environment";

jest.mock("../src/auth/session", () => ({ useSession: jest.fn() }));
jest.mock("../src/theme", () => ({
  useTheme: jest.fn(),
  tokens: jest.requireActual("../src/theme/tokens.json"),
}));
const revision = "a".repeat(64);
const mockBrand: Branding = {
  name: "Knit Infotech",
  revision,
  logo: `/branding/logo?v=${revision}`,
  dark_logo: `/branding/dark_logo?v=${revision}`,
  compact_logo: `/branding/compact_logo?v=${revision}`,
  favicon: `/branding/favicon?v=${revision}`,
};
const session = jest.mocked(useSession);
const theme = jest.mocked(useTheme);
beforeEach(() => {
  session.mockReturnValue({
    branding: mockBrand,
    bootstrap: null,
  } as ReturnType<typeof useSession>);
  theme.mockReturnValue({
    colors: tokens.colors.light,
    dark: false,
    mode: "light",
    setMode: jest.fn(),
  });
});
it("uses one real public admin wordmark on login, preserving proportions", () => {
  const screen = render(<Brand variant="auth" />);
  expect(screen.getByLabelText("Knit Infotech")).toBeTruthy();
  const images = screen.UNSAFE_getAllByType(Image);
  expect(images.map((image) => image.props.source.uri)).toEqual([
    brandAssetUrl(mockBrand.logo),
  ]);
  expect(images.every((image) => image.props.resizeMode === "contain")).toBe(
    true,
  );
  expect(screen.queryByText("U")).toBeNull();
  expect(screen.queryByText("User Dashboard")).toBeNull();
});
it("switches wordmarks for the theme and uses the admin light/dark fallback order", () => {
  expect(selectWordmark(mockBrand, true)).toBe(mockBrand.dark_logo);
  expect(selectWordmark({ ...mockBrand, dark_logo: null }, true)).toBe(
    mockBrand.logo,
  );
  expect(selectWordmark({ ...mockBrand, logo: null }, false)).toBe(
    mockBrand.dark_logo,
  );
  theme.mockReturnValue({
    colors: tokens.colors.dark,
    dark: true,
    mode: "dark",
    setMode: jest.fn(),
  });
  const screen = render(<Brand />);
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe(
    brandAssetUrl(mockBrand.dark_logo),
  );
});
it("uses bootstrap branding on refresh and recovers from a failed old asset when its revision changes", () => {
  const screen = render(<Brand />);
  fireEvent(screen.UNSAFE_getByType(Image), "error");
  expect(screen.getByText("Knit Infotech")).toBeTruthy();
  const updated = {
    ...mockBrand,
    name: "Updated workspace",
    logo: `/branding/logo?v=${"b".repeat(64)}`,
  };
  session.mockReturnValue({
    branding: mockBrand,
    bootstrap: { branding: updated },
  } as ReturnType<typeof useSession>);
  screen.rerender(<Brand />);
  expect(screen.getByLabelText("Updated workspace")).toBeTruthy();
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe(
    brandAssetUrl(updated.logo),
  );
});
it("does not advertise external, private, unversioned or malformed asset URLs", () => {
  for (const path of [
    "https://another.example/branding/logo",
    "/avatars/private.png",
    "//another.example/branding/logo",
    "/branding/logo",
    `/branding/logo?v=${revision}&token=private`,
    `/branding/../avatars/private?v=${revision}`,
  ]) {
    expect(brandAssetUrl(path)).toBeUndefined();
    expect(brandingSchema.safeParse({ ...mockBrand, logo: path }).success).toBe(
      false,
    );
  }
  expect(new URL(brandAssetUrl(mockBrand.logo)!).origin).toBe(
    new URL(apiUrl).origin,
  );
});
it("keeps compact identity derived from the configured name when artwork is absent", () => {
  session.mockReturnValue({
    branding: { ...mockBrand, compact_logo: null },
    bootstrap: null,
  } as ReturnType<typeof useSession>);
  expect(render(<Brand variant="compact" />).getByText("K")).toBeTruthy();
});
it("shows focus on the whole rounded field and preserves caller focus/blur callbacks", () => {
  const onFocus = jest.fn(),
    onBlur = jest.fn();
  const screen = render(
    <Input label="Email" onFocus={onFocus} onBlur={onBlur} />,
  );
  const input = screen.getByLabelText("Email");
  fireEvent(input, "focus", {});
  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(input.props.style[0].minHeight).toBe(48);
  fireEvent(input, "blur", {});
  expect(onBlur).toHaveBeenCalledTimes(1);
  expect(input.props.style[0].minHeight).toBe(48);
});
it("lets a selection sheet close without changing the selected value", () => {
  const screen = render(
    <SelectionField label="Role" value="Viewer">
      <Input label="Permission search" />
    </SelectionField>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Role" }));
  expect(screen.getByRole("header", { name: "Role" })).toBeTruthy();
  expect(screen.getByLabelText("Permission search")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByLabelText("Permission search")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Role" }).props.accessibilityValue,
  ).toEqual({ text: "Viewer" });
});
