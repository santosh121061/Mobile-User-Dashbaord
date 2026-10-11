const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  compositeImagesAsync,
  generateImageAsync,
  generateImageBackgroundAsync,
} = require("@expo/image-utils");

const projectRoot = path.resolve(__dirname, "..");
const branding = path.join(projectRoot, "assets", "branding");
const sourceHashes = {
  "compact-logo.jpg":
    "7a00e3f8d1bdae7a2753e049176b3cfb109fc38bd3d10fc89e53ae6a7813734f",
  "favicon.png":
    "98958b780338da3560ed48f70993fff5385ca91ae19e29a2d36c83db892227e6",
};

async function main() {
  for (const [filename, expectedHash] of Object.entries(sourceHashes)) {
    const source = await fs.readFile(path.join(branding, filename));
    if (createHash("sha256").update(source).digest("hex") !== expectedHash) {
      throw new Error(`Approved branding source changed: ${filename}`);
    }
  }

  // Keep the complete supplied mark inside Android's 66/108 adaptive safe zone.
  // Only resize and pad it; the original brand files remain byte-for-byte intact.
  const canvasSize = 1024;
  const markSize = 624;
  const padding = (canvasSize - markSize) / 2;
  const { source: foreground } = await generateImageAsync(
    { projectRoot, cacheType: "approved-launcher-mark" },
    {
      src: path.join(branding, "compact-logo.jpg"),
      width: markSize,
      height: markSize,
      resizeMode: "contain",
      backgroundColor: "transparent",
    },
  );
  const background = await generateImageBackgroundAsync({
    width: canvasSize,
    height: canvasSize,
    resizeMode: "contain",
    backgroundColor: "transparent",
  });
  const result = await compositeImagesAsync({
    foreground,
    background,
    x: padding,
    y: padding,
  });
  await fs.writeFile(path.join(branding, "adaptive-foreground.png"), result);
  console.log("Generated padded adaptive foreground from verified brand assets.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
