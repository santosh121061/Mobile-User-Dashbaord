const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  {
    ignores: [
      "src/api/generated/**",
      "dist/**",
      "android/**",
      "ios/**",
      ".runtime/**",
      "docs/**",
    ],
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        process: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        console: "readonly",
      },
    },
  },
]);
