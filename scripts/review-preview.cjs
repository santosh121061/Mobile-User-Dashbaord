const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const output = path.resolve(__dirname, "../.runtime/mobile-preview");
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("http://localhost:8081", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page
      .getByText("Sign in", { exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    await page.screenshot({
      path: path.join(output, "phone-login-light.png"),
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        stage: "login",
        tree: await page.locator("body").ariaSnapshot(),
        errors,
      }),
    );
    fs.writeFileSync(
      path.join(output, "browser-initial.json"),
      JSON.stringify(
        { tree: await page.locator("body").ariaSnapshot(), errors },
        null,
        2,
      ),
    );
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("preview@example.test");
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill("Preview!Local2026");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByText("Welcome back,", { exact: true })
      .waitFor({ timeout: 30000 });
    await page.screenshot({
      path: path.join(output, "phone-home-light.png"),
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        stage: "home",
        tree: await page.locator("body").ariaSnapshot(),
        errors,
      }),
    );
    for (const [width, height] of [
      [599, 900],
      [600, 900],
      [767, 1024],
      [768, 1024],
      [900, 1100],
      [1280, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: path.join(output, `home-light-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "More" }).click();
    console.log(
      JSON.stringify({
        stage: "more",
        tree: await page.locator("body").ariaSnapshot(),
        errors,
      }),
    );
    await page.getByText("Appearance", { exact: true }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.screenshot({
      path: path.join(output, "phone-preferences-dark.png"),
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        stage: "preferences",
        tree: await page.locator("body").ariaSnapshot(),
        errors,
      }),
    );
    fs.writeFileSync(
      path.join(output, "browser-review.json"),
      JSON.stringify(
        {
          errors,
          viewports: [390, 599, 600, 767, 768, 900, 1280],
          synthetic: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
