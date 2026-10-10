import tokens from "../src/theme/tokens.json";
const luminance = (hex: string) => {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
};
const contrast = (a: string, b: string) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
};
describe.each(["light", "dark"] as const)("%s semantic contrast", (mode) => {
  const colors = tokens.colors[mode];
  it.each(["primary", "secondary", "tertiary"] as const)(
    "keeps %s text readable on each surface",
    (tone) => {
      for (const background of [
        colors.canvas,
        colors.surface,
        colors.surfaceMuted,
      ])
        expect(contrast(colors.text[tone], background)).toBeGreaterThanOrEqual(
          4.5,
        );
    },
  );
  it("keeps normal/pressed button text and busy indicators readable", () => {
    for (const [foreground, background] of [
      [colors.brand.primaryText, colors.brand.primaryFill],
      [colors.brand.primaryPressedText, colors.brand.primaryPressed],
      [colors.status.dangerButtonText, colors.status.danger],
      [colors.status.dangerPressedText, colors.status.dangerPressed],
      [colors.brand.primary, colors.surface],
    ])
      expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps status captions readable on their semantic surfaces", () => {
    for (const [foreground, background] of [
      [colors.status.successText, colors.status.successSoft],
      [colors.status.warningText, colors.status.warningSoft],
      [colors.status.dangerText, colors.status.dangerSoft],
    ])
      expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
  });
  it("distinguishes meaningful control borders and focus from each surface", () => {
    for (const background of [
      colors.canvas,
      colors.surface,
      colors.surfaceMuted,
    ]) {
      expect(contrast(colors.controlBorder, background)).toBeGreaterThanOrEqual(
        3,
      );
      expect(contrast(colors.focus, background)).toBeGreaterThanOrEqual(3);
    }
  });
});
